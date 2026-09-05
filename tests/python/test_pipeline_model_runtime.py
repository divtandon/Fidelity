"""Focused runtime checks for safe checkpoints and deterministic transforms."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pipeline.model import load_checkpoint, save_checkpoint
from pipeline.runner import _seed_training_epoch

try:
    import torch
    from torchvision import transforms
except (ImportError, OSError):  # pragma: no cover - optional ML runtime
    torch = None
    transforms = None


@unittest.skipIf(torch is None or transforms is None, "PyTorch runtime is optional")
class PipelineModelRuntimeTests(unittest.TestCase):
    def test_checkpoint_round_trip_uses_safe_tensor_payload(self) -> None:
        source_model = torch.nn.Linear(4, 2)
        source_optimizer = torch.optim.SGD(source_model.parameters(), lr=0.1)
        inputs = torch.randn(3, 4)
        expected = source_model(inputs).detach().clone()

        with tempfile.TemporaryDirectory() as temporary:
            checkpoint = Path(temporary) / "checkpoint.pt"
            save_checkpoint(
                model=source_model,
                optimizer=source_optimizer,
                epoch=3,
                seed=2026,
                train_config={"target_epochs": 3},
                output_path=checkpoint,
            )
            loaded_model = torch.nn.Linear(4, 2)
            loaded_optimizer = torch.optim.SGD(loaded_model.parameters(), lr=0.1)
            payload = load_checkpoint(
                model=loaded_model,
                optimizer=loaded_optimizer,
                checkpoint_path=checkpoint,
                device="cpu",
            )

        self.assertEqual(payload["epoch"], 3)
        self.assertRegex(payload["_source_sha256"], r"^[0-9a-f]{64}$")
        torch.testing.assert_close(loaded_model(inputs), expected)

    def test_epoch_seed_matches_uninterrupted_and_resumed_augmentation(self) -> None:
        transform = transforms.Compose(
            [transforms.RandomCrop(32, padding=4), transforms.RandomHorizontalFlip()]
        )
        image = torch.arange(3 * 32 * 32, dtype=torch.float32).reshape(3, 32, 32)

        def observed_epoch(epoch: int) -> torch.Tensor:
            loader = type("SeededLoader", (), {"generator": torch.Generator()})()
            _seed_training_epoch(loader, 2026 + 1000 + epoch)
            return transform(image)

        uninterrupted = [observed_epoch(epoch) for epoch in range(3)]
        # Simulate a fresh resume process that did not consume epochs 0 and 1.
        torch.manual_seed(999_999)
        resumed_epoch_two = observed_epoch(2)

        torch.testing.assert_close(resumed_epoch_two, uninterrupted[2])


if __name__ == "__main__":
    unittest.main()
