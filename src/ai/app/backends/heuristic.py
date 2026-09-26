"""Deterministic backend. Runs everywhere, offline, with no weights."""
from __future__ import annotations

from .. import text


class HeuristicBackend:
    name = "heuristic"

    def model_label(self) -> str:
        return "heuristic-v1"

    # ClassifierBackend -------------------------------------------------
    def classify(self, project: dict, vocab: tuple[str, ...]) -> tuple[list[str], str, float]:
        return text.classify_project(project, vocab)

    def expertise(self, judge: dict) -> list[str]:
        return text.expertise_tags(judge)

    # GeneratorBackend --------------------------------------------------
    def summary(self, payload: dict) -> str:
        return text.summarize(
            str(payload.get("title") or ""),
            str(payload.get("tagline") or ""),
            str(payload.get("description") or ""),
            {str(k): str(v) for k, v in (payload.get("answers") or {}).items()},
        )

    def feedback(self, payload: dict) -> str:
        return text.feedback(
            str(payload.get("title") or ""),
            list(payload.get("criteria") or []),
            str(payload.get("notes") or ""),
        )
