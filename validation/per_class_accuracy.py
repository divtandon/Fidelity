"""Per-class top-1 accuracy calculations."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ClassAccuracy:
    """Observed accuracy for one ground-truth class."""

    class_id: int
    class_name: str
    sample_count: int
    reference_correct: int
    candidate_correct: int

    @property
    def reference_accuracy(self) -> float:
        return self.reference_correct / self.sample_count

    @property
    def candidate_accuracy(self) -> float:
        return self.candidate_correct / self.sample_count

    @property
    def delta_pp(self) -> float:
        """Candidate minus reference accuracy, in percentage points."""

        return (
            (self.candidate_correct - self.reference_correct)
            * 100.0
            / self.sample_count
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "class_id": self.class_id,
            "class_name": self.class_name,
            "sample_count": self.sample_count,
            "reference_correct": self.reference_correct,
            "candidate_correct": self.candidate_correct,
            "reference_accuracy": self.reference_accuracy,
            "candidate_accuracy": self.candidate_accuracy,
            "delta_pp": self.delta_pp,
        }


def _materialize_labels(values: Iterable[int], name: str) -> list[int]:
    result = list(values)
    for index, value in enumerate(result):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(f"{name}[{index}] must be an integer class id")
        if value < 0:
            raise ValueError(f"{name}[{index}] must be non-negative")
    return result


def _class_name(
    class_id: int,
    class_names: Sequence[str] | Mapping[int, str] | None,
) -> str:
    if class_names is None:
        return str(class_id)
    if isinstance(class_names, Mapping):
        if class_id not in class_names:
            raise ValueError(f"class_names has no entry for class id {class_id}")
        value = class_names[class_id]
    else:
        if class_id >= len(class_names):
            raise ValueError(f"class_names has no entry for class id {class_id}")
        value = class_names[class_id]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"class name for class id {class_id} must be non-empty")
    return value


def compute_per_class_accuracy(
    targets: Iterable[int],
    reference_predictions: Iterable[int],
    candidate_predictions: Iterable[int],
    *,
    class_names: Sequence[str] | Mapping[int, str] | None = None,
) -> tuple[ClassAccuracy, ...]:
    """Compute reference and candidate top-1 accuracy for every observed class.

    Classes are ordered by numeric class id.  Only ground-truth classes are
    emitted; a predicted class that does not occur in ``targets`` is still
    counted as an error but does not create a misleading empty class row.
    """

    target_values = _materialize_labels(targets, "targets")
    reference_values = _materialize_labels(
        reference_predictions, "reference_predictions"
    )
    candidate_values = _materialize_labels(
        candidate_predictions, "candidate_predictions"
    )

    lengths = {len(target_values), len(reference_values), len(candidate_values)}
    if len(lengths) != 1:
        raise ValueError("targets and both prediction sequences must have equal length")
    if not target_values:
        raise ValueError("at least one evaluated sample is required")

    counts: dict[int, list[int]] = {}
    for target, reference, candidate in zip(
        target_values, reference_values, candidate_values, strict=True
    ):
        # [sample_count, reference_correct, candidate_correct]
        bucket = counts.setdefault(target, [0, 0, 0])
        bucket[0] += 1
        bucket[1] += int(reference == target)
        bucket[2] += int(candidate == target)

    return tuple(
        ClassAccuracy(
            class_id=class_id,
            class_name=_class_name(class_id, class_names),
            sample_count=counts[class_id][0],
            reference_correct=counts[class_id][1],
            candidate_correct=counts[class_id][2],
        )
        for class_id in sorted(counts)
    )
