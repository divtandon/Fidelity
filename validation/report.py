"""Versioned validation report construction."""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .confidence_drift import ConfidenceDriftResult, mean_kl_divergence
from .per_class_accuracy import ClassAccuracy, compute_per_class_accuracy
from .policy import PolicyThresholds, PolicyVerdict, evaluate_policy
from .significance_test import (
    MAX_EXACT_BINARY_PAIRS,
    WilcoxonResult,
    wilcoxon_signed_rank,
)

REPORT_SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True, slots=True)
class ReportProvenance:
    """Machine-readable origin marker for report consumers."""

    kind: str
    computed: bool

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "computed": self.computed}


@dataclass(frozen=True, slots=True)
class ModelMetrics:
    precision: str
    top1_accuracy: float
    correct_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "precision": self.precision,
            "top1_accuracy": self.top1_accuracy,
            "correct_count": self.correct_count,
        }


@dataclass(frozen=True, slots=True)
class SignificanceEvidence:
    result: WilcoxonResult
    alpha: float
    is_significant: bool
    interpretation: str

    def to_dict(self) -> dict[str, Any]:
        value = self.result.to_dict()
        value.update(
            {
                "alpha": self.alpha,
                "is_significant": self.is_significant,
                "interpretation": self.interpretation,
            }
        )
        return value


@dataclass(frozen=True, slots=True)
class ValidationReport:
    schema_version: str
    provenance: ReportProvenance
    run_id: str
    created_at: str
    model: str
    dataset: str
    sample_count: int
    reference: ModelMetrics
    candidate: ModelMetrics
    accuracy_delta_pp: float
    significance: SignificanceEvidence
    confidence_drift: ConfidenceDriftResult
    per_class: tuple[ClassAccuracy, ...]
    verdict: PolicyVerdict

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "provenance": self.provenance.to_dict(),
            "run_id": self.run_id,
            "created_at": self.created_at,
            "model": self.model,
            "dataset": self.dataset,
            "sample_count": self.sample_count,
            "reference": self.reference.to_dict(),
            "candidate": self.candidate.to_dict(),
            "accuracy_delta_pp": self.accuracy_delta_pp,
            "significance": self.significance.to_dict(),
            "confidence_drift": self.confidence_drift.to_dict(),
            "per_class": [item.to_dict() for item in self.per_class],
            "verdict": self.verdict.to_dict(),
        }


