"""Executable, reproducible CIFAR-10 compression pipeline.

The package deliberately contains orchestration only.  Quantization and
statistical calculations remain owned by :mod:`quantize` and :mod:`validation`
so the command line produces the same evidence that other integrations use.
"""

from .runner import PipelineConfig, PipelineResult, run_pipeline

__all__ = ["PipelineConfig", "PipelineResult", "run_pipeline"]
