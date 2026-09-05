import math
import unittest

from validation.confidence_drift import mean_kl_divergence


class ConfidenceDriftTests(unittest.TestCase):
    def test_identical_rows_have_zero_drift(self) -> None:
        result = mean_kl_divergence(
            [[0.7, 0.3], [2.0, 8.0]],
            [[0.7, 0.3], [0.2, 0.8]],
        )
        self.assertAlmostEqual(result.value, 0.0, places=15)
        self.assertEqual(result.sample_count, 2)
        self.assertEqual(result.to_dict()["unit"], "nats")

    def test_known_kl_value_and_direction(self) -> None:
        result = mean_kl_divergence(
            [[0.5, 0.5]],
            [[0.9, 0.1]],
            epsilon=1e-15,
        )
        expected = 0.5 * math.log(0.5 / 0.9) + 0.5 * math.log(0.5 / 0.1)
        self.assertAlmostEqual(result.value, expected, places=12)
        self.assertEqual(result.to_dict()["direction"], "reference_to_candidate")

    def test_smoothing_makes_zero_candidate_probability_finite(self) -> None:
        result = mean_kl_divergence([[1.0, 0.0]], [[0.0, 1.0]])
        self.assertTrue(math.isfinite(result.value))
        self.assertGreater(result.value, 0.0)

    def test_rejects_bad_probability_matrices(self) -> None:
        with self.assertRaisesRegex(ValueError, "equal length"):
            mean_kl_divergence([[0.5, 0.5]], [])
        with self.assertRaisesRegex(ValueError, "different.*widths"):
            mean_kl_divergence([[0.5, 0.5]], [[0.2, 0.3, 0.5]])
        with self.assertRaisesRegex(ValueError, "earlier rows"):
            mean_kl_divergence(
                [[0.5, 0.5], [0.2, 0.3, 0.5]],
                [[0.5, 0.5], [0.2, 0.3, 0.5]],
            )
        with self.assertRaisesRegex(ValueError, "positive probability mass"):
            mean_kl_divergence([[0.0, 0.0]], [[0.5, 0.5]])
        with self.assertRaisesRegex(ValueError, "cannot be negative"):
            mean_kl_divergence([[1.1, -0.1]], [[0.5, 0.5]])
        with self.assertRaisesRegex(ValueError, "epsilon"):
            mean_kl_divergence([[0.5, 0.5]], [[0.5, 0.5]], epsilon=0.0)


if __name__ == "__main__":
    unittest.main()
