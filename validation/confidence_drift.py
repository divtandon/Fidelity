"""Confidence distribution drift metrics."""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ConfidenceDriftResult:
    """Mean per-sample KL divergence from reference to candidate."""

    value: float
    per_sample: tuple[float, ...]
    epsilon: float

    @property
    def sample_count(self) -> int:
        return len(self.per_sample)

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric": "kl_divergence",
            "value": self.value,
            "direction": "reference_to_candidate",
            "unit": "nats",
            "epsilon": self.epsilon,
            "sample_count": self.sample_count,
        }


def _normalize_row(values: Iterable[float], name: str, row_index: int) -> list[float]:
    row = list(values)
    if not row:
        raise ValueError(f"{name}[{row_index}] must contain at least one class")
    normalized: list[float] = []
    for column, value in enumerate(row):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"{name}[{row_index}][{column}] must be a finite number")
        numeric = float(value)
        if not math.isfinite(numeric):
            raise ValueError(f"{name}[{row_index}][{column}] must be a finite number")
        if numeric < 0.0:
            raise ValueError(f"{name}[{row_index}][{column}] cannot be negative")
        normalized.append(numeric)
    total = math.fsum(normalized)
    if total <= 0.0:
        raise ValueError(f"{name}[{row_index}] must have positive probability mass")
    return [value / total for value in normalized]


def mean_kl_divergence(
    reference_probabilities: Iterable[Iterable[float]],
    candidate_probabilities: Iterable[Iterable[float]],
    *,
    epsilon: float = 1e-12,
) -> ConfidenceDriftResult:
    """Return mean ``KL(reference || candidate)`` over evaluated samples.

    Rows are normalized, so callers may provide probabilities affected by
    ordinary floating-point summation error.  Additive smoothing is applied to
    both distributions and recorded in the result.  Natural logarithms make
    the output unit nats.
    """

    if isinstance(epsilon, bool) or not isinstance(epsilon, (int, float)):
        raise TypeError("epsilon must be a finite positive number")
    epsilon = float(epsilon)
    if not math.isfinite(epsilon) or epsilon <= 0.0:
        raise ValueError("epsilon must be a finite positive number")

    reference_rows = list(reference_probabilities)
    candidate_rows = list(candidate_probabilities)
    if len(reference_rows) != len(candidate_rows):
        raise ValueError(
            "reference and candidate probability rows must have equal length"
        )
    if not reference_rows:
        raise ValueError("at least one probability row is required")

    divergences: list[float] = []
    expected_width: int | None = None
    for row_index, (reference_row, candidate_row) in enumerate(
        zip(reference_rows, candidate_rows, strict=True)
    ):
        reference = _normalize_row(reference_row, "reference_probabilities", row_index)
        candidate = _normalize_row(candidate_row, "candidate_probabilities", row_index)
        if len(reference) != len(candidate):
            raise ValueError(
                f"probability row {row_index} has different reference and candidate widths"
            )
        if expected_width is None:
            expected_width = len(reference)
        elif len(reference) != expected_width:
            raise ValueError(
                f"probability row {row_index} has a different class width from earlier rows"
            )

        width = len(reference)
        smooth_denominator = 1.0 + epsilon * width
        smoothed_reference = [
            (probability + epsilon) / smooth_denominator for probability in reference
        ]
        smoothed_candidate = [
            (probability + epsilon) / smooth_denominator for probability in candidate
        ]
        divergence = math.fsum(
            p * math.log(p / q)
            for p, q in zip(smoothed_reference, smoothed_candidate, strict=True)
        )
        # KL is mathematically non-negative.  Roundoff can produce a tiny
        # negative value for effectively identical distributions.
        if divergence < 0.0 and divergence > -1e-15:
            divergence = 0.0
        divergences.append(divergence)

    return ConfidenceDriftResult(
        value=math.fsum(divergences) / len(divergences),
        per_sample=tuple(divergences),
        epsilon=epsilon,
    )
