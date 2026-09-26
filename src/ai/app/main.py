"""Dogfood AI sidecar.

An independent, containerizable service that the API talks to over the Docker
network. Offline by default: the deterministic heuristic backend needs no
weights and no network. Laya (classification) and Gemma via Ollama
(summary/feedback) are opt-in through environment variables.

Endpoints
  GET  /health          liveness + effective configuration
  POST /v1/classify     project tags + primary category
  POST /v1/expertise    judge expertise tags
  POST /v1/affinity     judge <-> project affinity scores
  POST /v1/summary      project summary (Gemma / extractive)
  POST /v1/feedback     judge feedback draft (Gemma / template)
"""
from __future__ import annotations

from fastapi import Depends, FastAPI, Header, HTTPException

from . import text
from .backends import BackendUnavailable, HeuristicBackend, get_classifier, get_generator
from .config import Settings
from .schemas import (
    AffinityRequest,
    AffinityResponse,
    ClassifyRequest,
    ClassifyResponse,
    Classification,
    Expertise,
    ExpertiseRequest,
    ExpertiseResponse,
    FeedbackRequest,
    FeedbackResponse,
    SummaryRequest,
    SummaryResponse,
)

settings = Settings.from_env()
app = FastAPI(title="Dogfood AI", version="1.0.0", docs_url="/docs", openapi_url="/openapi.json")

_classifier = None
_generator = None


def classifier():
    """Configured classifier, degrading to heuristic if its weights are absent."""
    global _classifier
    if _classifier is None:
        try:
            _classifier = get_classifier(settings)
        except BackendUnavailable:
            _classifier = HeuristicBackend()
    return _classifier


def generator():
    global _generator
    if _generator is None:
        try:
            _generator = get_generator(settings)
        except BackendUnavailable:
            _generator = HeuristicBackend()
    return _generator


def require_key(authorization: str | None = Header(default=None)) -> None:
    if settings.api_key and authorization != f"Bearer {settings.api_key}":
        raise HTTPException(status_code=401, detail="Invalid or missing AI service key")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "device": settings.device,
        "classifierBackend": settings.classifier_backend,
        "generatorBackend": settings.generator_backend,
        "classifierModel": settings.classifier_model,
        "summaryModel": settings.summary_model,
        "feedbackModel": settings.feedback_model,
        "vocab": list(settings.vocab),
    }


@app.post("/v1/classify", response_model=ClassifyResponse, dependencies=[Depends(require_key)])
def classify(body: ClassifyRequest) -> ClassifyResponse:
    backend = classifier()
    vocab = tuple(body.vocab) or settings.vocab
    results: list[Classification] = []
    for project in body.projects[: settings.max_batch]:
        tags, primary, confidence = backend.classify(project.model_dump(), vocab)
        results.append(
            Classification(
                id=project.id,
                tags=tags,
                primaryTag=primary,
                confidence=confidence,
                source=backend.name,
                model=(body.model or backend.model_label()),
            )
        )
    return ClassifyResponse(results=results)


@app.post("/v1/expertise", response_model=ExpertiseResponse, dependencies=[Depends(require_key)])
def expertise(body: ExpertiseRequest) -> ExpertiseResponse:
    backend = classifier()
    results: list[Expertise] = []
    for judge in body.judges[: settings.max_batch]:
        results.append(
            Expertise(
                id=judge.id,
                tags=backend.expertise(judge.model_dump()),
                source=backend.name,
                model=backend.model_label(),
            )
        )
    return ExpertiseResponse(results=results)


@app.post("/v1/affinity", response_model=AffinityResponse, dependencies=[Depends(require_key)])
def affinity(body: AffinityRequest) -> AffinityResponse:
    conflicts = {f"{a}\u0000{b}" for a, b in body.conflictPairs}
    pairs = []
    for project in body.projects[: settings.max_batch]:
        for judge in body.judges[: settings.max_batch]:
            if f"{judge.id}\u0000{project.id}" in conflicts:
                continue
            scope_match = bool(set(t.lower() for t in judge.scope) & {*(t.lower() for t in project.tags), (project.track or "").lower()})
            score = text.affinity(project.tags, judge.tags, scope_match)
            pairs.append({"judgeId": judge.id, "submissionId": project.id, "score": score})
    return AffinityResponse(pairs=pairs)


@app.post("/v1/summary", response_model=SummaryResponse, dependencies=[Depends(require_key)])
def summary(body: SummaryRequest) -> SummaryResponse:
    backend = generator()
    value = backend.summary(body.model_dump())
    return SummaryResponse(summary=value, model=(body.model or backend.model_label()), source=backend.name)


@app.post("/v1/feedback", response_model=FeedbackResponse, dependencies=[Depends(require_key)])
def feedback(body: FeedbackRequest) -> FeedbackResponse:
    backend = generator()
    value = backend.feedback(body.model_dump())
    return FeedbackResponse(feedback=value, model=(body.model or backend.model_label()), source=backend.name)
