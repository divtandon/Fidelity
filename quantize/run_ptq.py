"""Post-training static quantization using PyTorch's real FX APIs.

This module is intentionally a workflow primitive, not a demo that prints
plausible metrics.  Callers must supply a trained model, representative
calibration batches, and real evaluation data.  Accuracy is only returned by
``evaluate_classifier`` after the model has actually run over a data loader.

FX graph-mode PTQ remains a public PyTorch API but is being migrated to the
separate ``torchao`` project.  Keeping the dependency behind a small function
makes that future migration local and keeps report calculations independent.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any


class PyTorchUnavailableError(RuntimeError):
    """Raised when a requested model operation cannot import PyTorch."""


@dataclass(frozen=True, slots=True)
class PTQResult:
    """A genuinely converted model plus calibration provenance."""

    quantized_model: Any
    backend: str
    calibration_batches: int
    torch_version: str


@dataclass(frozen=True, slots=True)
class ClassificationOutputs:
    """Observed classifier outputs suitable for ``build_validation_report``."""

    targets: tuple[int, ...]
    predictions: tuple[int, ...]
    probabilities: tuple[tuple[float, ...], ...]
    correct_count: int

    def __post_init__(self) -> None:
        lengths = {len(self.targets), len(self.predictions), len(self.probabilities)}
        if len(lengths) != 1 or not self.targets:
            raise ValueError(
                "targets, predictions, and probabilities must have equal non-zero length"
            )
        if any(
            isinstance(value, bool) or not isinstance(value, int) or value < 0
            for value in (*self.targets, *self.predictions)
        ):
            raise ValueError(
                "targets and predictions must be non-negative integer class ids"
            )
        expected_width = len(self.probabilities[0])
        for row_index, row in enumerate(self.probabilities):
            if len(row) < 2:
                raise ValueError(
                    f"probabilities[{row_index}] must contain at least two classes"
                )
            if len(row) != expected_width:
                raise ValueError("all probability rows must have the same class width")
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(float(value))
                or float(value) < 0.0
                for value in row
            ):
                raise ValueError(
                    f"probabilities[{row_index}] must contain finite non-negative values"
                )
            probability_sum = math.fsum(row)
            if not math.isclose(probability_sum, 1.0, rel_tol=1e-6, abs_tol=1e-6):
                raise ValueError(f"probabilities[{row_index}] must sum to one")
            if self.targets[row_index] >= len(row) or self.predictions[
                row_index
            ] >= len(row):
                raise ValueError(
                    f"target or prediction at row {row_index} falls outside model classes"
                )
        observed_correct = sum(
            int(target == prediction)
            for target, prediction in zip(self.targets, self.predictions, strict=True)
        )
        if self.correct_count != observed_correct:
            raise ValueError("correct_count does not match targets and predictions")

    @property
    def sample_count(self) -> int:
        return len(self.targets)

    @property
    def top1_accuracy(self) -> float:
        if self.sample_count == 0:
            raise ValueError("accuracy is undefined for an empty evaluation")
        return self.correct_count / self.sample_count


def _require_torch() -> Any:
    try:
        import torch
    except (ImportError, OSError) as error:
        raise PyTorchUnavailableError(
            "PyTorch is required for model execution and PTQ. Install a PyTorch "
            "build compatible with this Python version and platform."
        ) from error
    return torch


def _as_positional_inputs(value: Any, *, context: str) -> tuple[Any, ...]:
    result = value if isinstance(value, tuple) else (value,)
    if not result:
        raise ValueError(f"{context} produced no model inputs")
    return result


def _default_calibration_input(batch: Any) -> Any:
    # Conventional classifier data loaders yield (inputs, targets).  A custom
    # extractor is required for multi-input models to avoid guessing.
    if isinstance(batch, (tuple, list)):
        if not batch:
            raise ValueError("calibration loader yielded an empty batch")
        return batch[0]
    return batch


def quantize_fx_post_training(
    model: Any,
    calibration_batches: Iterable[Any],
    *,
    example_inputs: tuple[Any, ...],
    backend: str = "x86",
    input_extractor: Callable[[Any], Any] | None = None,
    max_calibration_batches: int | None = None,
    copy_model: bool = True,
) -> PTQResult:
    """Calibrate and convert a trained CPU model with static INT8 PTQ.

    The function executes every consumed calibration batch through the
    observer-instrumented model.  It raises if no batch is observed; it never
    creates a model or reports an accuracy value without doing the work.

    Args:
        model: A trained ``torch.nn.Module`` compatible with FX tracing.
        calibration_batches: Representative, real input batches.
        example_inputs: Positional sample inputs required by ``prepare_fx``.
        backend: A quantized engine supported by the installed PyTorch build.
        input_extractor: Maps a loader batch to a tensor or tuple of model args.
        max_calibration_batches: Optional positive cap for bounded calibration.
        copy_model: Deep-copy the source model before observer insertion.
    """

    torch = _require_torch()
    try:
        from torch.ao.quantization import get_default_qconfig_mapping
        from torch.ao.quantization.quantize_fx import convert_fx, prepare_fx
    except (ImportError, AttributeError) as error:
        raise PyTorchUnavailableError(
            "This PyTorch build does not expose FX post-training quantization. "
            "Use a supported PyTorch release or migrate this adapter to torchao PT2E."
        ) from error

    if model is None or not hasattr(model, "eval"):
        raise TypeError("model must be a torch.nn.Module-like object")
    if not isinstance(example_inputs, tuple) or not example_inputs:
        raise ValueError("example_inputs must be a non-empty tuple of positional args")
    if not isinstance(backend, str) or not backend.strip():
        raise ValueError("backend must be a non-empty string")
    backend = backend.strip()
    if max_calibration_batches is not None and (
        not isinstance(max_calibration_batches, int)
        or isinstance(max_calibration_batches, bool)
        or max_calibration_batches < 1
    ):
        raise ValueError("max_calibration_batches must be a positive integer")

    supported_engines = tuple(torch.backends.quantized.supported_engines)
    if backend not in supported_engines:
        raise ValueError(
            f"quantized backend {backend!r} is unavailable; supported engines: "
            f"{', '.join(supported_engines) or 'none'}"
        )

    working_model = deepcopy(model) if copy_model else model
    working_model.eval()
    try:
        working_model.cpu()
    except AttributeError as error:
        raise TypeError("model must provide cpu() and eval() methods") from error

    # The selected engine is part of how PyTorch dispatches quantized CPU ops.
    torch.backends.quantized.engine = backend
    qconfig_mapping = get_default_qconfig_mapping(backend)
    cpu_example_inputs = tuple(
        value.cpu() if hasattr(value, "cpu") else value for value in example_inputs
    )
    prepared = prepare_fx(working_model, qconfig_mapping, cpu_example_inputs)
    extractor = input_extractor or _default_calibration_input
    observed_batches = 0
    with torch.inference_mode():
        for batch in calibration_batches:
            inputs = _as_positional_inputs(
                extractor(batch), context="calibration input_extractor"
            )
            cpu_inputs = tuple(
                value.cpu() if hasattr(value, "cpu") else value for value in inputs
            )
            prepared(*cpu_inputs)
            observed_batches += 1
            if (
                max_calibration_batches is not None
                and observed_batches >= max_calibration_batches
            ):
                break
    if observed_batches == 0:
        raise ValueError(
            "calibration_batches yielded no batches; conversion was aborted"
        )

    quantized_model = convert_fx(prepared)
    quantized_model.eval()
    return PTQResult(
        quantized_model=quantized_model,
        backend=backend,
        calibration_batches=observed_batches,
        torch_version=str(torch.__version__),
    )


def _default_evaluation_batch(batch: Any) -> tuple[Any, Any]:
    if not isinstance(batch, (tuple, list)) or len(batch) != 2:
        raise ValueError(
            "evaluation batches must be (inputs, targets), or provide batch_extractor"
        )
    return batch[0], batch[1]


def evaluate_classifier(
    model: Any,
    data_loader: Iterable[Any],
    *,
    batch_extractor: Callable[[Any], tuple[Any, Any]] | None = None,
    device: str = "cpu",
) -> ClassificationOutputs:
    """Run a classifier and return real labels, predictions, and probabilities.

    The model must return a two-dimensional ``[batch, classes]`` logits tensor.
    Quantized PyTorch models normally require ``device='cpu'``.
    """

    torch = _require_torch()
    if model is None or not hasattr(model, "eval"):
        raise TypeError("model must be a torch.nn.Module-like object")
    if not isinstance(device, str) or not device.strip():
        raise ValueError("device must be a non-empty PyTorch device string")
    extractor = batch_extractor or _default_evaluation_batch
    model.eval()
    model.to(device)

    targets: list[int] = []
    predictions: list[int] = []
    probabilities: list[tuple[float, ...]] = []
    with torch.inference_mode():
        for batch_index, batch in enumerate(data_loader):
            inputs, labels = extractor(batch)
            positional_inputs = _as_positional_inputs(
                inputs, context="evaluation batch_extractor"
            )
            moved_inputs = tuple(
                value.to(device) if hasattr(value, "to") else value
                for value in positional_inputs
            )
            if not hasattr(labels, "to"):
                raise TypeError(
                    f"evaluation labels in batch {batch_index} must be a tensor"
                )
            labels = labels.to(device)
            logits = model(*moved_inputs)
            if not hasattr(logits, "ndim") or logits.ndim != 2:
                raise ValueError(
                    f"model output for batch {batch_index} must have shape [batch, classes]"
                )
            if logits.shape[1] < 2:
                raise ValueError("classifier output must contain at least two classes")
            if not bool(torch.isfinite(logits).all().item()):
                raise ValueError(f"model output for batch {batch_index} is not finite")
            flattened_labels = labels.reshape(-1)
            if logits.shape[0] != flattened_labels.shape[0]:
                raise ValueError(
                    f"batch {batch_index} output and target counts do not match"
                )
            batch_probabilities = torch.softmax(logits, dim=1)
            batch_predictions = torch.argmax(batch_probabilities, dim=1)
            raw_targets = flattened_labels.detach().cpu().tolist()
            if any(
                isinstance(value, bool) or not isinstance(value, int)
                for value in raw_targets
            ):
                raise ValueError(
                    f"evaluation labels in batch {batch_index} must use integer class ids"
                )
            if any(value < 0 or value >= logits.shape[1] for value in raw_targets):
                raise ValueError(
                    f"evaluation labels in batch {batch_index} fall outside model classes"
                )
            targets.extend(raw_targets)
            predictions.extend(
                int(value) for value in batch_predictions.detach().cpu().tolist()
            )
            probabilities.extend(
                tuple(float(value) for value in row)
                for row in batch_probabilities.detach().cpu().tolist()
            )

    if not targets:
        raise ValueError("data_loader yielded no evaluated samples")
    correct_count = sum(
        int(target == prediction)
        for target, prediction in zip(targets, predictions, strict=True)
    )
    return ClassificationOutputs(
        targets=tuple(targets),
        predictions=tuple(predictions),
        probabilities=tuple(probabilities),
        correct_count=correct_count,
    )
