import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from validation.policy import PolicyThresholds
from validation.report import REPORT_SCHEMA_VERSION, build_validation_report
from validation.serializer import (
    ReportSchemaError,
    dumps_report,
    load_report,
    validate_report_payload,
    write_report,
)
from validation.significance_test import MAX_EXACT_BINARY_PAIRS


def make_report(*, degraded: bool = False):
    targets = [0, 0, 1, 1]
    reference_predictions = [0, 0, 1, 1]
    candidate_predictions = [0, 1, 1, 1] if degraded else list(reference_predictions)
    reference_probabilities = [
        [0.9, 0.1],
        [0.8, 0.2],
        [0.1, 0.9],
        [0.2, 0.8],
    ]
    candidate_probabilities = (
        [[0.85, 0.15], [0.4, 0.6], [0.15, 0.85], [0.25, 0.75]]
        if degraded
        else [list(row) for row in reference_probabilities]
    )
    return build_validation_report(
        run_id="run-0042",
        created_at="2026-09-04T12:30:00-07:00",
        model="ResNet-18",
        dataset="CIFAR-10 test",
        targets=targets,
        reference_predictions=reference_predictions,
        candidate_predictions=candidate_predictions,
        reference_probabilities=reference_probabilities,
        candidate_probabilities=candidate_probabilities,
        class_names=["airplane", "automobile"],
    )


