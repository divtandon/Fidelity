import builtins
import unittest
from unittest.mock import patch

from quantize.run_ptq import (
    ClassificationOutputs,
    PyTorchUnavailableError,
    evaluate_classifier,
    quantize_fx_post_training,
)

try:
    import torch
except (ImportError, OSError):  # pragma: no cover - optional dependency branch
    torch = None


class QuantizeContractTests(unittest.TestCase):
    def test_observed_outputs_calculate_accuracy_without_dependencies(self) -> None:
        outputs = ClassificationOutputs(
            targets=(0, 1, 1),
            predictions=(0, 0, 1),
            probabilities=((0.8, 0.2), (0.6, 0.4), (0.1, 0.9)),
            correct_count=2,
        )
        self.assertEqual(outputs.sample_count, 3)
        self.assertAlmostEqual(outputs.top1_accuracy, 2 / 3)

    def test_observed_outputs_reject_tampered_correct_count(self) -> None:
        with self.assertRaisesRegex(ValueError, "correct_count"):
            ClassificationOutputs(
                targets=(0,),
                predictions=(0,),
                probabilities=((0.8, 0.2),),
                correct_count=0,
            )

    def test_observed_outputs_reject_non_probability_rows(self) -> None:
        with self.assertRaisesRegex(ValueError, "sum to one"):
            ClassificationOutputs(
                targets=(0,),
                predictions=(0,),
                probabilities=((8.0, 2.0),),
                correct_count=1,
            )

    def test_missing_pytorch_has_actionable_error_instead_of_fake_result(self) -> None:
        original_import = builtins.__import__

        def import_without_torch(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "torch":
                raise ImportError("simulated missing torch")
            return original_import(name, globals, locals, fromlist, level)

        with (
            patch("builtins.__import__", side_effect=import_without_torch),
            self.assertRaisesRegex(PyTorchUnavailableError, "PyTorch is required"),
        ):
            quantize_fx_post_training(
                object(),
                [],
                example_inputs=(object(),),
            )

    @unittest.skipIf(torch is None, "PyTorch is optional on this Python version")
    def test_real_torch_fx_ptq_and_evaluation_smoke(self) -> None:
        torch.manual_seed(7)
        model = torch.nn.Sequential(
            torch.nn.Linear(4, 8),
            torch.nn.ReLU(),
            torch.nn.Linear(8, 2),
        ).eval()
        inputs = torch.randn(6, 4)
        targets = torch.tensor([0, 1, 0, 1, 0, 1], dtype=torch.long)
        supported = tuple(torch.backends.quantized.supported_engines)
        backend = next(
            (
                name
                for name in ("onednn", "x86", "fbgemm", "qnnpack")
                if name in supported
            ),
            None,
        )
        if backend is None:
            self.skipTest(
                "installed PyTorch build has no supported quantized CPU engine"
            )

        result = quantize_fx_post_training(
            model,
            [(inputs, targets)],
            example_inputs=(inputs,),
            backend=backend,
        )
        self.assertEqual(result.calibration_batches, 1)
        self.assertIsNot(result.quantized_model, model)
        self.assertTrue(
            any(
                ".quantized." in type(module).__module__
                for module in result.quantized_model.modules()
            ),
            "converted graph should contain quantized operations",
        )
        observed = evaluate_classifier(
            result.quantized_model,
            [(inputs, targets)],
        )
        self.assertEqual(observed.sample_count, 6)
        self.assertEqual(len(observed.probabilities[0]), 2)


if __name__ == "__main__":
    unittest.main()
