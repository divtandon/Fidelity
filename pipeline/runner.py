"""Orchestrate a real, paired FP32-to-INT8 CIFAR-10 validation run."""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import random
import re
import struct
import tempfile
from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from quantize.run_ptq import (
    ClassificationOutputs,
    evaluate_classifier,
    quantize_fx_post_training,
)
from validation.report import build_validation_report
from validation.serializer import write_report

from .data import (
    CIFAR10_CLASSES,
    CifarLoaders,
    build_cifar10_loaders,
    set_loader_epoch_seed,
)
from .model import (
    ARCHITECTURE_ID,
    atomic_torch_save,
    build_resnet18_cifar10,
    load_checkpoint,
    save_checkpoint,
)

DeviceChoice = Literal["auto", "cpu", "cuda"]
_RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")


@dataclass(frozen=True, slots=True)
class PipelineConfig:
    """Every meaningful execution choice, with safe local defaults."""

    data_dir: Path = Path("data/cifar10")
    artifacts_dir: Path = Path("artifacts/runs")
    latest_report_path: Path = Path("artifacts/latest-report.json")
    run_id: str | None = None
    resume_checkpoint: Path | None = None
    epochs: int = 20
    train_batch_size: int = 128
    evaluation_batch_size: int = 256
    num_workers: int = 2
    learning_rate: float = 0.1
    min_learning_rate: float = 1e-5
    momentum: float = 0.9
    weight_decay: float = 5e-4
    calibration_samples: int = 1024
    max_calibration_batches: int = 16
    quantization_backend: str = "auto"
    device: DeviceChoice = "auto"
    seed: int = 2026
    checkpoint_every: int = 1
    download: bool = False

    def validate(self) -> None:
        if self.device not in {"auto", "cpu", "cuda"}:
            raise ValueError("device must be one of: auto, cpu, cuda")
        if self.epochs < 0:
            raise ValueError("epochs cannot be negative")
        if self.epochs == 0 and self.resume_checkpoint is None:
            raise ValueError(
                "--epochs 0 requires --resume; an untrained model is not evidence"
            )
        if self.train_batch_size < 1 or self.evaluation_batch_size < 1:
            raise ValueError("batch sizes must be positive")
        if self.num_workers < 0:
            raise ValueError("num_workers cannot be negative")
        optimizer_values = (
            self.learning_rate,
            self.min_learning_rate,
            self.momentum,
            self.weight_decay,
        )
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            for value in optimizer_values
        ) or (
            self.learning_rate <= 0.0
            or self.min_learning_rate < 0.0
            or self.min_learning_rate > self.learning_rate
            or self.momentum < 0.0
            or self.weight_decay < 0.0
        ):
            raise ValueError(
                "optimizer values must be non-negative (learning rate positive)"
            )
        if self.calibration_samples < 1 or self.max_calibration_batches < 1:
            raise ValueError("calibration limits must be positive")
        if self.checkpoint_every < 1:
            raise ValueError("checkpoint_every must be positive")
        if not isinstance(self.seed, int) or isinstance(self.seed, bool):
            raise TypeError("seed must be an integer")
        if self.run_id is not None and not _RUN_ID_PATTERN.fullmatch(self.run_id):
            raise ValueError("run_id may only use letters, numbers, '.', '_' and '-'")
        if not self.quantization_backend.strip():
            raise ValueError("quantization_backend must be non-empty")


@dataclass(frozen=True, slots=True)
class PipelineResult:
    """Locations and observed top-line metrics from one completed run."""

    run_id: str
    run_dir: Path
    checkpoint_path: Path
    quantized_model_path: Path
    report_path: Path
    metadata_path: Path
    latest_report_path: Path
    reference_accuracy: float
    candidate_accuracy: float
    sample_count: int


def _require_torch() -> Any:
    try:
        import torch
    except (ImportError, OSError) as error:
        raise RuntimeError(
            "The executable pipeline requires PyTorch. Install pipeline/requirements.txt "
            "using a supported CPython version."
        ) from error
    return torch


def seed_everything(seed: int) -> None:
    """Set explicit process-level reproducibility controls before any loaders."""

    torch = _require_torch()
    random.seed(seed)
    try:
        import numpy as np
    except ImportError:  # pragma: no cover - torchvision normally depends on NumPy
        np = None
    if np is not None:
        np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch, "use_deterministic_algorithms"):
        # Some CUDA kernels do not have deterministic implementations. Warning
        # mode records the compromise rather than silently changing the run.
        torch.use_deterministic_algorithms(True, warn_only=True)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True


