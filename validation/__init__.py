"""Deterministic statistical validation for compressed classifiers.

The package deliberately has no mandatory third-party dependencies.  Model
execution belongs in :mod:`quantize`; this package only consumes observed
predictions, labels, and probabilities and never manufactures model results.
"""

from .confidence_drift import ConfidenceDriftResult, mean_kl_divergence
from .per_class_accuracy import ClassAccuracy, compute_per_class_accuracy
from .policy import PolicyThresholds, PolicyVerdict, evaluate_policy
from .report import (
    REPORT_SCHEMA_VERSION,
    ReportProvenance,
    ValidationReport,
    build_validation_report,
)
from .significance_test import (
    MAX_EXACT_BINARY_PAIRS,
    WilcoxonResult,
    binary_correctness_signed_rank,
    wilcoxon_signed_rank,
)

__all__ = [
    "MAX_EXACT_BINARY_PAIRS",
    "REPORT_SCHEMA_VERSION",
    "ClassAccuracy",
    "ConfidenceDriftResult",
    "PolicyThresholds",
    "PolicyVerdict",
    "ReportProvenance",
    "ValidationReport",
    "WilcoxonResult",
    "binary_correctness_signed_rank",
    "build_validation_report",
    "compute_per_class_accuracy",
    "evaluate_policy",
    "mean_kl_divergence",
    "wilcoxon_signed_rank",
]
