"""Fast orchestration tests; they never download CIFAR-10 or import Torch."""

from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from itertools import pairwise
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pipeline.cli import build_parser
from pipeline.data import CifarLoaders, _stable_indices_hash
from pipeline.runner import (
    PipelineConfig,
    _cosine_learning_rate,
    _validate_resume_config,
    atomic_json_write,
    run_pipeline,
)
from quantize.run_ptq import ClassificationOutputs


class _LoaderGenerator:
    def __init__(self) -> None:
        self.seeds: list[int] = []

    def manual_seed(self, seed: int) -> None:
        self.seeds.append(seed)


class _Loader:
    def __init__(self) -> None:
        self.generator = _LoaderGenerator()


class _Input:
    def cpu(self) -> _Input:
        return self


class _Model:
    def to(self, _device: str) -> _Model:
        return self

    def cpu(self) -> _Model:
        return self

    def eval(self) -> _Model:
        return self

    def parameters(self) -> list[object]:
        return []


class _Optimizer:
    def __init__(self) -> None:
        self.param_groups = [{"lr": 0.1}]

    def state_dict(self) -> dict[str, object]:
        return {}


class PipelineContractTests(unittest.TestCase):
    def test_config_rejects_path_like_run_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "run_id"):
            PipelineConfig(run_id="../escape").validate()

    def test_sample_fingerprint_changes_when_order_changes(self) -> None:
        labels = [3, 1, 4]
        self.assertEqual(
            _stable_indices_hash([0, 1, 2], labels),
            _stable_indices_hash([0, 1, 2], labels),
        )
        self.assertNotEqual(
            _stable_indices_hash([0, 1, 2], labels),
            _stable_indices_hash([2, 1, 0], labels),
        )

    def test_atomic_json_writer_round_trips_stable_document(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = atomic_json_write(
                {"b": 2, "a": 1}, Path(temporary) / "metadata.json"
            )
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")), {"a": 1, "b": 2}
            )
            self.assertTrue(path.read_text(encoding="utf-8").endswith("\n"))

    def test_cli_defaults_to_dataset_download_but_can_be_offline(self) -> None:
        self.assertTrue(build_parser().parse_args([]).download)
        self.assertFalse(build_parser().parse_args(["--no-download"]).download)

    def test_cosine_schedule_is_deterministic_and_decreasing(self) -> None:
        config = PipelineConfig(epochs=20)
        rates = [_cosine_learning_rate(config, epoch) for epoch in range(20)]
        self.assertEqual(rates[0], config.learning_rate)
        self.assertTrue(all(left > right for left, right in pairwise(rates)))
        self.assertGreater(rates[-1], config.min_learning_rate)

    def test_resume_rejects_changed_training_schedule(self) -> None:
        expected = {
            "architecture": "resnet18_cifar10_v1",
            "dataset": "CIFAR-10",
            "target_epochs": 20,
            "learning_rate": 0.1,
            "min_learning_rate": 1e-5,
            "momentum": 0.9,
            "weight_decay": 5e-4,
            "train_batch_size": 128,
        }
        observed = {"train_config": {**expected, "target_epochs": 30}}
        with self.assertRaisesRegex(ValueError, "target_epochs"):
            _validate_resume_config(observed, expected)

    def test_orchestrator_only_reports_paired_observed_outputs(self) -> None:
        """Mock ML work, but verify report inputs and ordered-target enforcement."""

        reference = ClassificationOutputs(
            targets=(0, 1),
            predictions=(0, 1),
            probabilities=((0.9, 0.1), (0.2, 0.8)),
            correct_count=2,
        )
        candidate = ClassificationOutputs(
            targets=(0, 1),
            predictions=(0, 0),
            probabilities=((0.8, 0.2), (0.6, 0.4)),
            correct_count=1,
        )
        train_loader = _Loader()
        loaders = CifarLoaders(
            train=train_loader,
            calibration=[(_Input(), object())],
            test=[],
            calibration_sample_count=1,
            calibration_indices_sha256="c" * 64,
            test_order_sha256="t" * 64,
        )
        captured: dict[str, object] = {}

        def fake_save(_payload: object, path: Path) -> Path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"real-artifact-placeholder")
            return path

        def fake_report(**kwargs: object) -> object:
            captured.update(kwargs)
            return object()

        def fake_write_report(_report: object, path: Path) -> Path:
            path.write_text('{"computed":true}\n', encoding="utf-8")
            return path

        torch = SimpleNamespace(
            __version__="test-torch",
            cuda=SimpleNamespace(is_available=lambda: False),
            backends=SimpleNamespace(
                quantized=SimpleNamespace(supported_engines=("x86",))
            ),
            optim=SimpleNamespace(SGD=lambda *_args, **_kwargs: _Optimizer()),
            nn=SimpleNamespace(CrossEntropyLoss=lambda: object()),
        )
        fake_torchvision = types.ModuleType("torchvision")
        fake_torchvision.__version__ = "test-vision"
        with (
            tempfile.TemporaryDirectory() as temporary,
            patch.multiple(
                "pipeline.runner",
                _require_torch=lambda: torch,
                seed_everything=lambda _seed: None,
                build_cifar10_loaders=lambda **_kwargs: loaders,
                build_resnet18_cifar10=lambda: _Model(),
                evaluate_classifier=lambda _model, _loader, *, device: (
                    candidate if device == "cpu" and _model == "int8" else reference
                ),
                quantize_fx_post_training=lambda *_args, **_kwargs: SimpleNamespace(
                    quantized_model="int8",
                    backend="x86",
                    torch_version="test-torch",
                    calibration_batches=1,
                ),
                atomic_torch_save=fake_save,
                save_checkpoint=lambda **kwargs: fake_save({}, kwargs["output_path"]),
                load_checkpoint=lambda **_kwargs: {
                    "seed": 2026,
                    "epoch": 0,
                    "train_config": {
                        "architecture": "resnet18_cifar10_v1",
                        "dataset": "CIFAR-10",
                        "training_device": "cpu",
                        "target_epochs": 0,
                        "learning_rate": 0.1,
                        "min_learning_rate": 1e-5,
                        "momentum": 0.9,
                        "weight_decay": 5e-4,
                        "train_batch_size": 128,
                    },
                },
                build_validation_report=fake_report,
                write_report=fake_write_report,
            ),
            patch.dict(sys.modules, {"torchvision": fake_torchvision}),
        ):
            result = run_pipeline(
                PipelineConfig(
                    artifacts_dir=Path(temporary),
                    run_id="paired-output-test",
                    resume_checkpoint=Path(temporary) / "existing.pt",
                    epochs=0,
                    num_workers=0,
                    calibration_samples=1,
                ),
                log=None,
            )

        self.assertEqual(captured["targets"], reference.targets)
        self.assertEqual(captured["reference_predictions"], reference.predictions)
        self.assertEqual(captured["candidate_predictions"], candidate.predictions)
        self.assertEqual(result.sample_count, 2)
        self.assertAlmostEqual(result.reference_accuracy, 1.0)
        self.assertAlmostEqual(result.candidate_accuracy, 0.5)


if __name__ == "__main__":
    unittest.main()