def _seed_training_epoch(loader: Any, seed: int) -> None:
    """Seed main-process transforms and DataLoader workers for one epoch."""

    seed_everything(seed)
    set_loader_epoch_seed(loader, seed)


def resolve_training_device(requested: DeviceChoice) -> str:
    """Select CUDA only when requested/available; quantized execution is CPU."""

    torch = _require_torch()
    if requested == "cpu":
        return "cpu"
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("--device cuda was requested but CUDA is unavailable")
        return "cuda"
    return "cuda" if torch.cuda.is_available() else "cpu"


def choose_quantization_backend(requested: str) -> str:
    """Resolve an installed PyTorch quantized CPU backend explicitly."""

    torch = _require_torch()
    supported = tuple(torch.backends.quantized.supported_engines)
    if requested != "auto":
        if requested not in supported:
            raise RuntimeError(
                f"quantized backend {requested!r} is unavailable; supported engines: "
                f"{', '.join(supported) or 'none'}"
            )
        return requested
    # `onednn` is the active quantized engine on current Windows PyTorch
    # builds; older builds commonly expose x86/fbgemm/qnnpack instead.
    for candidate in ("onednn", "x86", "fbgemm", "qnnpack"):
        if candidate in supported:
            return candidate
    if supported:
        # A future PyTorch engine is preferable to rejecting an otherwise
        # supported installation merely because it has a new name.
        return supported[0]
    raise RuntimeError("this PyTorch installation has no usable quantized CPU backend")


def _utc_run_id(now: datetime) -> str:
    return f"cifar10-resnet18-{now.strftime('%Y%m%dT%H%M%SZ')}"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _classification_outputs_sha256(outputs: ClassificationOutputs) -> str:
    """Fingerprint the exact ordered labels, predictions, and probabilities."""

    digest = hashlib.sha256(b"fidelity-classification-outputs-v1\0")
    for target, prediction, probabilities in zip(
        outputs.targets,
        outputs.predictions,
        outputs.probabilities,
        strict=True,
    ):
        digest.update(struct.pack("<qqI", target, prediction, len(probabilities)))
        for probability in probabilities:
            digest.update(struct.pack("<d", probability))
    return digest.hexdigest()


def atomic_json_write(payload: Mapping[str, Any], output_path: Path) -> Path:
    """Write small provenance documents atomically and with stable JSON bytes."""

    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    serialized = (
        json.dumps(
            payload,
            indent=2,
            sort_keys=True,
            ensure_ascii=False,
            allow_nan=False,
        )
        + "\n"
    )
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(serialized)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, destination)
    finally:
        if temporary_name is not None and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return destination


def _config_record(config: PipelineConfig) -> dict[str, Any]:
    record = asdict(config)
    for field in (
        "data_dir",
        "artifacts_dir",
        "latest_report_path",
        "resume_checkpoint",
    ):
        if record[field] is not None:
            record[field] = str(record[field])
    return record


def _train_one_epoch(
    *, model: Any, loader: Any, optimizer: Any, criterion: Any, device: str
) -> tuple[float, int]:
    """Optimize exactly one epoch and return the observed mean loss/count."""

    torch = _require_torch()
    model.train()
    weighted_loss = 0.0
    observed_samples = 0
    for inputs, targets in loader:
        inputs = inputs.to(device, non_blocking=device == "cuda")
        targets = targets.to(device, non_blocking=device == "cuda")
        optimizer.zero_grad(set_to_none=True)
        logits = model(inputs)
        loss = criterion(logits, targets)
        if not bool(torch.isfinite(loss).item()):
            raise RuntimeError("training produced a non-finite loss")
        loss.backward()
        optimizer.step()
        count = int(targets.shape[0])
        weighted_loss += float(loss.detach().item()) * count
        observed_samples += count
    if observed_samples == 0:
        raise RuntimeError("training loader yielded no samples")
    return weighted_loss / observed_samples, observed_samples


def _checkpoint_config(config: PipelineConfig, training_device: str) -> dict[str, Any]:
    return {
        "architecture": ARCHITECTURE_ID,
        "dataset": "CIFAR-10",
        "training_device": training_device,
        "target_epochs": config.epochs,
        "learning_rate": config.learning_rate,
        "min_learning_rate": config.min_learning_rate,
        "momentum": config.momentum,
        "weight_decay": config.weight_decay,
        "train_batch_size": config.train_batch_size,
        "num_workers": config.num_workers,
    }


