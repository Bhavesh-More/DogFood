"""Gemma generator backend over a local Ollama server (optional).

Speaks the Ollama HTTP API with the standard library so the image needs no
extra client. If Ollama is not reachable the backend raises
`BackendUnavailable`; the API then answers 503 and the UI stays hidden.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from .base import BackendUnavailable


class OllamaBackend:
    name = "ollama"

    def __init__(self, settings) -> None:
        if not settings.ollama_url:
            raise BackendUnavailable("OLLAMA_URL is not configured")
        self._url = settings.ollama_url
        self._summary_model = settings.summary_model
        self._feedback_model = settings.feedback_model
        self._timeout = settings.request_timeout_s

    def model_label(self) -> str:
        return f"{self._summary_model}/{self._feedback_model}"

    def _generate(self, model: str, prompt: str) -> str:
        body = json.dumps(
            {"model": model, "prompt": prompt, "stream": False, "options": {"temperature": 0.2, "num_predict": 256}}
        ).encode()
        req = urllib.request.Request(
            f"{self._url}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:  # noqa: S310 - local endpoint
                data = json.loads(resp.read().decode())
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise BackendUnavailable(f"ollama unreachable ({exc})") from exc
        text = str(data.get("response") or "").strip()
        if not text:
            raise BackendUnavailable("ollama returned an empty response")
        return text

    def summary(self, payload: dict) -> str:
        prompt = (
            "You summarise hackathon projects for judges. Write a factual 3-sentence "
            "summary using only the information given. Do not invent features, metrics "
            "or claims. Plain prose, no headings.\n\n"
            f"Title: {payload.get('title', '')}\n"
            f"Tagline: {payload.get('tagline', '')}\n"
            f"Description: {payload.get('description', '')}\n"
        )
        answers = payload.get("answers") or {}
        if answers:
            prompt += "Answers:\n" + "\n".join(f"- {k}: {v}" for k, v in answers.items()) + "\n"
        return self._generate(self._summary_model, prompt)

    def feedback(self, payload: dict) -> str:
        lines = [f"- {c.get('name')}: {c.get('value')}/{c.get('max')}" for c in payload.get("criteria") or []]
        prompt = (
            "Write a short, constructive judging comment for a hackathon project. "
            "3 to 4 sentences, neutral and specific, referencing the rubric. "
            "Never mention AI or that this is generated. Do not invent facts.\n\n"
            f"Project: {payload.get('title', '')}\n"
            f"Tagline: {payload.get('tagline', '')}\n"
            "Rubric:\n" + "\n".join(lines) + "\n"
        )
        notes = str(payload.get("notes") or "").strip()
        if notes:
            prompt += f"Reviewer notes to incorporate: {notes}\n"
        return self._generate(self._feedback_model, prompt)