class ReportTests(unittest.TestCase):
    def test_builds_real_metrics_and_normalizes_timestamp(self) -> None:
        report = make_report(degraded=True)
        payload = report.to_dict()

        self.assertEqual(payload["schema_version"], REPORT_SCHEMA_VERSION)
        self.assertEqual(payload["provenance"], {"kind": "computed", "computed": True})
        self.assertEqual(payload["created_at"], "2026-09-04T19:30:00Z")
        self.assertEqual(payload["sample_count"], 4)
        self.assertEqual(payload["reference"]["top1_accuracy"], 1.0)
        self.assertEqual(payload["candidate"]["top1_accuracy"], 0.75)
        self.assertEqual(payload["accuracy_delta_pp"], -25.0)
        self.assertEqual(payload["per_class"][0]["delta_pp"], -50.0)
        self.assertEqual(payload["verdict"]["status"], "blocked")
        self.assertEqual(payload["significance"]["test"], "wilcoxon_signed_rank")

    def test_identical_observations_do_not_claim_equivalence(self) -> None:
        payload = make_report().to_dict()
        self.assertEqual(payload["verdict"]["status"], "ready")
        self.assertFalse(payload["significance"]["valid"])
        self.assertEqual(
            payload["significance"]["interpretation"],
            "no_observed_pairwise_differences",
        )
        self.assertNotIn("equivalent", json.dumps(payload).lower())

    def test_requires_probability_row_for_every_sample(self) -> None:
        with self.assertRaisesRegex(ValueError, "row count"):
            build_validation_report(
                run_id="x",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0],
                reference_predictions=[0],
                candidate_predictions=[0],
                reference_probabilities=[[0.5, 0.5], [0.5, 0.5]],
                candidate_probabilities=[[0.5, 0.5], [0.5, 0.5]],
            )

    def test_builder_rejects_impractical_sample_count_before_probability_work(
        self,
    ) -> None:
        with (
            patch("validation.report.MAX_EXACT_BINARY_PAIRS", 1),
            self.assertRaisesRegex(ValueError, "MAX_EXACT_BINARY_PAIRS"),
        ):
            build_validation_report(
                run_id="too-large",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0, 0],
                reference_predictions=[0, 0],
                candidate_predictions=[0, 0],
                # The cap should fire before these deliberately empty matrices.
                reference_probabilities=[],
                candidate_probabilities=[],
            )

    def test_materializes_one_shot_probability_rows(self) -> None:
        reference_rows = (iter(row) for row in ([0.9, 0.1], [0.2, 0.8]))
        candidate_rows = (iter(row) for row in ([0.8, 0.2], [0.1, 0.9]))

        report = build_validation_report(
            run_id="generators",
            created_at="2026-01-01T00:00:00Z",
            model="m",
            dataset="d",
            targets=(target for target in [0, 1]),
            reference_predictions=(prediction for prediction in [0, 1]),
            candidate_predictions=(prediction for prediction in [0, 1]),
            reference_probabilities=reference_rows,
            candidate_probabilities=candidate_rows,
        )

        self.assertEqual(report.sample_count, 2)
        self.assertEqual(report.confidence_drift.sample_count, 2)

    def test_rejects_prediction_probability_argmax_mismatches(self) -> None:
        for prediction_name in ("reference_predictions", "candidate_predictions"):
            arguments = {
                "reference_predictions": [0],
                "candidate_predictions": [0],
            }
            arguments[prediction_name] = [1]
            with (
                self.subTest(prediction_name=prediction_name),
                self.assertRaisesRegex(
                    ValueError, rf"{prediction_name}\[0\].*argmax.*class 0"
                ),
            ):
                build_validation_report(
                    run_id="argmax",
                    created_at="2026-01-01T00:00:00Z",
                    model="m",
                    dataset="d",
                    targets=[0],
                    reference_probabilities=[[0.8, 0.2]],
                    candidate_probabilities=[[0.8, 0.2]],
                    **arguments,
                )

    def test_probability_ties_resolve_to_smallest_class_id(self) -> None:
        report = build_validation_report(
            run_id="tie",
            created_at="2026-01-01T00:00:00Z",
            model="m",
            dataset="d",
            targets=[0],
            reference_predictions=[0],
            candidate_predictions=[0],
            reference_probabilities=[[0.5, 0.5]],
            candidate_probabilities=[[0.5, 0.5]],
        )
        self.assertEqual(report.reference.correct_count, 1)

        with self.assertRaisesRegex(ValueError, "argmax.*class 0"):
            build_validation_report(
                run_id="tie-wrong",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0],
                reference_predictions=[1],
                candidate_predictions=[0],
                reference_probabilities=[[0.5, 0.5]],
                candidate_probabilities=[[0.5, 0.5]],
            )

    def test_requires_nonzero_stable_probability_class_width(self) -> None:
        single_class_report = build_validation_report(
            run_id="single-class",
            created_at="2026-01-01T00:00:00Z",
            model="m",
            dataset="d",
            targets=[0],
            reference_predictions=[0],
            candidate_predictions=[0],
            reference_probabilities=[[1.0]],
            candidate_probabilities=[[1.0]],
        )
        self.assertEqual(single_class_report.confidence_drift.value, 0.0)

        with self.assertRaisesRegex(ValueError, "at least one class"):
            build_validation_report(
                run_id="empty-row",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0],
                reference_predictions=[0],
                candidate_predictions=[0],
                reference_probabilities=[[]],
                candidate_probabilities=[[]],
            )

        with self.assertRaisesRegex(ValueError, "class width 3; expected 2"):
            build_validation_report(
                run_id="unstable-width",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0, 1],
                reference_predictions=[0, 1],
                candidate_predictions=[0, 1],
                reference_probabilities=[[0.8, 0.2], [0.1, 0.2, 0.7]],
                candidate_probabilities=[[0.8, 0.2], [0.1, 0.9]],
            )

        with self.assertRaisesRegex(ValueError, "same class width"):
            build_validation_report(
                run_id="cross-width",
                created_at="2026-01-01T00:00:00Z",
                model="m",
                dataset="d",
                targets=[0],
                reference_predictions=[0],
                candidate_predictions=[0],
                reference_probabilities=[[0.8, 0.2]],
                candidate_probabilities=[[0.8, 0.1, 0.1]],
            )

    def test_rejects_class_ids_outside_probability_width(self) -> None:
        for label_name in (
            "targets",
            "reference_predictions",
            "candidate_predictions",
        ):
            arguments = {
                "targets": [0],
                "reference_predictions": [0],
                "candidate_predictions": [0],
            }
            arguments[label_name] = [2]
            with (
                self.subTest(label_name=label_name),
                self.assertRaisesRegex(
                    ValueError, rf"{label_name}\[0\].*outside.*\[0, 2\)"
                ),
            ):
                build_validation_report(
                    run_id="range",
                    created_at="2026-01-01T00:00:00Z",
                    model="m",
                    dataset="d",
                    reference_probabilities=[[0.8, 0.2]],
                    candidate_probabilities=[[0.8, 0.2]],
                    **arguments,
                )

    def test_rejects_non_finite_or_negative_probability_entries(self) -> None:
        for matrix_name in (
            "reference_probabilities",
            "candidate_probabilities",
        ):
            for invalid, message in (
                (math.nan, "finite number"),
                (math.inf, "finite number"),
                (-0.1, "cannot be negative"),
            ):
                matrices = {
                    "reference_probabilities": [[0.8, 0.2]],
                    "candidate_probabilities": [[0.8, 0.2]],
                }
                matrices[matrix_name] = [[invalid, 1.0]]
                with (
                    self.subTest(matrix_name=matrix_name, invalid=invalid),
                    self.assertRaisesRegex(ValueError, message),
                ):
                    build_validation_report(
                        run_id="invalid-probability",
                        created_at="2026-01-01T00:00:00Z",
                        model="m",
                        dataset="d",
                        targets=[0],
                        reference_predictions=[0],
                        candidate_predictions=[0],
                        **matrices,
                    )

    def test_custom_policy_is_serialized_with_verdict(self) -> None:
        policy = PolicyThresholds(policy_name="team_release", policy_version="2")
        base = make_report()
        report = build_validation_report(
            run_id="custom",
            created_at="2026-01-01T00:00:00Z",
            model="m",
            dataset="d",
            targets=[0, 1],
            reference_predictions=[0, 1],
            candidate_predictions=[0, 1],
            reference_probabilities=[[0.9, 0.1], [0.1, 0.9]],
            candidate_probabilities=[[0.9, 0.1], [0.1, 0.9]],
            policy=policy,
        )
        self.assertEqual(report.verdict.policy.policy_name, "team_release")
        self.assertEqual(base.schema_version, report.schema_version)


