"""Backend-owned release policy for validation reports.

The policy intentionally separates three states:

``ready``
    No configured guardrail was crossed.
``review``
    A caution threshold or statistically detectable accuracy decrease was
    observed; a human should inspect the evidence.
``blocked``
    A material guardrail was crossed; this run should not proceed unchanged.

Thresholds are serialized with every report so a verdict remains auditable.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from .per_class_accuracy import ClassAccuracy
from .significance_test import WilcoxonResult

VerdictStatus = Literal["ready", "review", "blocked"]


@dataclass(frozen=True, slots=True)
class PolicyThresholds:
    policy_name: str = "fidelity_default"
    policy_version: str = "1.0.0"
    alpha: float = 0.05
    review_accuracy_drop_pp: float = 0.5
    block_accuracy_drop_pp: float = 2.0
    review_confidence_kl: float = 0.02
    block_confidence_kl: float = 0.10
    review_class_drop_pp: float = 2.0
    block_class_drop_pp: float = 10.0
    minimum_class_samples: int = 1

    def __post_init__(self) -> None:
        finite_values = (
            self.alpha,
            self.review_accuracy_drop_pp,
            self.block_accuracy_drop_pp,
            self.review_confidence_kl,
            self.block_confidence_kl,
            self.review_class_drop_pp,
            self.block_class_drop_pp,
        )
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            for value in finite_values
        ):
            raise ValueError("all policy thresholds must be finite numbers")
        if not 0.0 < self.alpha < 1.0:
            raise ValueError("alpha must be between zero and one")
        if min(finite_values[1:]) < 0.0:
            raise ValueError("drop and drift thresholds cannot be negative")
        if self.block_accuracy_drop_pp < self.review_accuracy_drop_pp:
            raise ValueError(
                "block accuracy threshold must be at least the review threshold"
            )
        if self.block_confidence_kl < self.review_confidence_kl:
            raise ValueError("block KL threshold must be at least the review threshold")
        if self.block_class_drop_pp < self.review_class_drop_pp:
            raise ValueError(
                "block class threshold must be at least the review threshold"
            )
        if (
            not isinstance(self.minimum_class_samples, int)
            or isinstance(self.minimum_class_samples, bool)
            or self.minimum_class_samples < 1
        ):
            raise ValueError("minimum_class_samples must be a positive integer")
        if not self.policy_name.strip() or not self.policy_version.strip():
            raise ValueError("policy name and version must be non-empty")

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.policy_name,
            "version": self.policy_version,
            "alpha": self.alpha,
            "review_accuracy_drop_pp": self.review_accuracy_drop_pp,
            "block_accuracy_drop_pp": self.block_accuracy_drop_pp,
            "review_confidence_kl": self.review_confidence_kl,
            "block_confidence_kl": self.block_confidence_kl,
            "review_class_drop_pp": self.review_class_drop_pp,
            "block_class_drop_pp": self.block_class_drop_pp,
            "minimum_class_samples": self.minimum_class_samples,
        }


@dataclass(frozen=True, slots=True)
class PolicyVerdict:
    status: VerdictStatus
    reasons: tuple[str, ...]
    policy: PolicyThresholds

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "reasons": list(self.reasons),
            "policy": self.policy.to_dict(),
        }


def evaluate_policy(
    *,
    accuracy_delta_pp: float,
    confidence_kl: float,
    per_class: tuple[ClassAccuracy, ...],
    significance: WilcoxonResult,
    thresholds: PolicyThresholds | None = None,
) -> PolicyVerdict:
    """Derive an auditable verdict from computed validation evidence."""

    policy = thresholds or PolicyThresholds()
    if not math.isfinite(accuracy_delta_pp) or not math.isfinite(confidence_kl):
        raise ValueError("policy metrics must be finite")
    if confidence_kl < 0.0:
        raise ValueError("confidence KL divergence cannot be negative")
    if not per_class:
        raise ValueError("policy requires at least one per-class result")

    eligible_classes = tuple(
        item for item in per_class if item.sample_count >= policy.minimum_class_samples
    )
    if not eligible_classes:
        return PolicyVerdict(
            status="blocked",
            reasons=(
                "No class has enough evaluated samples for the configured policy.",
            ),
            policy=policy,
        )

    accuracy_drop = max(0.0, -accuracy_delta_pp)
    worst_class = min(eligible_classes, key=lambda item: (item.delta_pp, item.class_id))
    worst_class_drop = max(0.0, -worst_class.delta_pp)
    blocked_reasons: list[str] = []
    review_reasons: list[str] = []

    if accuracy_drop >= policy.block_accuracy_drop_pp:
        blocked_reasons.append(
            f"Overall accuracy dropped {accuracy_drop:.3f} pp, meeting the "
            f"{policy.block_accuracy_drop_pp:.3f} pp block threshold."
        )
    elif accuracy_drop >= policy.review_accuracy_drop_pp:
        review_reasons.append(
            f"Overall accuracy dropped {accuracy_drop:.3f} pp, meeting the "
            f"{policy.review_accuracy_drop_pp:.3f} pp review threshold."
        )

    if confidence_kl >= policy.block_confidence_kl:
        blocked_reasons.append(
            f"Confidence KL drift was {confidence_kl:.6f}, meeting the "
            f"{policy.block_confidence_kl:.6f} block threshold."
        )
    elif confidence_kl >= policy.review_confidence_kl:
        review_reasons.append(
            f"Confidence KL drift was {confidence_kl:.6f}, meeting the "
            f"{policy.review_confidence_kl:.6f} review threshold."
        )

    class_context = f"{worst_class.class_name} (class {worst_class.class_id})"
    if worst_class_drop >= policy.block_class_drop_pp:
        blocked_reasons.append(
            f"{class_context} accuracy dropped {worst_class_drop:.3f} pp, meeting the "
            f"{policy.block_class_drop_pp:.3f} pp class block threshold."
        )
    elif worst_class_drop >= policy.review_class_drop_pp:
        review_reasons.append(
            f"{class_context} accuracy dropped {worst_class_drop:.3f} pp, meeting the "
            f"{policy.review_class_drop_pp:.3f} pp class review threshold."
        )

    if (
        significance.valid
        and accuracy_delta_pp < 0.0
        and significance.p_value < policy.alpha
    ):
        review_reasons.append(
            "The paired Wilcoxon test detected an accuracy decrease "
            f"(p={significance.p_value:.6g}, alpha={policy.alpha:.6g})."
        )

    if blocked_reasons:
        return PolicyVerdict("blocked", tuple(blocked_reasons + review_reasons), policy)
    if review_reasons:
        return PolicyVerdict("review", tuple(review_reasons), policy)
    return PolicyVerdict("ready", (), policy)
