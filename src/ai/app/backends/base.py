"""Backend interfaces. A backend either answers, or raises `BackendUnavailable`
so the API can answer 503 without pretending a model was used."""
from __future__ import annotations

from typing import Protocol


class BackendUnavailable(RuntimeError):
    """The requested backend or its weights/endpoint are not available."""


class ClassifierBackend(Protocol):
    name: str

    def model_label(self) -> str: ...

    def classify(self, project: dict, vocab: tuple[str, ...]) -> tuple[list[str], str, float]: ...

    def expertise(self, judge: dict) -> list[str]: ...


class GeneratorBackend(Protocol):
    name: str

    def model_label(self) -> str: ...

    def summary(self, payload: dict) -> str: ...

    def feedback(self, payload: dict) -> str: ...
