"""Backend selection: deterministic heuristic by default, optional models."""
from __future__ import annotations

from .base import BackendUnavailable, ClassifierBackend, GeneratorBackend
from .heuristic import HeuristicBackend

__all__ = [
    "BackendUnavailable",
    "ClassifierBackend",
    "GeneratorBackend",
    "HeuristicBackend",
    "get_classifier",
    "get_generator",
]


def get_classifier(settings) -> ClassifierBackend:
    if settings.classifier_backend == "laya":
        from .laya import LayaBackend

        return LayaBackend(settings)
    return HeuristicBackend()


def get_generator(settings) -> GeneratorBackend:
    if settings.generator_backend == "ollama":
        from .ollama import OllamaBackend

        return OllamaBackend(settings)
    return HeuristicBackend()
