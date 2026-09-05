"""ResNet-18 definition and CPU-safe checkpoint helpers."""

from __future__ import annotations

import hashlib
import os
import tempfile
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any

from .data import TorchvisionUnavailableError

ARCHITECTURE_ID = "resnet18_cifar10_v1"


def _require_torchvision_models() -> tuple[Any, Any]:
    try:
        import torch
        from torchvision import models
    except (ImportError, OSError) as error:
        raise TorchvisionUnavailableError(
            "Building the ResNet-18 CIFAR-10 model needs compatible torch and "
            "torchvision packages."
        ) from error
    return torch, models


def build_resnet18_cifar10() -> Any:
    """Build an untrained ResNet-18 modified for native 32x32 image inputs."""

    torch, models = _require_torchvision_models()
    model = models.resnet18(weights=None, num_classes=10)
    # ImageNet's 7x7 / stride-2 stem and max-pool discard too much 32x32 detail.
    model.conv1 = torch.nn.Conv2d(3, 64, kernel_size=3, stride=1, padding=1, bias=False)
    model.maxpool = torch.nn.Identity()
    return model


def _cpu_state_dict(model: Any) -> dict[str, Any]:
    return {
        name: value.detach().cpu().clone()
        if hasattr(value, "detach")
        else deepcopy(value)
        for name, value in model.state_dict().items()
    }


def atomic_torch_save(payload: Any, output_path: Path) -> Path:
    """Write a torch artifact using same-directory atomic replacement."""

    torch, _ = _require_torchvision_models()
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            torch.save(payload, temporary)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, destination)
    finally:
        if temporary_name is not None and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return destination


def atomic_torchscript_save(model: Any, output_path: Path) -> Path:
    """Export a standalone, reloadable TorchScript inference module."""

    torch, _ = _require_torchvision_models()
    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    scripted = torch.jit.script(model.eval())
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w+b",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            torch.jit.save(scripted, temporary)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, destination)
    finally:
        if temporary_name is not None and os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return destination


def load_torchscript_model(path: Path, *, device: str = "cpu") -> Any:
    """Load a trusted Fidelity inference export.

    TorchScript loading can execute serialized code. Callers must never pass
    an artifact from an untrusted source.
    """

    torch, _ = _require_torchvision_models()
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"TorchScript model does not exist: {source}")
    model = torch.jit.load(str(source), map_location=device)
    return model.eval()


def save_checkpoint(
    *,
    model: Any,
    optimizer: Any,
    epoch: int,
    seed: int,
    train_config: Mapping[str, Any],
    output_path: Path,
) -> Path:
    """Save one fully-resumable checkpoint without tying it to a device."""

    if epoch < 0:
        raise ValueError("epoch cannot be negative")
    payload = {
        "format_version": 1,
        "architecture": ARCHITECTURE_ID,
        "epoch": epoch,
        "seed": seed,
        "model_state": _cpu_state_dict(model),
        "optimizer_state": optimizer.state_dict(),
        "train_config": dict(train_config),
    }
    return atomic_torch_save(payload, output_path)


def load_checkpoint(
    *, model: Any, optimizer: Any, checkpoint_path: Path, device: str
) -> dict[str, Any]:
    """Load and validate a Fidelity ResNet-18 checkpoint for training resume."""

    torch, _ = _require_torchvision_models()
    source = Path(checkpoint_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"resume checkpoint does not exist: {source}")
    # Hash and load through the same open handle so provenance always names
    # the exact bytes that were deserialized, even if the path is replaced by
    # another process during a long run.
    with source.open("rb") as checkpoint_file:
        digest = hashlib.sha256()
        for chunk in iter(lambda: checkpoint_file.read(1024 * 1024), b""):
            digest.update(chunk)
        checkpoint_file.seek(0)
        # Fidelity checkpoints contain only tensors and primitive containers.
        # Restrict unpickling to PyTorch's safe weights allow-list; never
        # execute arbitrary pickle payloads supplied as a resume checkpoint.
        payload = torch.load(checkpoint_file, map_location=device, weights_only=True)
    if not isinstance(payload, dict):
        raise TypeError("resume checkpoint must contain a mapping")
    if payload.get("format_version") != 1:
        raise ValueError("unsupported checkpoint format_version")
    if payload.get("architecture") != ARCHITECTURE_ID:
        raise ValueError("resume checkpoint is not a Fidelity CIFAR-10 ResNet-18")
    epoch = payload.get("epoch")
    if not isinstance(epoch, int) or isinstance(epoch, bool) or epoch < 0:
        raise ValueError("resume checkpoint has an invalid epoch")
    if not isinstance(payload.get("model_state"), dict):
        raise TypeError("resume checkpoint is missing model_state")
    if not isinstance(payload.get("optimizer_state"), dict):
        raise TypeError("resume checkpoint is missing optimizer_state")
    model.load_state_dict(payload["model_state"])
    optimizer.load_state_dict(payload["optimizer_state"])
    payload["_source_sha256"] = digest.hexdigest()
    return payload