def _required_text(value: str, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return value.strip()


def _utc_timestamp(value: str | datetime) -> str:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError as error:
            raise ValueError("created_at must be an ISO-8601 timestamp") from error
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise TypeError("created_at must be an ISO-8601 string or datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("created_at must include a timezone")
    return (
        parsed.astimezone(timezone.utc)
        .isoformat(timespec="auto")
        .replace("+00:00", "Z")
    )


def _labels(values: Iterable[int], name: str) -> list[int]:
    result = list(values)
    for index, value in enumerate(result):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{name}[{index}] must be a non-negative integer class id")
    return result


def _probability_rows(
    values: Iterable[Iterable[float]],
    name: str,
) -> tuple[list[list[float]], int | None]:
    """Materialize and validate a probability matrix exactly once."""

    rows: list[list[float]] = []
    expected_width: int | None = None
    for row_index, values_row in enumerate(values):
        row = list(values_row)
        if not row:
            raise ValueError(f"{name}[{row_index}] must contain at least one class")
        if expected_width is None:
            expected_width = len(row)
        elif len(row) != expected_width:
            raise ValueError(
                f"{name}[{row_index}] has class width {len(row)}; "
                f"expected {expected_width}"
            )

        numeric_row: list[float] = []
        for class_id, value in enumerate(row):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(
                    f"{name}[{row_index}][{class_id}] must be a finite number"
                )
            try:
                numeric = float(value)
            except (OverflowError, ValueError) as error:
                raise ValueError(
                    f"{name}[{row_index}][{class_id}] must be a finite number"
                ) from error
            if not math.isfinite(numeric):
                raise ValueError(
                    f"{name}[{row_index}][{class_id}] must be a finite number"
                )
            if numeric < 0.0:
                raise ValueError(f"{name}[{row_index}][{class_id}] cannot be negative")
            numeric_row.append(numeric)
        rows.append(numeric_row)

    return rows, expected_width


def _validate_class_range(values: Sequence[int], name: str, class_width: int) -> None:
    for row_index, value in enumerate(values):
        if value >= class_width:
            raise ValueError(
                f"{name}[{row_index}] class id {value} is outside the probability "
                f"class range [0, {class_width})"
            )


def _validate_probability_argmax(
    predictions: Sequence[int],
    probabilities: Sequence[Sequence[float]],
    name: str,
) -> None:
    for row_index, (prediction, probability_row) in enumerate(
        zip(predictions, probabilities, strict=True)
    ):
        # range() is ascending and max() keeps the first equal maximum, so ties
        # deterministically resolve to the smallest class id.
        expected = max(range(len(probability_row)), key=probability_row.__getitem__)
        if prediction != expected:
            raise ValueError(
                f"{name}[{row_index}] is {prediction}, but probability argmax is "
                f"class {expected}"
            )


def build_validation_report(
    *,
    run_id: str,
    created_at: str | datetime,
    model: str,
    dataset: str,
    targets: Iterable[int],
    reference_predictions: Iterable[int],
    candidate_predictions: Iterable[int],
    reference_probabilities: Iterable[Iterable[float]],
    candidate_probabilities: Iterable[Iterable[float]],
    class_names: Sequence[str] | Mapping[int, str] | None = None,
    reference_precision: str = "FP32",
    candidate_precision: str = "INT8",
    confidence_epsilon: float = 1e-12,
    policy: PolicyThresholds | None = None,
) -> ValidationReport:
    """Build a report exclusively from observed evaluation outputs.

    ``created_at`` is required instead of silently using the wall clock.  This
    keeps repeated builds deterministic and makes provenance the caller's
    explicit responsibility.  Each prediction must match the top probability
    in its corresponding row.  If multiple classes tie for the maximum, the
    smallest class id (the first maximum) is the required prediction.
    """

    run_id = _required_text(run_id, "run_id")
    model = _required_text(model, "model")
    dataset = _required_text(dataset, "dataset")
    reference_precision = _required_text(reference_precision, "reference_precision")
    candidate_precision = _required_text(candidate_precision, "candidate_precision")
    timestamp = _utc_timestamp(created_at)

    target_values = _labels(targets, "targets")
    reference_values = _labels(reference_predictions, "reference_predictions")
    candidate_values = _labels(candidate_predictions, "candidate_predictions")
    lengths = {len(target_values), len(reference_values), len(candidate_values)}
    if len(lengths) != 1:
        raise ValueError("targets and both prediction sequences must have equal length")
    if not target_values:
        raise ValueError("at least one evaluated sample is required")
    if len(target_values) > MAX_EXACT_BINARY_PAIRS:
        raise ValueError(
            "evaluated samples cannot exceed "
            f"MAX_EXACT_BINARY_PAIRS ({MAX_EXACT_BINARY_PAIRS:,})"
        )

    reference_rows, reference_width = _probability_rows(
        reference_probabilities, "reference_probabilities"
    )
    candidate_rows, candidate_width = _probability_rows(
        candidate_probabilities, "candidate_probabilities"
    )
    if len(reference_rows) != len(candidate_rows):
        raise ValueError(
            "reference and candidate probability rows must have equal length"
        )
    if len(reference_rows) != len(target_values):
        raise ValueError(
            "probability row count must equal the number of targets and predictions"
        )
    if reference_width != candidate_width:
        raise ValueError(
            "reference and candidate probabilities must have the same class width"
        )
    if reference_width is None:
        # The non-empty target and row-count checks make this unreachable, but
        # retaining the guard keeps the type and invariant explicit.
        raise ValueError("probability rows must contain at least one class")

    _validate_class_range(target_values, "targets", reference_width)
    _validate_class_range(reference_values, "reference_predictions", reference_width)
    _validate_class_range(candidate_values, "candidate_predictions", reference_width)
    _validate_probability_argmax(
        reference_values, reference_rows, "reference_predictions"
    )
    _validate_probability_argmax(
        candidate_values, candidate_rows, "candidate_predictions"
    )

    per_class = compute_per_class_accuracy(
        target_values,
        reference_values,
        candidate_values,
        class_names=class_names,
    )
    sample_count = len(target_values)
    reference_correctness = [
        int(prediction == target)
        for target, prediction in zip(target_values, reference_values, strict=True)
    ]
    candidate_correctness = [
        int(prediction == target)
        for target, prediction in zip(target_values, candidate_values, strict=True)
    ]
    reference_correct = sum(reference_correctness)
    candidate_correct = sum(candidate_correctness)
    reference_accuracy = reference_correct / sample_count
    candidate_accuracy = candidate_correct / sample_count
    accuracy_delta_pp = (candidate_correct - reference_correct) * 100.0 / sample_count

    drift = mean_kl_divergence(
        reference_rows,
        candidate_rows,
        epsilon=confidence_epsilon,
    )

    wilcoxon = wilcoxon_signed_rank(reference_correctness, candidate_correctness)
    active_policy = policy or PolicyThresholds()
    is_significant = wilcoxon.valid and wilcoxon.p_value < active_policy.alpha
    if not wilcoxon.valid:
        interpretation = "no_observed_pairwise_differences"
    elif is_significant and accuracy_delta_pp < 0.0:
        interpretation = "statistically_detectable_candidate_decrease"
    elif is_significant and accuracy_delta_pp > 0.0:
        interpretation = "statistically_detectable_candidate_increase"
    elif is_significant:
        interpretation = "statistically_detectable_pairwise_difference"
    else:
        interpretation = "no_statistically_detectable_difference"
    significance = SignificanceEvidence(
        result=wilcoxon,
        alpha=active_policy.alpha,
        is_significant=is_significant,
        interpretation=interpretation,
    )
    verdict = evaluate_policy(
        accuracy_delta_pp=accuracy_delta_pp,
        confidence_kl=drift.value,
        per_class=per_class,
        significance=wilcoxon,
        thresholds=active_policy,
    )

    return ValidationReport(
        schema_version=REPORT_SCHEMA_VERSION,
        provenance=ReportProvenance(kind="computed", computed=True),
        run_id=run_id,
        created_at=timestamp,
        model=model,
        dataset=dataset,
        sample_count=sample_count,
        reference=ModelMetrics(
            precision=reference_precision,
            top1_accuracy=reference_accuracy,
            correct_count=reference_correct,
        ),
        candidate=ModelMetrics(
            precision=candidate_precision,
            top1_accuracy=candidate_accuracy,
            correct_count=candidate_correct,
        ),
        accuracy_delta_pp=accuracy_delta_pp,
        significance=significance,
        confidence_drift=drift,
        per_class=per_class,
        verdict=verdict,
    )
