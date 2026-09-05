"""Real PyTorch post-training quantization helpers.

PyTorch is optional at import time so the dependency-free validation engine
remains usable on Python versions for which PyTorch wheels are unavailable.
"""

from .run_ptq import (
    ClassificationOutputs,
    PTQResult,
    evaluate_classifier,
    quantize_fx_post_training,
)

__all__ = [
    "ClassificationOutputs",
    "PTQResult",
    "evaluate_classifier",
    "quantize_fx_post_training",
]