class SerializerTests(unittest.TestCase):
    def test_serialization_is_deterministic_and_round_trips(self) -> None:
        report = make_report(degraded=True)
        first = dumps_report(report)
        second = dumps_report(report)
        self.assertEqual(first, second)
        self.assertTrue(first.endswith("\n"))

        with tempfile.TemporaryDirectory() as directory:
            output = write_report(report, Path(directory) / "nested" / "report.json")
            self.assertTrue(output.is_file())
            loaded = load_report(output)
        self.assertEqual(loaded, report.to_dict())

    def test_schema_boundary_rejects_wrong_version_or_missing_data(self) -> None:
        payload = make_report().to_dict()
        payload["schema_version"] = "99.0.0"
        with self.assertRaisesRegex(ReportSchemaError, "unsupported"):
            validate_report_payload(payload)
        with self.assertRaisesRegex(ReportSchemaError, "missing"):
            validate_report_payload({"schema_version": REPORT_SCHEMA_VERSION})

    def test_schema_boundary_rejects_tampered_arithmetic_and_verdict(self) -> None:
        payload = make_report(degraded=True).to_dict()
        payload["candidate"]["top1_accuracy"] = 0.99
        with self.assertRaisesRegex(ReportSchemaError, "correct_count/sample_count"):
            validate_report_payload(payload)

        payload = make_report(degraded=True).to_dict()
        payload["verdict"]["status"] = "ready"
        with self.assertRaisesRegex(ReportSchemaError, "does not match"):
            validate_report_payload(payload)

    def test_count_derived_delta_drives_threshold_policy(self) -> None:
        sample_count = 200
        report = build_validation_report(
            run_id="threshold",
            created_at="2026-01-01T00:00:00Z",
            model="m",
            dataset="d",
            targets=[0] * sample_count,
            reference_predictions=[0] * sample_count,
            candidate_predictions=[1] + [0] * (sample_count - 1),
            reference_probabilities=[[0.9, 0.1]] * sample_count,
            candidate_probabilities=[[0.1, 0.9]] + [[0.9, 0.1]] * (sample_count - 1),
        )
        payload = report.to_dict()
        # One ULP toward zero is still an acceptable representation of the
        # exact count-derived -0.5 pp value, but it must not drive policy.
        payload["accuracy_delta_pp"] = math.nextafter(-0.5, 0.0)
        payload["verdict"]["status"] = "ready"
        payload["verdict"]["reasons"] = []

        with self.assertRaisesRegex(ReportSchemaError, "verdict does not match"):
            validate_report_payload(payload)

    def test_rejects_tampered_binary_correctness_significance(self) -> None:
        mutations = {
            "statistic": 123.0,
            "p_value": 0.001,
            "n_nonzero": 2,
            "method": "normal_approximation",
            "median_difference": -1.0,
            "note": "forged evidence",
            "alternative": "less",
        }
        for field, value in mutations.items():
            payload = make_report(degraded=True).to_dict()
            payload["significance"][field] = value
            with (
                self.subTest(field=field),
                self.assertRaisesRegex(ReportSchemaError, "significance"),
            ):
                validate_report_payload(payload)

    def test_provenance_allows_explicit_demo_fixture_but_rejects_mixed_state(
        self,
    ) -> None:
        payload = make_report().to_dict()
        payload["provenance"] = {"kind": "demo", "computed": False}
        validate_report_payload(payload)

        for provenance in (
            {"kind": "demo", "computed": True},
            {"kind": "computed", "computed": False},
        ):
            payload["provenance"] = provenance
            with (
                self.subTest(provenance=provenance),
                self.assertRaisesRegex(ReportSchemaError, "provenance"),
            ):
                validate_report_payload(payload)

    def test_loader_rejects_duplicate_keys_and_non_finite_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text(
                '{"schema_version":"1.0.0","schema_version":"1.0.0"}',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ReportSchemaError, "repeats object key"):
                load_report(path)
            path.write_text('{"schema_version":NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ReportSchemaError, "non-finite"):
                load_report(path)

    def test_loader_contains_malformed_utf8_types_numbers_and_size(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"

            path.write_bytes(b"\xff")
            with self.assertRaisesRegex(ReportSchemaError, "UTF-8"):
                load_report(path)

            payload = make_report().to_dict()
            payload["significance"]["method"] = []
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ReportSchemaError, "method"):
                load_report(path)

            path.write_text('{"sample_count":' + "9" * 5000 + "}", encoding="utf-8")
            with self.assertRaisesRegex(ReportSchemaError, "invalid value"):
                load_report(path)

            path.write_text(json.dumps(make_report().to_dict()), encoding="utf-8")
            with self.assertRaisesRegex(ReportSchemaError, "size limit"):
                load_report(path, max_bytes=32)

    def test_schema_boundary_rejects_impractical_sample_count(self) -> None:
        payload = make_report().to_dict()
        payload["sample_count"] = MAX_EXACT_BINARY_PAIRS + 1
        with self.assertRaisesRegex(ReportSchemaError, "no greater than"):
            validate_report_payload(payload)


if __name__ == "__main__":
    unittest.main()
