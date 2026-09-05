"""Dependency-free paired Wilcoxon signed-rank testing.

The implementation uses the exact random-sign permutation distribution for
up to ``exact_max_n`` non-zero pairs and a tie-aware normal approximation for
larger samples.  Zero differences are excluded (Wilcox's zero method).
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from statistics import median
from typing import Any, Literal

Alternative = Literal["two-sided", "less", "greater"]


@dataclass(frozen=True, slots=True)
class WilcoxonResult:
    statistic: float
    p_value: float
    n_pairs: int
    n_nonzero: int
    method: str
    alternative: Alternative
    valid: bool
    median_difference: float
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "test": "wilcoxon_signed_rank",
            "statistic": self.statistic,
            "p_value": self.p_value,
            "n_pairs": self.n_pairs,
            "n_nonzero": self.n_nonzero,
            "method": self.method,
            "alternative": self.alternative,
            "valid": self.valid,
            "median_difference": self.median_difference,
            "note": self.note,
        }


def _numbers(values: Iterable[float], name: str) -> list[float]:
    output: list[float] = []
    for index, value in enumerate(values):
        if isinstance(value, (int, float)):
            numeric = float(value)
        else:
            raise TypeError(f"{name}[{index}] must be a finite number")
        if not math.isfinite(numeric):
            raise ValueError(f"{name}[{index}] must be a finite number")
        output.append(numeric)
    return output


def _average_ranks(absolute_differences: list[float]) -> list[float]:
    ordered = sorted(enumerate(absolute_differences), key=lambda item: item[1])
    ranks = [0.0] * len(ordered)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][1] == ordered[start][1]:
            end += 1
        # Positions are zero-based; statistical ranks are one-based.
        average_rank = ((start + 1) + end) / 2.0
        for position in range(start, end):
            ranks[ordered[position][0]] = average_rank
        start = end
    return ranks


def _exact_p_value(
    scaled_ranks: list[int], observed_scaled_positive: int, alternative: Alternative
) -> float:
    counts: dict[int, int] = {0: 1}
    for rank in scaled_ranks:
        updated: defaultdict[int, int] = defaultdict(int)
        for rank_sum, count in counts.items():
            updated[rank_sum] += count
            updated[rank_sum + rank] += count
        counts = dict(updated)

    total_rank = sum(scaled_ranks)
    permutations = 2 ** len(scaled_ranks)
    if alternative == "less":
        extreme = sum(
            count
            for rank_sum, count in counts.items()
            if rank_sum <= observed_scaled_positive
        )
    elif alternative == "greater":
        extreme = sum(
            count
            for rank_sum, count in counts.items()
            if rank_sum >= observed_scaled_positive
        )
    else:
        observed_statistic = min(
            observed_scaled_positive, total_rank - observed_scaled_positive
        )
        extreme = sum(
            count
            for rank_sum, count in counts.items()
            if min(rank_sum, total_rank - rank_sum) <= observed_statistic
        )
    return min(1.0, extreme / permutations)


def _normal_p_value(
    ranks: list[float], positive_rank_sum: float, alternative: Alternative
) -> float:
    mean = math.fsum(ranks) / 2.0
    standard_deviation = math.sqrt(math.fsum(rank * rank for rank in ranks) / 4.0)
    if standard_deviation == 0.0:
        return 1.0

    if alternative == "two-sided":
        distance = max(0.0, abs(positive_rank_sum - mean) - 0.5)
        z_score = distance / standard_deviation
        return math.erfc(z_score / math.sqrt(2.0))
    if alternative == "less":
        z_score = (positive_rank_sum - mean + 0.5) / standard_deviation
        return 0.5 * math.erfc(-z_score / math.sqrt(2.0))
    z_score = (positive_rank_sum - mean - 0.5) / standard_deviation
    return 0.5 * math.erfc(z_score / math.sqrt(2.0))


def wilcoxon_signed_rank(
    reference_values: Iterable[float],
    candidate_values: Iterable[float],
    *,
    alternative: Alternative = "two-sided",
    zero_tolerance: float = 0.0,
    exact_max_n: int = 30,
) -> WilcoxonResult:
    """Test paired ``candidate - reference`` differences.

    ``alternative='less'`` tests whether candidate values tend to be lower.
    The default two-sided form is used by Fidelity's report builder.
    """

    if alternative not in {"two-sided", "less", "greater"}:
        raise ValueError("alternative must be 'two-sided', 'less', or 'greater'")
    if (
        not isinstance(exact_max_n, int)
        or isinstance(exact_max_n, bool)
        or exact_max_n < 1
    ):
        raise ValueError("exact_max_n must be a positive integer")
    if isinstance(zero_tolerance, bool) or not isinstance(zero_tolerance, (int, float)):
        raise TypeError("zero_tolerance must be a finite non-negative number")
    zero_tolerance = float(zero_tolerance)
    if not math.isfinite(zero_tolerance) or zero_tolerance < 0.0:
        raise ValueError("zero_tolerance must be a finite non-negative number")

    reference = _numbers(reference_values, "reference_values")
    candidate = _numbers(candidate_values, "candidate_values")
    if len(reference) != len(candidate):
        raise ValueError("paired reference and candidate values must have equal length")
    if not reference:
        raise ValueError("at least one paired observation is required")

    all_differences = [
        candidate_value - reference_value
        for reference_value, candidate_value in zip(reference, candidate, strict=True)
    ]
    differences = [
        difference for difference in all_differences if abs(difference) > zero_tolerance
    ]
    if not differences:
        return WilcoxonResult(
            statistic=0.0,
            p_value=1.0,
            n_pairs=len(all_differences),
            n_nonzero=0,
            method="not_applicable",
            alternative=alternative,
            valid=False,
            median_difference=median(all_differences),
            note="All paired differences are zero; the signed-rank statistic is undefined.",
        )

    ranks = _average_ranks([abs(difference) for difference in differences])
    positive_rank_sum = math.fsum(
        rank
        for rank, difference in zip(ranks, differences, strict=True)
        if difference > 0.0
    )
    negative_rank_sum = math.fsum(ranks) - positive_rank_sum
    statistic = (
        min(positive_rank_sum, negative_rank_sum)
        if alternative == "two-sided"
        else positive_rank_sum
    )

    if len(differences) <= exact_max_n:
        # Average ranks are integer or half-integer, so doubling retains exact
        # rank sums for the permutation distribution.
        scaled_ranks = [round(rank * 2.0) for rank in ranks]
        p_value = _exact_p_value(
            scaled_ranks,
            round(positive_rank_sum * 2.0),
            alternative,
        )
        method = "exact_permutation"
        note = None
    else:
        p_value = _normal_p_value(ranks, positive_rank_sum, alternative)
        method = "normal_approximation"
        note = "Tie-aware normal approximation with continuity correction."

    return WilcoxonResult(
        statistic=statistic,
        p_value=max(0.0, min(1.0, p_value)),
        n_pairs=len(all_differences),
        n_nonzero=len(differences),
        method=method,
        alternative=alternative,
        valid=True,
        median_difference=median(all_differences),
        note=note,
    )
