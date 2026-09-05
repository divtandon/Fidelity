"""Thin, optional FastAPI adapter over a real serialized report.

No demo payload is embedded here.  If a report has not been generated, the
endpoint says so rather than presenting invented validation results.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Literal

from validation.serializer import ReportSchemaError, load_report

try:  # FastAPI is an optional delivery dependency, not a validation dependency.
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - environment-dependent optional branch
    FastAPI = None  # type: ignore[assignment,misc]
    HTTPException = None  # type: ignore[assignment,misc]
    CORSMiddleware = None  # type: ignore[assignment,misc]
    BaseModel = object  # type: ignore[assignment,misc]


LOGGER = logging.getLogger(__name__)
REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SERVICE_UNAVAILABLE_DETAIL = "The validation report service is unavailable."


class HealthResponse(BaseModel):
    status: Literal["ok"]
    report_available: bool


class ErrorResponse(BaseModel):
    detail: str


class ProvenanceResponse(BaseModel):
    kind: Literal["computed"]
    computed: Literal[True]


class ModelMetricsResponse(BaseModel):
    precision: str
    top1_accuracy: float
    correct_count: int


class SignificanceResponse(BaseModel):
    test: Literal["wilcoxon_signed_rank"]
    statistic: float
    p_value: float
    n_pairs: int
    n_nonzero: int
    method: Literal["exact_permutation", "normal_approximation", "not_applicable"]
    alternative: Literal["two-sided"]
    valid: bool
    median_difference: float
    note: str | None
    alpha: float
    is_significant: bool
    interpretation: Literal[
        "no_observed_pairwise_differences",
        "statistically_detectable_candidate_decrease",
        "statistically_detectable_candidate_increase",
        "statistically_detectable_pairwise_difference",
        "no_statistically_detectable_difference",
    ]


class ConfidenceDriftResponse(BaseModel):
    metric: Literal["kl_divergence"]
    value: float
    direction: Literal["reference_to_candidate"]
    unit: Literal["nats"]
    epsilon: float
    sample_count: int


class ClassAccuracyResponse(BaseModel):
    class_id: int
    class_name: str
    sample_count: int
    reference_correct: int
    candidate_correct: int
    reference_accuracy: float
    candidate_accuracy: float
    delta_pp: float


class PolicyResponse(BaseModel):
    name: str
    version: str
    alpha: float
    review_accuracy_drop_pp: float
    block_accuracy_drop_pp: float
    review_confidence_kl: float
    block_confidence_kl: float
    review_class_drop_pp: float
    block_class_drop_pp: float
    minimum_class_samples: int


class VerdictResponse(BaseModel):
    status: Literal["ready", "review", "blocked"]
    reasons: list[str]
    policy: PolicyResponse


class ReportResponse(BaseModel):
    schema_version: Literal["1.0.0"]
    provenance: ProvenanceResponse
    run_id: str
    created_at: str
    model: str
    dataset: str
    sample_count: int
    reference: ModelMetricsResponse
    candidate: ModelMetricsResponse
    accuracy_delta_pp: float
    significance: SignificanceResponse
    confidence_drift: ConfidenceDriftResponse
    per_class: list[ClassAccuracyResponse]
    verdict: VerdictResponse


def _configured_report_path() -> Path:
    configured = os.environ.get("FIDELITY_REPORT_PATH")
    if not configured:
        return (REPOSITORY_ROOT / "artifacts" / "latest-report.json").resolve()
    candidate = Path(configured).expanduser()
    if not candidate.is_absolute():
        candidate = REPOSITORY_ROOT / candidate
    return candidate.resolve()


def _load_computed_report(source: Path) -> dict[str, Any]:
    payload = load_report(source)
    provenance = payload["provenance"]
    if provenance["kind"] != "computed" or provenance["computed"] is not True:
        raise ReportSchemaError("demo reports cannot be served as computed evidence")
    return payload


def create_app(
    *,
    report_path: str | os.PathLike[str] | None = None,
    allowed_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ),
) -> Any:
    """Create an API that serves the latest validated report from disk."""

    if FastAPI is None:
        raise RuntimeError(
            "FastAPI is not installed. Install fastapi and uvicorn to run the HTTP adapter."
        )
    source = (
        Path(report_path).expanduser().resolve()
        if report_path is not None
        else _configured_report_path()
    )
    application = FastAPI(
        title="Fidelity report API",
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    if allowed_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(allowed_origins),
            allow_credentials=False,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @application.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        try:
            _load_computed_report(source)
        except (OSError, ReportSchemaError, TypeError, ValueError):
            report_available = False
        else:
            report_available = True
        return HealthResponse(status="ok", report_available=report_available)

    @application.get(
        "/api/reports/latest",
        response_model=ReportResponse,
        responses={
            404: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    def latest_report() -> dict[str, Any]:
        try:
            return _load_computed_report(source)
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=404, detail="No validation report is available yet."
            ) from error
        except (OSError, ReportSchemaError, TypeError, ValueError) as error:
            LOGGER.warning(
                "Stored validation report is unavailable (%s)",
                type(error).__name__,
            )
            raise HTTPException(
                status_code=503,
                detail=SERVICE_UNAVAILABLE_DETAIL,
            ) from error

    return application


# ``uvicorn api.app:app`` works when the optional dependency is installed.
app = create_app() if FastAPI is not None else None