def _cosine_learning_rate(config: PipelineConfig, epoch: int) -> float:
    """Return the deterministic learning rate for a zero-based epoch."""

    if config.epochs < 1:
        return config.min_learning_rate
    progress = epoch / config.epochs
    return config.min_learning_rate + 0.5 * (
        config.learning_rate - config.min_learning_rate
    ) * (1.0 + math.cos(math.pi * progress))


def _validate_resume_config(
    resume: Mapping[str, Any], expected: Mapping[str, Any]
) -> None:
    """Prevent a resume from silently changing the declared train schedule."""

    observed = resume.get("train_config")
    if not isinstance(observed, Mapping):
        raise TypeError("resume checkpoint is missing train_config")
    stable_fields = (
        "architecture",
        "dataset",
        "target_epochs",
        "learning_rate",
        "min_learning_rate",
        "momentum",
        "weight_decay",
        "train_batch_size",
        "num_workers",
        "training_device",
    )
    changed = [
        field for field in stable_fields if observed.get(field) != expected[field]
    ]
    if changed:
        raise ValueError(
            "resume checkpoint training configuration differs for: "
            + ", ".join(changed)
        )


def _metadata(
    *,
    config: PipelineConfig,
    run_id: str,
    created_at: datetime,
    training_device: str,
    loaders: CifarLoaders,
    checkpoint_path: Path,
    quantized_model_path: Path,
    report_path: Path,
    torch_version: str,
    torchvision_version: str,
    quantization_backend: str,
    calibration_batches: int,
    training_history: list[dict[str, Any]],
    checkpoint_training_config: Mapping[str, Any],
    checkpoint_completed_epoch: int,
    resume_source: Mapping[str, str] | None,
    evaluated_sample_count: int,
    reference_outputs: ClassificationOutputs,
    candidate_outputs: ClassificationOutputs,
) -> dict[str, Any]:
    dataset_archive = (
        Path(config.data_dir).expanduser().resolve() / "cifar-10-python.tar.gz"
    )
    return {
        "format_version": 2,
        "kind": "fidelity_cifar10_pipeline_run",
        "run_id": run_id,
        "created_at": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "architecture": ARCHITECTURE_ID,
        "dataset": {
            "name": "CIFAR-10",
            "classes": list(CIFAR10_CLASSES),
            "source_archive_sha256": (
                _sha256_file(dataset_archive) if dataset_archive.is_file() else None
            ),
            "held_out_test_order_sha256": loaders.test_order_sha256,
            "held_out_test_sample_count": evaluated_sample_count,
            "calibration_split": "train",
            "calibration_sample_count": loaders.calibration_sample_count,
            "calibration_indices_sha256": loaders.calibration_indices_sha256,
        },
        "reproducibility": {
            "seed": config.seed,
            "deterministic_algorithms": "warn_only",
            "training_device": training_device,
            "reference_evaluation_device": "cpu",
            "quantized_evaluation_device": "cpu",
            "platform": platform.platform(),
            "python": platform.python_version(),
            "torch": torch_version,
            "torchvision": torchvision_version,
        },
        "quantization": {
            "implementation": "torch.ao.quantization.quantize_fx",
            "mode": "fx_static_post_training_int8",
            "backend": quantization_backend,
            "calibration_batches_observed": calibration_batches,
        },
        "evaluation": {
            "reference_outputs_sha256": _classification_outputs_sha256(
                reference_outputs
            ),
            "candidate_outputs_sha256": _classification_outputs_sha256(
                candidate_outputs
            ),
        },
        "artifacts": {
            "checkpoint": checkpoint_path.name,
            "checkpoint_sha256": _sha256_file(checkpoint_path),
            "quantized_model": quantized_model_path.name,
            "quantized_model_sha256": _sha256_file(quantized_model_path),
            "validation_report": report_path.name,
            "validation_report_sha256": _sha256_file(report_path),
        },
        "training": {
            "checkpoint_completed_epoch": checkpoint_completed_epoch,
            "checkpoint_config": dict(checkpoint_training_config),
            "epochs_executed_this_run": len(training_history),
            "history_this_run": training_history,
            "resume_source": dict(resume_source) if resume_source is not None else None,
        },
        "execution_config": _config_record(config),
    }


