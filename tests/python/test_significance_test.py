import math
import unittest

from validation.significance_test import (
    MAX_EXACT_BINARY_PAIRS,
    Alternative,
    _exact_binomial_p_value,
    binary_correctness_signed_rank,
    wilcoxon_signed_rank,
)


def _brute_force_binomial_p_value(
    n: int, n_positive: int, alternative: Alternative
) -> float:
    observed_statistic = min(n_positive, n - n_positive)
    extreme = 0
    for signs in range(1 << n):
        simulated_positive = signs.bit_count()
        if alternative == "less":
            is_extreme = simulated_positive <= n_positive
        elif alternative == "greater":
            is_extreme = simulated_positive >= n_positive
        else:
            is_extreme = (
                min(simulated_positive, n - simulated_positive) <= observed_statistic
            )
        extreme += is_extreme
    return extreme / (1 << n)


class WilcoxonTests(unittest.TestCase):
    def test_exact_binomial_matches_brute_force_for_small_samples(self) -> None:
        alternatives: tuple[Alternative, ...] = ("two-sided", "less", "greater")
        for n in range(1, 9):
            for n_positive in range(n + 1):
                for alternative in alternatives:
                    with self.subTest(
                        n=n,
                        n_positive=n_positive,
                        alternative=alternative,
                    ):
                        expected = _brute_force_binomial_p_value(
                            n, n_positive, alternative
                        )
                        actual = _exact_binomial_p_value(n, n_positive, alternative)
                        self.assertEqual(actual, expected)

    def test_exact_two_sided_all_losses(self) -> None:
        result = wilcoxon_signed_rank([1, 1, 1], [0, 0, 0])
        self.assertTrue(result.valid)
        self.assertEqual(result.method, "exact_permutation")
        self.assertEqual(result.statistic, 0.0)
        self.assertEqual(result.n_nonzero, 3)
        self.assertAlmostEqual(result.p_value, 0.25)
        self.assertEqual(result.median_difference, -1.0)

    def test_exact_one_sided_direction_uses_candidate_minus_reference(self) -> None:
        result = wilcoxon_signed_rank([1, 1, 1], [0, 0, 0], alternative="less")
        self.assertAlmostEqual(result.p_value, 0.125)

    def test_all_zero_differences_are_honestly_not_applicable(self) -> None:
        result = wilcoxon_signed_rank([1, 0, 1], [1, 0, 1])
        self.assertFalse(result.valid)
        self.assertEqual(result.method, "not_applicable")
        self.assertEqual(result.p_value, 1.0)
        self.assertIn("undefined", result.note or "")

    def test_large_all_tied_sample_uses_exact_binomial_distribution(self) -> None:
        reference = [0] * 10 + [1] * 21
        candidate = [1] * 10 + [0] * 21

        result = wilcoxon_signed_rank(reference, candidate)

        self.assertEqual(result.method, "exact_permutation")
        self.assertEqual(result.statistic, 160.0)
        self.assertAlmostEqual(result.p_value, 0.07075554598122835)

    def test_large_all_tied_extremes_are_exact_and_symmetric(self) -> None:
        all_positive = wilcoxon_signed_rank([0] * 31, [1] * 31)
        all_negative = wilcoxon_signed_rank([1] * 31, [0] * 31)

        expected_p_value = 2 / (2**31)
        self.assertEqual(all_positive.method, "exact_permutation")
        self.assertEqual(all_negative.method, "exact_permutation")
        self.assertEqual(all_positive.p_value, expected_p_value)
        self.assertEqual(all_negative.p_value, expected_p_value)
        self.assertEqual(all_positive.statistic, 0.0)
        self.assertEqual(all_negative.statistic, 0.0)

    def test_large_untied_sample_uses_finite_normal_approximation(self) -> None:
        result = wilcoxon_signed_rank([0] * 31, range(1, 32))
        self.assertEqual(result.method, "normal_approximation")
        self.assertGreaterEqual(result.p_value, 0.0)
        self.assertLessEqual(result.p_value, 1.0)

    def test_generic_exact_distribution_still_honors_cutoff(self) -> None:
        exact = wilcoxon_signed_rank([0] * 3, [1, -2, 3], exact_max_n=3)
        approximate = wilcoxon_signed_rank([0] * 3, [1, -2, 3], exact_max_n=2)

        self.assertEqual(exact.method, "exact_permutation")
        self.assertEqual(approximate.method, "normal_approximation")

    def test_binary_correctness_counts_match_materialized_pairs(self) -> None:
        reference = [0] * 10 + [1] * 21 + [0] * 9
        candidate = [1] * 10 + [0] * 21 + [0] * 9

        aggregate = binary_correctness_signed_rank(40, gains=10, losses=21)
        materialized = wilcoxon_signed_rank(reference, candidate)

        self.assertEqual(aggregate, materialized)

    def test_binary_correctness_counts_preserve_all_ties_semantics(self) -> None:
        aggregate = binary_correctness_signed_rank(5, gains=0, losses=0)
        materialized = wilcoxon_signed_rank([0] * 5, [0] * 5)

        self.assertEqual(aggregate, materialized)

    def test_near_center_exact_binomial_uses_small_complement(self) -> None:
        n_pairs = 100_000
        result = binary_correctness_signed_rank(n_pairs, gains=49_999, losses=50_001)
        permutations = 1 << n_pairs
        expected = (permutations - math.comb(n_pairs, n_pairs // 2)) / permutations

        self.assertEqual(result.p_value, expected)

    def test_large_odd_balanced_counts_return_exactly_one_quickly(self) -> None:
        n_pairs = MAX_EXACT_BINARY_PAIRS - 1
        result = binary_correctness_signed_rank(
            n_pairs,
            gains=n_pairs // 2,
            losses=(n_pairs // 2) + 1,
        )

        self.assertEqual(result.p_value, 1.0)
        self.assertEqual(result.method, "exact_permutation")

    def test_binary_correctness_rejects_impractical_aggregate_size(self) -> None:
        with self.assertRaisesRegex(ValueError, "MAX_EXACT_BINARY_PAIRS"):
            binary_correctness_signed_rank(
                MAX_EXACT_BINARY_PAIRS + 1, gains=0, losses=0
            )
        with self.assertRaisesRegex(ValueError, "MAX_EXACT_BINARY_PAIRS"):
            _exact_binomial_p_value(MAX_EXACT_BINARY_PAIRS + 1, 0, "two-sided")

    def test_zero_tolerance_excludes_tiny_differences(self) -> None:
        result = wilcoxon_signed_rank(
            [1.0, 2.0], [1.0 + 1e-10, 2.0], zero_tolerance=1e-9
        )
        self.assertFalse(result.valid)

    def test_rejects_invalid_pairs_and_options(self) -> None:
        with self.assertRaisesRegex(ValueError, "equal length"):
            wilcoxon_signed_rank([1], [1, 2])
        with self.assertRaisesRegex(ValueError, "at least one"):
            wilcoxon_signed_rank([], [])
        with self.assertRaisesRegex(ValueError, "alternative"):
            wilcoxon_signed_rank([1], [0], alternative="bad")  # type: ignore[arg-type]
        with self.assertRaisesRegex(ValueError, "finite"):
            wilcoxon_signed_rank([float("nan")], [0])


if __name__ == "__main__":
    unittest.main()
