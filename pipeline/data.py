"""CIFAR-10 datasets, stable sample ordering, and deterministic loaders."""

from __future__ import annotations

import hashlib
import random
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CIFAR10_CLASSES: tuple[str, ...] = (
    "airplane",
    "automobile",
    "bird",
    "cat",
    "deer",
    "dog",
    "frog",
    "horse",
    "ship",
    "truck",
)


class TorchvisionUnavailableError(RuntimeError):
    """Raised when the executable pipeline lacks its optional ML runtime."""


@dataclass(frozen=True, slots=True)
class CifarLoaders:
    """Dataloaders and selection fingerprints used in a pipeline run."""

    train: Any
    calibration: Any
    test: Any
    calibration_sample_count: int
    calibration_indices_sha256: str
    test_order_sha256: str


class _IndexedSubset:
    """Subset that preserves each source index in calibration batches."""

    def __init__(self, dataset: Any, indices: Sequence[int]) -> None:
        self.dataset = dataset
        self.indices = tuple(indices)

    def __len__(self) -> int:
        return len(self.indices)

    def __getitem__(self, item: int) -> tuple[Any, Any, int]:
        source_index = self.indices[item]
        image, label = self.dataset[source_index]
        return image, label, source_index


def set_loader_epoch_seed(loader: Any, seed: int) -> None:
    """Reset a training loader's generator so resumed epochs keep their order."""

    generator = getattr(loader, "generator", None)
    if generator is None:
        raise ValueError("training loader does not expose a seeded generator")
    generator.manual_seed(seed)


def _require_torchvision() -> tuple[Any, Any, Any]:
    try:
        import torch
        from torch.utils.data import DataLoader
        from torchvision import datasets, transforms
    except (ImportError, OSError) as error:
        raise TorchvisionUnavailableError(
            "The CIFAR-10 pipeline needs compatible torch and torchvision packages. "
            "Install pipeline/requirements.txt with CPython 3.11--3.13."
        ) from error
    return torch, DataLoader, (datasets, transforms)


def _stable_indices_hash(indices: Sequence[int], labels: Sequence[int]) -> str:
    """Hash exact ordered `(dataset_index, label)` pairs for later comparison."""

    digest = hashlib.sha256()
    for index in indices:
        digest.update(f"{index}:{int(labels[index])}\n".encode("ascii"))
    return digest.hexdigest()


def stable_observation_hash(observations: Sequence[tuple[int, int]]) -> str:
    """Hash exact ordered ``(source index, label)`` observations."""

    digest = hashlib.sha256()
    for index, label in observations:
        digest.update(f"{index}:{label}\n".encode("ascii"))
    return digest.hexdigest()


def _seed_worker(worker_id: int) -> None:
    """Seed Python and NumPy from PyTorch's per-worker deterministic seed."""

    try:
        import torch
    except (ImportError, OSError):  # pragma: no cover - invoked by torch workers
        return
    worker_seed = torch.initial_seed() % (2**32)
    random.seed(worker_seed)
    try:
        import numpy as np
    except ImportError:  # torchvision itself brings NumPy, but keep this benign.
        return
    np.random.seed(worker_seed)


def build_cifar10_loaders(
    *,
    data_dir: Path,
    train_batch_size: int,
    evaluation_batch_size: int,
    num_workers: int,
    seed: int,
    calibration_samples: int,
    download: bool,
    pin_memory: bool,
) -> CifarLoaders:
    """Return deterministic train, calibration and *ordered* test loaders.

    Calibration comes from a seed-selected subset of the training split with
    evaluation transforms, so it never contaminates the held-out comparison.
    The test loader is intentionally `shuffle=False`; both models consume it
    independently but in exactly the same index order.
    """

    if train_batch_size < 1 or evaluation_batch_size < 1:
        raise ValueError("batch sizes must be positive")
    if num_workers < 0:
        raise ValueError("num_workers cannot be negative")
    if calibration_samples < 1:
        raise ValueError("calibration_samples must be positive")

    torch, DataLoader, (datasets, transforms) = _require_torchvision()
    normalized_root = Path(data_dir).expanduser().resolve()
    normalized_root.mkdir(parents=True, exist_ok=True)
    normalization = transforms.Normalize(
        mean=(0.4914, 0.4822, 0.4465), std=(0.2470, 0.2435, 0.2616)
    )
    train_transform = transforms.Compose(
        [
            transforms.RandomCrop(32, padding=4),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            normalization,
        ]
    )
    evaluation_transform = transforms.Compose([transforms.ToTensor(), normalization])

    train_dataset = datasets.CIFAR10(
        root=str(normalized_root),
        train=True,
        transform=train_transform,
        download=download,
    )
    calibration_dataset = datasets.CIFAR10(
        root=str(normalized_root),
        train=True,
        transform=evaluation_transform,
        download=download,
    )
    test_dataset = datasets.CIFAR10(
        root=str(normalized_root),
        train=False,
        transform=evaluation_transform,
        download=download,
    )
    if len(train_dataset) != len(calibration_dataset):
        raise RuntimeError("CIFAR-10 train and calibration dataset lengths disagree")
    if calibration_samples > len(calibration_dataset):
        raise ValueError(
            f"calibration_samples ({calibration_samples}) exceeds CIFAR-10 training "
            f"split size ({len(calibration_dataset)})"
        )

    selector = torch.Generator()
    selector.manual_seed(seed + 11)
    calibration_indices = torch.randperm(
        len(calibration_dataset), generator=selector
    ).tolist()[:calibration_samples]
    labels = test_dataset.targets
    calibration_labels = calibration_dataset.targets

    train_generator = torch.Generator()
    train_generator.manual_seed(seed + 17)
    loader_kwargs = {
        "num_workers": num_workers,
        "pin_memory": pin_memory,
        "worker_init_fn": _seed_worker if num_workers else None,
        # Recreate workers for each epoch so resetting ``train_generator`` also
        # resets augmentation RNG streams after an interrupted/resumed run.
        "persistent_workers": False,
    }
    train_loader = DataLoader(
        train_dataset,
        batch_size=train_batch_size,
        shuffle=True,
        generator=train_generator,
        **loader_kwargs,
    )
    calibration_loader = DataLoader(
        _IndexedSubset(calibration_dataset, calibration_indices),
        batch_size=evaluation_batch_size,
        shuffle=False,
        **loader_kwargs,
    )
    test_loader = DataLoader(
        test_dataset,
        batch_size=evaluation_batch_size,
        shuffle=False,
        **loader_kwargs,
    )
    return CifarLoaders(
        train=train_loader,
        calibration=calibration_loader,
        test=test_loader,
        calibration_sample_count=len(calibration_indices),
        calibration_indices_sha256=_stable_indices_hash(
            calibration_indices, calibration_labels
        ),
        test_order_sha256=_stable_indices_hash(list(range(len(test_dataset))), labels),
    )
