"""Command-line interface for the reproducible CIFAR-10 pipeline."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from .runner import PipelineConfig, run_pipeline


def _positive_int(value: str) -> int:
    try:
        result = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be an integer") from error
    if result < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return result


def _non_negative_int(value: str) -> int:
    try:
        result = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be an integer") from error
    if result < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline",
        description=(
            "Train or resume a CIFAR-10 ResNet-18, execute real FX static INT8 "
            "PTQ, and write a computed paired Fidelity report."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--data-dir", type=Path, default=Path("data/cifar10"))
    parser.add_argument("--artifacts-dir", type=Path, default=Path("artifacts/runs"))
    parser.add_argument(
        "--run-id",
        help="Optional stable artifact directory name (letters, numbers, ., _, -).",
    )
    parser.add_argument(
        "--resume",
        dest="resume_checkpoint",
        type=Path,
        help="FP32 Fidelity checkpoint to resume; --epochs is the total target epoch count.",
    )
    parser.add_argument("--epochs", type=_non_negative_int, default=20)
    parser.add_argument("--train-batch-size", type=_positive_int, default=128)
    parser.add_argument("--evaluation-batch-size", type=_positive_int, default=256)
    parser.add_argument("--num-workers", type=_non_negative_int, default=2)
    parser.add_argument("--learning-rate", type=float, default=0.1)
    parser.add_argument("--min-learning-rate", type=float, default=1e-5)
    parser.add_argument("--momentum", type=float, default=0.9)
    parser.add_argument("--weight-decay", type=float, default=5e-4)
    parser.add_argument("--calibration-samples", type=_positive_int, default=1024)
    parser.add_argument("--max-calibration-batches", type=_positive_int, default=16)
    parser.add_argument(
        "--quantization-backend",
        default="auto",
        help="PyTorch quantized CPU engine (auto selects onednn, x86, fbgemm, qnnpack, or another installed engine).",
    )
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--checkpoint-every", type=_positive_int, default=1)
    parser.add_argument(
        "--download",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Download CIFAR-10 when it is absent (use --no-download for offline runs).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    config = PipelineConfig(
        data_dir=arguments.data_dir,
        artifacts_dir=arguments.artifacts_dir,
        run_id=arguments.run_id,
        resume_checkpoint=arguments.resume_checkpoint,
        epochs=arguments.epochs,
        train_batch_size=arguments.train_batch_size,
        evaluation_batch_size=arguments.evaluation_batch_size,
        num_workers=arguments.num_workers,
        learning_rate=arguments.learning_rate,
        min_learning_rate=arguments.min_learning_rate,
        momentum=arguments.momentum,
        weight_decay=arguments.weight_decay,
        calibration_samples=arguments.calibration_samples,
        max_calibration_batches=arguments.max_calibration_batches,
        quantization_backend=arguments.quantization_backend,
        device=arguments.device,
        seed=arguments.seed,
        checkpoint_every=arguments.checkpoint_every,
        download=arguments.download,
    )
    try:
        result = run_pipeline(config)
    except (FileNotFoundError, RuntimeError, TypeError, ValueError) as error:
        print(f"Fidelity pipeline failed: {error}")
        return 2
    print(
        "Completed computed evidence run "
        f"{result.run_id}: FP32 {result.reference_accuracy:.6%}; "
        f"INT8 {result.candidate_accuracy:.6%}; report {result.report_path}"
    )
    return 0
