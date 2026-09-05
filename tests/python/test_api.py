import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    import httpx
except ImportError:  # pragma: no cover - optional dependency branch
    httpx = None

from api.app import (
    REPOSITORY_ROOT,
    SERVICE_UNAVAILABLE_DETAIL,
    FastAPI,
    _configured_report_path,
    create_app,
)
from validation.report import build_validation_report
from validation.serializer import write_report


def api_report():
    return build_validation_report(
        run_id="api-real-run",
        created_at="2026-09-04T20:00:00Z",
        model="measured-model",
        dataset="held-out-data",
        targets=[0, 1],
        reference_predictions=[0, 1],
        candidate_predictions=[0, 1],
        reference_probabilities=[[0.8, 0.2], [0.1, 0.9]],
        candidate_probabilities=[[0.8, 0.2], [0.1, 0.9]],
    )


@unittest.skipIf(
    httpx is None or FastAPI is None,
    "FastAPI test dependencies are optional",
)
class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_reports_absence_then_serves_serialized_report(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "latest-report.json"
            transport = httpx.ASGITransport(app=create_app(report_path=report_path))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                missing = await client.get("/api/reports/latest")
                self.assertEqual(missing.status_code, 404)
                self.assertIn("No validation report", missing.json()["detail"])

                expected = api_report().to_dict()
                write_report(expected, report_path)
                response = await client.get("/api/reports/latest")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), expected)
                health = await client.get("/api/health")
                self.assertTrue(health.json()["report_available"])

    async def test_rejects_corrupt_report_with_generic_service_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "latest-report.json"
            payload = api_report().to_dict()
            payload["verdict"]["status"] = "blocked"
            report_path.write_text(json.dumps(payload), encoding="utf-8")

            transport = httpx.ASGITransport(app=create_app(report_path=report_path))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                response = await client.get("/api/reports/latest")
                health = await client.get("/api/health")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"], SERVICE_UNAVAILABLE_DETAIL)
            self.assertNotIn("schema", response.json()["detail"].lower())
            self.assertFalse(health.json()["report_available"])

    async def test_api_never_serves_demo_fixture_as_computed_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "latest-report.json"
            payload = api_report().to_dict()
            payload["provenance"] = {"kind": "demo", "computed": False}
            write_report(payload, report_path)

            transport = httpx.ASGITransport(app=create_app(report_path=report_path))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                response = await client.get("/api/reports/latest")
                health = await client.get("/api/health")

            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"], SERVICE_UNAVAILABLE_DETAIL)
            self.assertFalse(health.json()["report_available"])

    async def test_invalid_utf8_is_a_generic_service_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "latest-report.json"
            report_path.write_bytes(b"\xff")
            transport = httpx.ASGITransport(app=create_app(report_path=report_path))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                response = await client.get("/api/reports/latest")

            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"], SERVICE_UNAVAILABLE_DETAIL)

    def test_default_report_path_is_anchored_to_repository(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                _configured_report_path(),
                (REPOSITORY_ROOT / "artifacts" / "latest-report.json").resolve(),
            )


if __name__ == "__main__":
    unittest.main()
