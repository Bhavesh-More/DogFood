"""Request/response models. The JSON field names match the TypeScript DTOs."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProjectIn(BaseModel):
    id: str
    title: str = ""
    tagline: str = ""
    description: str = ""
    techTags: list[str] = Field(default_factory=list)
    track: str | None = None


class ClassifyRequest(BaseModel):
    projects: list[ProjectIn] = Field(default_factory=list)
    vocab: list[str] = Field(default_factory=list)
    model: str | None = None


class Classification(BaseModel):
    id: str
    tags: list[str]
    primaryTag: str
    confidence: float
    source: str
    model: str


class ClassifyResponse(BaseModel):
    results: list[Classification]


class JudgeIn(BaseModel):
    id: str
    name: str = ""
    scope: list[str] = Field(default_factory=list)
    declared: list[str] = Field(default_factory=list)
    historyTags: list[str] = Field(default_factory=list)
    model: str | None = None


class ExpertiseRequest(BaseModel):
    judges: list[JudgeIn] = Field(default_factory=list)


class Expertise(BaseModel):
    id: str
    tags: list[str]
    source: str
    model: str


class ExpertiseResponse(BaseModel):
    results: list[Expertise]


class AffinityProject(BaseModel):
    id: str
    tags: list[str] = Field(default_factory=list)
    track: str | None = None


class AffinityJudge(BaseModel):
    id: str
    tags: list[str] = Field(default_factory=list)
    scope: list[str] = Field(default_factory=list)


class AffinityRequest(BaseModel):
    projects: list[AffinityProject] = Field(default_factory=list)
    judges: list[AffinityJudge] = Field(default_factory=list)
    conflictPairs: list[list[str]] = Field(default_factory=list)


class AffinityPair(BaseModel):
    judgeId: str
    submissionId: str
    score: float


class AffinityResponse(BaseModel):
    pairs: list[AffinityPair]


class SummaryRequest(BaseModel):
    title: str = ""
    tagline: str = ""
    description: str = ""
    # Submission answers are arbitrary JSON (string, bool, number, list).
    answers: dict[str, Any] = Field(default_factory=dict)
    model: str | None = None


class SummaryResponse(BaseModel):
    summary: str
    model: str
    source: str


class FeedbackCriterion(BaseModel):
    name: str
    weight: float = 0.0
    value: float = 0.0
    max: float = 10.0
    guidance: str = ""


class FeedbackRequest(BaseModel):
    title: str = ""
    tagline: str = ""
    notes: str = ""
    criteria: list[FeedbackCriterion] = Field(default_factory=list)
    model: str | None = None


class FeedbackResponse(BaseModel):
    feedback: str
    model: str
    source: str