def run_pipeline(
    config: PipelineConfig,
    *,
    log: Callable[[str], None] | None = print,
) -> PipelineResult:
    """Produce a computed report from actual CIFAR-10 model execution.

    This function does not download or train until it is explicitly called.
    It never substitutes a synthetic score when an ML dependency, dataset,
    checkpoint, CUDA device, or quantized engine is unavailable.
    """

    config.validate()
    torch = _require_torch()
    seed_everything(config.seed)
    training_device = resolve_training_device(config.device)
    backend = choose_quantization_backend(config.quantization_backend)
    created_at = datetime.now(UTC)
    run_id = config.run_id or _utc_run_id(created_at)
    run_dir = (Path(config.artifacts_dir).expanduser().resolve() / run_id).resolve()
    # This check makes a malicious-looking run id harmless even if Config is
    # constructed programmatically rather than by argparse.
    if run_dir.parent != Path(config.artifacts_dir).expanduser().resolve():
        raise ValueError("run_id resolves outside artifacts_dir")
    run_dir.mkdir(parents=True, exist_ok=False)

    def announce(message: str) -> None:
        if log is not None:
            log(message)

    try:
        loaders = build_cifar10_loaders(
            data_dir=config.data_dir,
            train_batch_size=config.train_batch_size,
            evaluation_batch_size=config.evaluation_batch_size,
            num_workers=config.num_workers,
            seed=config.seed,
            calibration_samples=config.calibration_samples,
            download=config.download,
            pin_memory=training_device == "cuda",
        )
        model = build_resnet18_cifar10().to(training_device)
        optimizer = torch.optim.SGD(
            model.parameters(),
            lr=config.learning_rate,
            momentum=config.momentum,
            weight_decay=config.weight_decay,
        )
        criterion = torch.nn.CrossEntropyLoss()
        start_epoch = 0
        resume_source: dict[str, str] | None = None
        checkpoint_config = _checkpoint_config(config, training_device)
        if config.resume_checkpoint is not None:
            resume_path = Path(config.resume_checkpoint).expanduser().resolve()
            resume = load_checkpoint(
                model=model,
                optimizer=optimizer,
                checkpoint_path=resume_path,
                device=training_device,
            )
            source_sha256 = resume.get("_source_sha256")
            if not isinstance(source_sha256, str) or len(source_sha256) != 64:
                raise ValueError("resume checkpoint loader did not return its SHA-256")
            resume_source = {
                "filename": resume_path.name,
                "sha256": source_sha256,
            }
            if resume.get("seed") != config.seed:
                raise ValueError(
                    "resume checkpoint seed differs from --seed; choose the original "
                    "seed to preserve the declared deterministic training schedule"
                )
            start_epoch = int(resume["epoch"])
            if config.epochs == 0:
                observed_config = resume.get("train_config")
                if not isinstance(observed_config, Mapping):
                    raise ValueError("resume checkpoint is missing train_config")
                checkpoint_config = dict(observed_config)
            else:
                _validate_resume_config(resume, checkpoint_config)
            if config.epochs > 0 and start_epoch > config.epochs:
                raise ValueError(
                    "resume checkpoint epoch exceeds --epochs (the target total epochs)"
                )
            announce(f"resumed checkpoint at completed epoch {start_epoch}")

        checkpoint_path = run_dir / "fp32-checkpoint.pt"
        training_history: list[dict[str, Any]] = []
        for epoch in range(start_epoch, config.epochs):
            learning_rate = _cosine_learning_rate(config, epoch)
            for parameter_group in optimizer.param_groups:
                parameter_group["lr"] = learning_rate
            epoch_seed = config.seed + 1000 + epoch
            # With worker processes, DataLoader derives each worker RNG from
            # its generator. With ``num_workers=0``, transforms use the main
            # process RNG. Seed both paths from the epoch index so an honest
            # resume observes the same sampling and augmentation stream.
            _seed_training_epoch(loaders.train, epoch_seed)
            mean_loss, sample_count = _train_one_epoch(
                model=model,
                loader=loaders.train,
                optimizer=optimizer,
                criterion=criterion,
                device=training_device,
            )
            training_history.append(
                {
                    "epoch": epoch + 1,
                    "learning_rate": learning_rate,
                    "mean_cross_entropy": mean_loss,
                    "sample_count": sample_count,
                }
            )
            announce(
                f"epoch {epoch + 1}/{config.epochs}: observed training loss {mean_loss:.6f} "
                f"over {sample_count} samples"
            )
            if (epoch + 1) % config.checkpoint_every == 0 or epoch + 1 == config.epochs:
                save_checkpoint(
                    model=model,
                    optimizer=optimizer,
                    epoch=epoch + 1,
                    seed=config.seed,
                    train_config=checkpoint_config,
                    output_path=checkpoint_path,
                )
        if not checkpoint_path.exists():
            # A resume-only run must still create a self-contained artifact.
            save_checkpoint(
                model=model,
                optimizer=optimizer,
                epoch=start_epoch,
                seed=config.seed,
                train_config=checkpoint_config,
                output_path=checkpoint_path,
            )
        checkpoint_completed_epoch = config.epochs if config.epochs > 0 else start_epoch

        # Compare CPU FP32 and CPU INT8 execution so confidence drift isolates
        # quantization rather than mixing in CPU/GPU numeric differences.
        reference_model = deepcopy(model).cpu().eval()
        reference_outputs = evaluate_classifier(
            reference_model, loaders.test, device="cpu"
        )
        announce(
            "FP32 held-out accuracy: "
            f"{reference_outputs.top1_accuracy:.6%} ({reference_outputs.correct_count}/"
            f"{reference_outputs.sample_count})"
        )

        try:
            example_inputs, _ = next(iter(loaders.calibration))
        except StopIteration as error:  # defensive; loader builder enforces samples > 0
            raise RuntimeError(
                "calibration loader unexpectedly yielded no batches"
            ) from error
        ptq = quantize_fx_post_training(
            reference_model,
            loaders.calibration,
            example_inputs=(example_inputs.cpu(),),
            backend=backend,
            max_calibration_batches=config.max_calibration_batches,
        )
        quantized_model_path = atomic_torch_save(
            {
                "format_version": 1,
                "architecture": ARCHITECTURE_ID,
                "quantization_backend": ptq.backend,
                "torch_version": ptq.torch_version,
                "calibration_batches": ptq.calibration_batches,
                "model": ptq.quantized_model,
            },
            run_dir / "int8-fx-static-model.pt",
        )
        candidate_outputs = evaluate_classifier(
            ptq.quantized_model, loaders.test, device="cpu"
        )
        if reference_outputs.targets != candidate_outputs.targets:
            raise RuntimeError(
                "FP32 and INT8 evaluators observed different target ordering; report aborted"
            )
        if reference_outputs.sample_count != candidate_outputs.sample_count:
            raise RuntimeError(
                "FP32 and INT8 evaluators observed different sample counts"
            )
        announce(
            "INT8 held-out accuracy: "
            f"{candidate_outputs.top1_accuracy:.6%} ({candidate_outputs.correct_count}/"
            f"{candidate_outputs.sample_count})"
        )

        report = build_validation_report(
            run_id=run_id,
            created_at=created_at,
            model="ResNet-18 adapted for CIFAR-10 (32x32)",
            dataset="CIFAR-10 test split",
            targets=reference_outputs.targets,
            reference_predictions=reference_outputs.predictions,
            candidate_predictions=candidate_outputs.predictions,
            reference_probabilities=reference_outputs.probabilities,
            candidate_probabilities=candidate_outputs.probabilities,
            class_names=CIFAR10_CLASSES,
        )
        report_path = write_report(report, run_dir / "validation-report.json")
        try:
            import torchvision
        except (ImportError, OSError) as error:  # impossible after loader creation
            raise RuntimeError(
                "torchvision disappeared during pipeline execution"
            ) from error
        metadata_path = atomic_json_write(
            _metadata(
                config=config,
                run_id=run_id,
                created_at=created_at,
                training_device=training_device,
                loaders=loaders,
                checkpoint_path=checkpoint_path,
                quantized_model_path=quantized_model_path,
                report_path=report_path,
                torch_version=str(torch.__version__),
                torchvision_version=str(torchvision.__version__),
                quantization_backend=ptq.backend,
                calibration_batches=ptq.calibration_batches,
                training_history=training_history,
                checkpoint_training_config=checkpoint_config,
                checkpoint_completed_epoch=checkpoint_completed_epoch,
                resume_source=resume_source,
                evaluated_sample_count=reference_outputs.sample_count,
                reference_outputs=reference_outputs,
                candidate_outputs=candidate_outputs,
            ),
            run_dir / "metadata.json",
        )
        # Publish only after the complete run record exists. The API reads this
        # stable path and independently validates it before serving evidence.
        latest_report_path = write_report(report, config.latest_report_path)
    except BaseException:
        # Keep partial artifacts for inspection but never label a failed run as
        # completed by writing a report/metadata pair after an exception.
        announce(f"run failed; partial artifacts retained at {run_dir}")
        raise

    return PipelineResult(
        run_id=run_id,
        run_dir=run_dir,
        checkpoint_path=checkpoint_path,
        quantized_model_path=quantized_model_path,
        report_path=report_path,
        metadata_path=metadata_path,
        latest_report_path=latest_report_path,
        reference_accuracy=reference_outputs.top1_accuracy,
        candidate_accuracy=candidate_outputs.top1_accuracy,
        sample_count=reference_outputs.sample_count,
    )
