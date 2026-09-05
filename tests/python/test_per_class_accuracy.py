import unittest

from validation.per_class_accuracy import compute_per_class_accuracy


class PerClassAccuracyTests(unittest.TestCase):
    def test_computes_sorted_observed_classes_and_counts(self) -> None:
        result = compute_per_class_accuracy(
            targets=[1, 0, 1, 0, 1],
            reference_predictions=[1, 0, 0, 1, 1],
            candidate_predictions=[1, 0, 1, 0, 0],
            class_names=["airplane", "automobile"],
        )

        self.assertEqual([item.class_id for item in result], [0, 1])
        self.assertEqual(result[0].class_name, "airplane")
        self.assertEqual(result[0].sample_count, 2)
        self.assertEqual(result[0].reference_correct, 1)
        self.assertEqual(result[0].candidate_correct, 2)
        self.assertAlmostEqual(result[0].delta_pp, 50.0)
        self.assertEqual(result[1].sample_count, 3)
        self.assertAlmostEqual(result[1].reference_accuracy, 2 / 3)
        self.assertAlmostEqual(result[1].candidate_accuracy, 2 / 3)

    def test_predicted_only_class_does_not_create_empty_row(self) -> None:
        result = compute_per_class_accuracy([0], [9], [8])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].class_id, 0)
        self.assertEqual(result[0].reference_accuracy, 0.0)

    def test_rejects_empty_mismatched_or_invalid_inputs(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one"):
            compute_per_class_accuracy([], [], [])
        with self.assertRaisesRegex(ValueError, "equal length"):
            compute_per_class_accuracy([0], [0, 1], [0])
        with self.assertRaisesRegex(TypeError, "integer class id"):
            compute_per_class_accuracy([0.0], [0], [0])  # type: ignore[list-item]
        with self.assertRaisesRegex(ValueError, "non-negative"):
            compute_per_class_accuracy([-1], [0], [0])

    def test_requires_names_for_observed_ids_when_names_are_supplied(self) -> None:
        with self.assertRaisesRegex(ValueError, "no entry"):
            compute_per_class_accuracy([2], [2], [2], class_names=["zero"])


if __name__ == "__main__":
    unittest.main()
