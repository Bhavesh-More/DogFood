"""Laya classifier backend (optional).

Laya (`convaiinnovations/laya`) is a System-1 decision model: give it a state
and typed questions and it returns typed answers in one forward pass. We ask a
single `choice` question to keep within Laya's sweet spot (it is weak with
many labels). If the package or weights are missing, construction raises
`BackendUnavailable` and the service keeps running with the heuristic backend.

Nothing here downloads weights at request time: mount `HF_HOME` or bake the
weights into the image. See docs/20-ai-service.md.
"""
from __future__ import annotations

from .. import text
from .base import BackendUnavailable


def _answer_for(result: object, key: str) -> str | None:
    """Best-effort extraction across plausible Laya result shapes."""
    if not isinstance(result, dict):
        return None
    node = result.get(key, result)
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        for field in ("choice", "answer", "label", "value", "text"):
            v = node.get(field)
            if isinstance(v, str) and v:
                return v
    return None


def _confidence_for(result: object, key: str) -> float | None:
    if not isinstance(result, dict):
        return None
    node = result.get(key)
    if isinstance(node, dict):
        for field in ("confidence", "probability", "prob"):
            v = node.get(field)
            if isinstance(v, (int, float)):
                return float(v)
    return None


class LayaBackend:
    name = "laya"

    def __init__(self, settings) -> None:
        try:
            import laya  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise BackendUnavailable(f"laya package not installed ({exc})") from exc
        self._laya = laya
        self._model = settings.classifier_model
        try:
            self._agent = laya.load(self._model, device=settings.device)
        except TypeError:
            self._agent = laya.load(self._model)

    def model_label(self) -> str:
        return self._model

    def classify(self, project: dict, vocab: tuple[str, ...]) -> tuple[list[str], str, float]:
        options = [v for v in dict.fromkeys([*vocab, *text.match_tags(" ".join(str(project.get(k) or "") for k in ("title", "tagline", "description")))])][:12]
        if "general" not in options:
            options.append("general")
        state = {
            "title": project.get("title"),
            "tagline": project.get("tagline"),
            "description": project.get("description"),
            "techTags": project.get("techTags") or [],
            "track": project.get("track"),
        }
        questions = [
            {"id": "primary", "type": "choice", "prompt": "Which category best fits this project?", "options": options},
        ]
        try:
            result = self._agent.predict(state, questions)  # type: ignore[union-attr]
        except Exception as exc:  # noqa: BLE001
            raise BackendUnavailable(f"laya predict failed ({exc})") from exc
        primary = _answer_for(result, "primary")
        heur_tags, heur_primary, heur_conf = text.classify_project(project, vocab)
        if primary and primary in options:
            tags = [primary, *[t for t in heur_tags if t != primary]]
            confidence = _confidence_for(result, "primary") or min(0.95, heur_conf + 0.2)
            return tags[:12], primary, round(float(confidence), 3)
        return heur_tags, heur_primary, heur_conf

    def expertise(self, judge: dict) -> list[str]:
        return text.expertise_tags(judge)
