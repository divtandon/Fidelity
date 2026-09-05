"""Strict JSON serialization and loading for Fidelity validation reports."""

from __future__ import annotations

import json
import math
import os
import tempfile
from collections.abc import Mapping
from datetime import datetime
from pathlib import Path
from typing import Any, cast

from .per_class_accuracy import ClassAccuracy
from .policy import PolicyThresholds, evaluate_policy
from .report import REPORT_SCHEMA_VERSION, ValidationReport
from .significance_test import (
    MAX_EXACT_BINARY_PAIRS,
    Alternative,
    binary_correctness_signed_rank,
)

MAX_REPORT_BYTES = 5 * 1024 * 1024


class ReportSchemaError(ValueError):
    """Raised when a JSON object is not a supported Fidelity report."""


def report_to_dict(report: ValidationReport | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(report, ValidationReport):
        payload = report.to_dict()
    elif isinstance(report, Mapping):
        payload = dict(report)
    else:
        raise TypeError("report must be a ValidationReport or mapping")
    validate_report_payload(payload)
    return payload


def _exact_fields(value: Any, expected: set[str], path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ReportSchemaError(f"{path} must be an object")
    missing = sorted(expected.difference(value))
    extra = sorted(set(value).difference(expected))
    if missing:
        raise ReportSchemaError(f"{path} is missing fields: {', '.join(missing)}")
    if extra:
        raise ReportSchemaError(f"{path} has unsupported fields: {', '.join(extra)}")
    return value


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ReportSchemaError(f"{path} must be a non-empty string")
    return value


def _number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ReportSchemaError(f"{path} must be a finite number")
    try:
        number = float(value)
    except (OverflowError, ValueError) as error:
        raise ReportSchemaError(f"{path} must be a finite number") from error
    if not math.isfinite(number):
        raise ReportSchemaError(f"{path} must be a finite number")
    return number


def _integer(
    value: Any,
    path: str,
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ReportSchemaError(f"{path} must be an integer of at least {minimum}")
    if maximum is not None and value > maximum:
        raise ReportSchemaError(f"{path} must be no greater than {maximum}")
    return value


def _matches_canonical(wire_value: float, canonical_value: float) -> bool:
    """Accept the canonical float or an adjacent serialization rounding.

    A broad decimal tolerance is unsafe around an inclusive release threshold.
    Four ULPs accommodates harmless alternate arithmetic order while rejecting
    a payload that has materially edited a computed value.
    """

    if wire_value == canonical_value:
        return True
    tolerance = 4.0 * max(math.ulp(wire_value), math.ulp(canonical_value))
    return abs(wire_value - canonical_value) <= tolerance


def _enum_text(value: Any, allowed: set[str], path: str) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise ReportSchemaError(f"{path} is unsupported")
    return value


def validate_report_payload(payload: Mapping[str, Any]) -> None:
    """Validate the complete v1 contract and its internal arithmetic.

    This intentionally goes beyond shape checking.  It prevents a stale or
    hand-edited JSON file from changing an accuracy or verdict while leaving
    the underlying counts and policy evidence untouched.
    """

    top_level_fields = {
        "schema_version",
        "provenance",
        "run_id",
        "created_at",
        "model",
        "dataset",
        "sample_count",
        "reference",
        "candidate",
        "accuracy_delta_pp",
        "significance",
        "confidence_drift",
        "per_class",
        "verdict",
    }
    payload = _exact_fields(payload, top_level_fields, "report")
    if payload["schema_version"] != REPORT_SCHEMA_VERSION:
        raise ReportSchemaError(
            f"unsupported schema_version {payload['schema_version']!r}; "
            f"expected {REPORT_SCHEMA_VERSION!r}"
        )
    provenance = _exact_fields(
        payload["provenance"], {"kind", "computed"}, "provenance"
    )
    provenance_kind = _enum_text(
        provenance["kind"], {"computed", "demo"}, "provenance.kind"
    )
    provenance_computed = provenance["computed"]
    if not isinstance(provenance_computed, bool):
        raise ReportSchemaError("provenance.computed must be boolean")
    if provenance_computed != (provenance_kind == "computed"):
        raise ReportSchemaError("provenance kind and computed flag disagree")

    for field in ("run_id", "model", "dataset"):
        _text(payload[field], field)
    timestamp = _text(payload["created_at"], "created_at")
    try:
        parsed_timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except (OverflowError, ValueError) as error:
        raise ReportSchemaError("created_at must be an ISO-8601 timestamp") from error
    if parsed_timestamp.tzinfo is None or parsed_timestamp.utcoffset() is None:
        raise ReportSchemaError("created_at must include a timezone")
    sample_count = _integer(
        payload["sample_count"],
        "sample_count",
        minimum=1,
        maximum=MAX_EXACT_BINARY_PAIRS,
    )

    model_metrics: dict[str, tuple[float, int]] = {}
    for side in ("reference", "candidate"):
        metrics = _exact_fields(
            payload[side], {"precision", "top1_accuracy", "correct_count"}, side
        )
        _text(metrics["precision"], f"{side}.precision")
        accuracy = _number(metrics["top1_accuracy"], f"{side}.top1_accuracy")
        if not 0.0 <= accuracy <= 1.0:
            raise ReportSchemaError(
                f"{side}.top1_accuracy must be between zero and one"
            )
        correct_count = _integer(metrics["correct_count"], f"{side}.correct_count")
        if correct_count > sample_count:
            raise ReportSchemaError(f"{side}.correct_count exceeds sample_count")
        canonical_accuracy = correct_count / sample_count
        if not _matches_canonical(accuracy, canonical_accuracy):
            raise ReportSchemaError(
                f"{side}.top1_accuracy does not match correct_count/sample_count"
            )
        # Only integer-count-derived values are retained for later policy and
        # interpretation decisions.  Wire floats are validation evidence only.
        model_metrics[side] = (canonical_accuracy, correct_count)

    accuracy_delta_pp = _number(payload["accuracy_delta_pp"], "accuracy_delta_pp")
    canonical_delta_pp = (
        (model_metrics["candidate"][1] - model_metrics["reference"][1])
        * 100.0
        / sample_count
    )
    if not _matches_canonical(accuracy_delta_pp, canonical_delta_pp):
        raise ReportSchemaError(
            "accuracy_delta_pp does not match candidate minus reference accuracy"
        )

    significance_fields = {
        "test",
        "statistic",
        "p_value",
        "n_pairs",
        "n_nonzero",
        "method",
        "alternative",
        "valid",
        "median_difference",
        "note",
        "alpha",
        "is_significant",
        "interpretation",
    }
    significance = _exact_fields(
        payload["significance"], significance_fields, "significance"
    )
    if significance["test"] != "wilcoxon_signed_rank":
        raise ReportSchemaError(
            "significance must contain the Wilcoxon signed-rank result"
        )
    statistic = _number(significance["statistic"], "significance.statistic")
    p_value = _number(significance["p_value"], "significance.p_value")
    if statistic < 0.0 or not 0.0 <= p_value <= 1.0:
        raise ReportSchemaError(
            "significance statistic/p_value is outside its valid range"
        )
    n_pairs = _integer(significance["n_pairs"], "significance.n_pairs", minimum=1)
    n_nonzero = _integer(significance["n_nonzero"], "significance.n_nonzero")
    if n_pairs != sample_count or n_nonzero > n_pairs:
        raise ReportSchemaError(
            "significance pair counts are inconsistent with sample_count"
        )
    method = _enum_text(
        significance["method"],
        {"exact_permutation", "normal_approximation", "not_applicable"},
        "significance.method",
    )
    alternative = cast(
        Alternative,
        _enum_text(
            significance["alternative"],
            {"two-sided", "less", "greater"},
            "significance.alternative",
        ),
    )
    if alternative != "two-sided":
        raise ReportSchemaError(
            "significance.alternative must be two-sided for validation reports"
        )
    valid = significance["valid"]
    is_significant = significance["is_significant"]
    if not isinstance(valid, bool) or not isinstance(is_significant, bool):
        raise ReportSchemaError("significance validity fields must be boolean")
    if (
        valid != (method != "not_applicable")
        or (valid and n_nonzero == 0)
        or (not valid and n_nonzero != 0)
    ):
        raise ReportSchemaError(
            "significance validity, method, and pair counts disagree"
        )
    median_difference = _number(
        significance["median_difference"], "significance.median_difference"
    )
    if significance["note"] is not None and not isinstance(significance["note"], str):
        raise ReportSchemaError("significance.note must be a string or null")
    alpha = _number(significance["alpha"], "significance.alpha")
    if not 0.0 < alpha < 1.0:
        raise ReportSchemaError("significance.alpha must be between zero and one")
    net_correctness = model_metrics["candidate"][1] - model_metrics["reference"][1]
    if (n_nonzero + net_correctness) % 2 != 0:
        raise ReportSchemaError(
            "significance.n_nonzero is infeasible for the reported correct counts"
        )
    gains = (n_nonzero + net_correctness) // 2
    losses = (n_nonzero - net_correctness) // 2
    both_correct = model_metrics["reference"][1] - losses
    both_incorrect = sample_count - both_correct - gains - losses
    if min(gains, losses, both_correct, both_incorrect) < 0:
        raise ReportSchemaError(
            "significance.n_nonzero is infeasible for the reported correct counts"
        )
    expected_significance = binary_correctness_signed_rank(
        sample_count,
        gains,
        losses,
        alternative=alternative,
    )
    if (
        not _matches_canonical(statistic, expected_significance.statistic)
        or not _matches_canonical(p_value, expected_significance.p_value)
        or n_pairs != expected_significance.n_pairs
        or n_nonzero != expected_significance.n_nonzero
        or method != expected_significance.method
        or valid != expected_significance.valid
        or not _matches_canonical(
            median_difference, expected_significance.median_difference
        )
        or significance["note"] != expected_significance.note
    ):
        raise ReportSchemaError(
            "significance evidence does not match the reported correctness counts"
        )
    canonical_is_significant = (
        expected_significance.valid and expected_significance.p_value < alpha
    )
    if is_significant != canonical_is_significant:
        raise ReportSchemaError(
            "significance.is_significant disagrees with p_value and alpha"
        )
    allowed_interpretations = {
        "no_observed_pairwise_differences",
        "statistically_detectable_candidate_decrease",
        "statistically_detectable_candidate_increase",
        "statistically_detectable_pairwise_difference",
        "no_statistically_detectable_difference",
    }
    interpretation = _enum_text(
        significance["interpretation"],
        allowed_interpretations,
        "significance.interpretation",
    )
    if not expected_significance.valid:
        expected_interpretation = "no_observed_pairwise_differences"
    elif canonical_is_significant and canonical_delta_pp < 0.0:
        expected_interpretation = "statistically_detectable_candidate_decrease"
    elif canonical_is_significant and canonical_delta_pp > 0.0:
        expected_interpretation = "statistically_detectable_candidate_increase"
    elif canonical_is_significant:
        expected_interpretation = "statistically_detectable_pairwise_difference"
    else:
        expected_interpretation = "no_statistically_detectable_difference"
    if interpretation != expected_interpretation:
        raise ReportSchemaError(
            "significance.interpretation disagrees with the reported evidence"
        )

    confidence_fields = {
        "metric",
        "value",
        "direction",
        "unit",
        "epsilon",
        "sample_count",
    }
    confidence = _exact_fields(
        payload["confidence_drift"], confidence_fields, "confidence_drift"
    )
    if confidence["metric"] != "kl_divergence":
        raise ReportSchemaError("confidence_drift must contain KL divergence")
    if (
        confidence["direction"] != "reference_to_candidate"
        or confidence["unit"] != "nats"
    ):
        raise ReportSchemaError("confidence_drift direction or unit is unsupported")
    confidence_value = _number(confidence["value"], "confidence_drift.value")
    epsilon = _number(confidence["epsilon"], "confidence_drift.epsilon")
    if confidence_value < 0.0 or epsilon <= 0.0:
        raise ReportSchemaError(
            "confidence drift value and epsilon must be non-negative/positive"
        )
    if (
        _integer(confidence["sample_count"], "confidence_drift.sample_count", minimum=1)
        != sample_count
    ):
        raise ReportSchemaError(
            "confidence_drift.sample_count does not match sample_count"
        )

    per_class_payload = payload["per_class"]
    if not isinstance(per_class_payload, list) or not per_class_payload:
        raise ReportSchemaError("per_class must be a non-empty array")
    class_fields = {
        "class_id",
        "class_name",
        "sample_count",
        "reference_correct",
        "candidate_correct",
        "reference_accuracy",
        "candidate_accuracy",
        "delta_pp",
    }
    class_results: list[ClassAccuracy] = []
    seen_ids: set[int] = set()
    for index, value in enumerate(per_class_payload):
        path = f"per_class[{index}]"
        item = _exact_fields(value, class_fields, path)
        class_id = _integer(item["class_id"], f"{path}.class_id")
        if class_id in seen_ids:
            raise ReportSchemaError(f"{path}.class_id is duplicated")
        seen_ids.add(class_id)
        class_name = _text(item["class_name"], f"{path}.class_name")
        class_count = _integer(item["sample_count"], f"{path}.sample_count", minimum=1)
        reference_correct = _integer(
            item["reference_correct"], f"{path}.reference_correct"
        )
        candidate_correct = _integer(
            item["candidate_correct"], f"{path}.candidate_correct"
        )
        if reference_correct > class_count or candidate_correct > class_count:
            raise ReportSchemaError(f"{path} correct counts exceed its sample_count")
        reference_accuracy = _number(
            item["reference_accuracy"], f"{path}.reference_accuracy"
        )
        candidate_accuracy = _number(
            item["candidate_accuracy"], f"{path}.candidate_accuracy"
        )
        delta_pp = _number(item["delta_pp"], f"{path}.delta_pp")
        canonical_reference_accuracy = reference_correct / class_count
        canonical_candidate_accuracy = candidate_correct / class_count
        canonical_class_delta_pp = (
            (candidate_correct - reference_correct) * 100.0 / class_count
        )
        if not _matches_canonical(reference_accuracy, canonical_reference_accuracy):
            raise ReportSchemaError(f"{path}.reference_accuracy is inconsistent")
        if not _matches_canonical(candidate_accuracy, canonical_candidate_accuracy):
            raise ReportSchemaError(f"{path}.candidate_accuracy is inconsistent")
        if not _matches_canonical(delta_pp, canonical_class_delta_pp):
            raise ReportSchemaError(f"{path}.delta_pp is inconsistent")
        class_results.append(
            ClassAccuracy(
                class_id=class_id,
                class_name=class_name,
                sample_count=class_count,
                reference_correct=reference_correct,
                candidate_correct=candidate_correct,
            )
        )
    if [item.class_id for item in class_results] != sorted(seen_ids):
        raise ReportSchemaError("per_class rows must be ordered by class_id")
    if sum(item.sample_count for item in class_results) != sample_count:
        raise ReportSchemaError("per_class sample counts do not sum to sample_count")
    if (
        sum(item.reference_correct for item in class_results)
        != model_metrics["reference"][1]
    ):
        raise ReportSchemaError(
            "per_class reference counts disagree with reference total"
        )
    if (
        sum(item.candidate_correct for item in class_results)
        != model_metrics["candidate"][1]
    ):
        raise ReportSchemaError(
            "per_class candidate counts disagree with candidate total"
        )

    verdict = _exact_fields(
        payload["verdict"], {"status", "reasons", "policy"}, "verdict"
    )
    verdict_status = _enum_text(
        verdict["status"], {"ready", "review", "blocked"}, "verdict.status"
    )
    if not isinstance(verdict["reasons"], list) or not all(
        isinstance(reason, str) and reason for reason in verdict["reasons"]
    ):
        raise ReportSchemaError("verdict.reasons must be an array")

    policy_fields = {
        "name",
        "version",
        "alpha",
        "review_accuracy_drop_pp",
        "block_accuracy_drop_pp",
        "review_confidence_kl",
        "block_confidence_kl",
        "review_class_drop_pp",
        "block_class_drop_pp",
        "minimum_class_samples",
    }
    policy_payload = _exact_fields(verdict["policy"], policy_fields, "verdict.policy")
    try:
        policy = PolicyThresholds(
            policy_name=_text(policy_payload["name"], "verdict.policy.name"),
            policy_version=_text(policy_payload["version"], "verdict.policy.version"),
            alpha=_number(policy_payload["alpha"], "verdict.policy.alpha"),
            review_accuracy_drop_pp=_number(
                policy_payload["review_accuracy_drop_pp"],
                "verdict.policy.review_accuracy_drop_pp",
            ),
            block_accuracy_drop_pp=_number(
                policy_payload["block_accuracy_drop_pp"],
                "verdict.policy.block_accuracy_drop_pp",
            ),
            review_confidence_kl=_number(
                policy_payload["review_confidence_kl"],
                "verdict.policy.review_confidence_kl",
            ),
            block_confidence_kl=_number(
                policy_payload["block_confidence_kl"],
                "verdict.policy.block_confidence_kl",
            ),
            review_class_drop_pp=_number(
                policy_payload["review_class_drop_pp"],
                "verdict.policy.review_class_drop_pp",
            ),
            block_class_drop_pp=_number(
                policy_payload["block_class_drop_pp"],
                "verdict.policy.block_class_drop_pp",
            ),
            minimum_class_samples=_integer(
                policy_payload["minimum_class_samples"],
                "verdict.policy.minimum_class_samples",
                minimum=1,
            ),
        )
    except ValueError as error:
        raise ReportSchemaError(f"invalid verdict policy: {error}") from error
    if not _matches_canonical(float(policy.alpha), alpha):
        raise ReportSchemaError(
            "significance.alpha disagrees with verdict.policy.alpha"
        )
    expected_verdict = evaluate_policy(
        accuracy_delta_pp=canonical_delta_pp,
        confidence_kl=confidence_value,
        per_class=tuple(class_results),
        significance=expected_significance,
        thresholds=policy,
    )
    if (
        verdict_status != expected_verdict.status
        or tuple(verdict["reasons"]) != expected_verdict.reasons
    ):
        raise ReportSchemaError(
            "verdict does not match the serialized evidence and policy"
        )


def dumps_report(report: ValidationReport | Mapping[str, Any]) -> str:
    """Serialize a report deterministically and reject NaN/Infinity."""

    payload = report_to_dict(report)
    return (
        json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def write_report(
    report: ValidationReport | Mapping[str, Any], path: str | os.PathLike[str]
) -> Path:
    """Atomically write a report and return its resolved output path."""

    output = Path(path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = dumps_report(report)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=output.parent,
            prefix=f".{output.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(serialized)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        os.replace(temporary_name, output)
    finally:
        if temporary_name is not None and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return output


def load_report(
    path: str | os.PathLike[str], *, max_bytes: int = MAX_REPORT_BYTES
) -> dict[str, Any]:
    """Load a bounded UTF-8 JSON report and validate its full contract."""

    if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes < 1:
        raise ValueError("max_bytes must be a positive integer")
    input_path = Path(path).expanduser().resolve()

    def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ReportSchemaError(f"report JSON repeats object key {key!r}")
            result[key] = value
        return result

    def invalid_constant(value: str) -> Any:
        raise ReportSchemaError(f"report JSON contains non-finite number {value}")

    try:
        with input_path.open("rb") as report_file:
            if os.fstat(report_file.fileno()).st_size > max_bytes:
                raise ReportSchemaError(
                    f"report exceeds the {max_bytes}-byte size limit"
                )
            raw_payload = report_file.read(max_bytes + 1)
            if len(raw_payload) > max_bytes:
                raise ReportSchemaError(
                    f"report exceeds the {max_bytes}-byte size limit"
                )
        try:
            serialized = raw_payload.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ReportSchemaError("report is not valid UTF-8") from error
        payload = json.loads(
            serialized,
            object_pairs_hook=unique_object,
            parse_constant=invalid_constant,
        )
    except ReportSchemaError:
        raise
    except json.JSONDecodeError as error:
        raise ReportSchemaError(f"report is not valid JSON: {error.msg}") from error
    except (OverflowError, RecursionError, ValueError) as error:
        raise ReportSchemaError("report JSON contains an invalid value") from error
    try:
        validate_report_payload(payload)
    except ReportSchemaError:
        raise
    except (OverflowError, RecursionError, TypeError, ValueError) as error:
        raise ReportSchemaError("report contains malformed values") from error
    return dict(payload)
