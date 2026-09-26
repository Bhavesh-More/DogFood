"""Environment-driven configuration for the AI sidecar.

Every setting has a safe offline default: the service starts with the
deterministic heuristic backend, downloads nothing and calls nothing.
Model-backed backends are opt-in and read pre-provisioned weights.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def resolve_device(preference: str) -> str:
    """Resolve `auto|cpu|cuda|mps` to a concrete device.

    `cuda` and `cpu` work inside Linux containers. `mps` (Apple Silicon GPU)
    is only available when the service runs natively on macOS — Docker on
    macOS has no Metal passthrough, so there it degrades to cpu.
    """
    pref = (preference or "auto").strip().lower()
    if pref in {"cpu", "cuda", "mps"}:
        return pref
    try:  # only import torch when it is actually installed
        import torch  # type: ignore

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            return "mps"
    except Exception:  # noqa: BLE001 - torch is optional
        pass
    return "cpu"


@dataclass(frozen=True)
class Settings:
    device: str
    classifier_backend: str  # heuristic | laya
    generator_backend: str  # heuristic | ollama
    classifier_model: str
    summary_model: str
    feedback_model: str
    ollama_url: str
    api_key: str | None
    max_batch: int
    request_timeout_s: float
    vocab: tuple[str, ...]

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        e = env if env is not None else dict(os.environ)
        vocab = tuple(
            t.strip().lower()
            for t in (e.get("AI_VOCAB") or "").split(",")
            if t.strip()
        )
        return cls(
            device=resolve_device(e.get("AI_DEVICE", "auto")),
            classifier_backend=(e.get("AI_CLASSIFIER_BACKEND", "heuristic") or "heuristic").lower(),
            generator_backend=(e.get("AI_GENERATOR_BACKEND", "heuristic") or "heuristic").lower(),
            classifier_model=e.get("AI_CLASSIFIER_MODEL", "convaiinnovations/laya"),
            # Gemma 4 sizes: E2B is the lightest, E4B is the effective-4B model.
            summary_model=e.get("AI_SUMMARY_MODEL", "gemma-4-E2B"),
            feedback_model=e.get("AI_FEEDBACK_MODEL", "gemma-4-E4B"),
            ollama_url=(e.get("OLLAMA_URL", "http://127.0.0.1:11434") or "").rstrip("/"),
            api_key=(e.get("AI_SERVICE_KEY") or None),
            max_batch=int(e.get("AI_MAX_BATCH", "64")),
            request_timeout_s=float(e.get("AI_REQUEST_TIMEOUT_S", "60")),
            vocab=vocab,
        )
