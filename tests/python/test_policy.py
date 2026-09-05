import unittest

from validation.per_class_accuracy import compute_per_class_accuracy
from validation.policy import PolicyThresholds, evaluate_policy
from validation.significance_test import wilcoxon_signed_rank


class PolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.per_class = compute_per_class_accuracy([0, 0], [0, 0], [0, 0])
        self.no_difference = wilcoxon_signed_rank([1, 1], [1, 1])

    def test_ready_when_no_guardrail_is_crossed(self) -> None:
        verdict = evaluate_policy(
            accuracy_delta_pp=-0.1,
            confidence_kl=0.001,
            per_class=self.per_class,
            significance=self.no_difference,
        )
        self.assertEqual(verdict.status, "ready")
        self.assertEqual(verdict.reasons, ())

    def test_review_threshold_is_inclusive(self) -> None:
        verdict = evaluate_policy(
            accuracy_delta_pp=-0.5,
            confidence_kl=0.0,
            per_class=self.per_class,
            significance=self.no_difference,
        )
        self.assertEqual(verdict.status, "review")
        self.assertIn("review threshold", verdict.reasons[0])

    def test_block_takes_precedence_and_retains_reasons(self) -> None:
        degraded_class = compute_per_class_accuracy(
            [0] * 10,
            [0] * 10,
            [1] * 10,
        )
        verdict = evaluate_policy(
            accuracy_delta_pp=-2.0,
            confidence_kl=0.02,
            per_class=degraded_class,
            significance=wilcoxon_signed_rank([1] * 10, [0] * 10),
        )
        self.assertEqual(verdict.status, "blocked")
        self.assertGreaterEqual(len(verdict.reasons), 3)
        self.assertTrue(any("block threshold" in reason for reason in verdict.reasons))

    def test_policy_rejects_inverted_thresholds(self) -> None:
        with self.assertRaisesRegex(ValueError, "block accuracy"):
            PolicyThresholds(
                review_accuracy_drop_pp=2.0,
                block_accuracy_drop_pp=1.0,
            )


if __name__ == "__main__":
    unittest.main()
