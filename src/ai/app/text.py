"""Deterministic text intelligence used by the heuristic backend.

No models, no network, no randomness: the same input always produces the same
output. This keeps the sidecar useful offline (and in tests) even when the
Laya/Gemma weights are not provisioned.
"""
from __future__ import annotations

import re
from collections import Counter

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+.#-]+")

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your", "you", "our",
    "are", "was", "were", "will", "can", "has", "have", "its", "it's", "they", "them",
    "their", "not", "but", "all", "any", "use", "using", "used", "make", "makes",
    "made", "get", "gets", "one", "two", "more", "most", "who", "what", "when", "where",
    "how", "why", "via", "per", "out", "off", "over", "under", "then", "than", "also",
    "just", "like", "each", "every", "some", "such", "about", "across", "between",
    "project", "app", "application", "platform", "tool", "system", "build", "built",
}

# Keyword rules → canonical tag. Kept small and explainable on purpose.
KEYWORD_TAGS: dict[str, tuple[str, ...]] = {
    "ai": ("ai", "artificial intelligence", "llm", "gpt", "gemma", "neural", "machine learning", "ml"),
    "nlp": ("nlp", "language model", "text generation", "translation", "summarization", "chatbot", "tokenizer", "tokenization"),
    "vision": ("computer vision", "image recognition", "ocr", "object detection", "segmentation"),
    "speech": ("speech", "voice", "audio", "tts", "stt", "transcription"),
    "agents": ("agent", "agentic", "autonomous", "workflow automation"),
    "web": ("web", "react", "vue", "svelte", "next.js", "browser", "html", "css", "frontend"),
    "mobile": ("mobile", "android", "ios", "react native", "flutter", "app store"),
    "backend": ("backend", "server", "api", "rest", "graphql", "microservice", "grpc"),
    "database": ("database", "postgres", "sqlite", "sql", "nosql", "mongodb", "redis", "index"),
    "devtools": ("developer tool", "devtool", "cli", "sdk", "library", "framework", "compiler", "linter", "ide"),
    "devops": ("devops", "ci/cd", "docker", "kubernetes", "terraform", "deploy", "observability"),
    "security": ("security", "auth", "authentication", "encryption", "vulnerability", "threat", "zero trust", "privacy"),
    "data": ("data", "analytics", "dashboard", "visualization", "pipeline", "etl", "warehouse"),
    "civic": ("civic", "government", "public service", "democracy", "community", "nonprofit"),
    "climate": ("climate", "carbon", "sustainable", "sustainability", "renewable", "energy", "environment"),
    "health": ("health", "medical", "patient", "clinical", "wellness", "mental"),
    "education": ("education", "student", "teacher", "learning", "classroom", "school"),
    "finance": ("finance", "fintech", "payment", "banking", "budget", "invoice", "accounting"),
    "commerce": ("commerce", "e-commerce", "marketplace", "retail", "shopping"),
    "productivity": ("productivity", "note", "task", "todo", "calendar", "collaboration", "workspace"),
    "social": ("social", "community", "messaging", "chat", "forum", "feed"),
    "games": ("game", "gaming", "unity", "godot", "multiplayer"),
    "iot": ("iot", "sensor", "embedded", "microcontroller", "arduino", "raspberry pi", "firmware"),
    "robotics": ("robot", "robotic", "actuator", "drone"),
    "xr": ("ar", "vr", "augmented reality", "virtual reality", "xr", "3d"),
    "blockchain": ("blockchain", "web3", "smart contract", "crypto", "wallet"),
    "search": ("search", "retrieval", "ranking", "recommendation", "index"),
    "realtime": ("realtime", "real-time", "websocket", "streaming", "live"),
    "offline": ("offline", "local-first", "air-gapped", "peer-to-peer", "p2p"),
    "accessibility": ("accessibility", "a11y", "screen reader", "wcag", "inclusive"),
    "automation": ("automation", "automate", "script", "workflow"),
    "testing": ("testing", "test suite", "unit test", "integration test", "qa"),
}


def tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in STOPWORDS and len(t) > 2]


def _mentions(haystack: str, needle: str) -> bool:
    """Word-boundary match, so `ai` does not match `email` and `ar` not `start`."""
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack) is not None


def match_tags(text: str, vocab: tuple[str, ...] = ()) -> list[str]:
    """Canonical tags found in `text`, most-supported first (ties alphabetical)."""
    lowered = (text or "").lower()
    counts: Counter[str] = Counter()
    for tag, keywords in KEYWORD_TAGS.items():
        for kw in keywords:
            if _mentions(lowered, kw):
                counts[tag] += 1
    for v in vocab:
        v = v.strip().lower()
        if v and _mentions(lowered, v):
            counts[v] += 2  # organizer-provided vocabulary wins
    return [tag for tag, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def classify_project(project: dict, vocab: tuple[str, ...] = ()) -> tuple[list[str], str, float]:
    text = " ".join(
        str(project.get(k) or "")
        for k in ("title", "tagline", "description", "track")
    )
    text += " " + " ".join(project.get("techTags") or [])
    tags = match_tags(text, vocab)
    for raw in project.get("techTags") or []:
        t = str(raw).strip().lower()
        if t and t not in tags:
            tags.append(t)
    primary = tags[0] if tags else "general"
    title_hit = 1.0 if tags and tags[0] in (project.get("title") or "").lower() else 0.0
    confidence = round(min(0.95, 0.25 * len(tags) + 0.15 * title_hit), 3)
    return tags[:12], primary, confidence


def expertise_tags(judge: dict) -> list[str]:
    tags: list[str] = []
    for source in (judge.get("declared") or [], judge.get("scope") or [], judge.get("historyTags") or []):
        for raw in source:
            t = str(raw).strip().lower()
            if t and t not in tags:
                tags.append(t)
    for raw in judge.get("scope") or []:
        for t in match_tags(str(raw)):
            if t not in tags:
                tags.append(t)
    return tags[:16]


def affinity(project_tags: list[str], judge_tags: list[str], scope_match: bool) -> float:
    """Jaccard tag overlap, plus a scope bonus. Deterministic, 0..1."""
    p, j = set(t.lower() for t in project_tags), set(t.lower() for t in judge_tags)
    if not p:
        return 0.2 if scope_match else 0.0
    union = p | j
    overlap = len(p & j) / len(union) if union else 0.0
    return round(min(1.0, 0.8 * overlap + (0.2 if scope_match else 0.0)), 4)


_SENT_RE = re.compile(r"(?<=[.!?])\s+")


def summarize(title: str, tagline: str, description: str, answers: dict[str, str] | None = None) -> str:
    """Extractive summary: the most central sentences, in reading order."""
    body = " ".join(s for s in (description or "", *(answers or {}).values()) if s)
    sentences = [s.strip() for s in _SENT_RE.split(body) if len(s.strip()) > 24]
    if not sentences:
        return (tagline or title or "").strip()[:280]
    freq = Counter(tokenize(body))
    scored = sorted(
        ((sum(freq.get(t, 0) for t in tokenize(s)) / (len(tokenize(s)) or 1), i) for i, s in enumerate(sentences)),
        reverse=True,
    )
    chosen = sorted(i for _, i in scored[:3])
    summary = " ".join(sentences[i] for i in chosen)
    if title and title.lower() not in summary.lower():
        summary = f"{title}: {summary}"
    return summary[:600].strip()


def feedback(title: str, criteria: list[dict], notes: str = "") -> str:
    """A neutral, constructive first draft for a judge to edit."""
    strengths: list[str] = []
    improvements: list[str] = []
    for c in criteria:
        name = str(c.get("name") or "this criterion")
        mx = float(c.get("max") or 10) or 10
        ratio = float(c.get("value") or 0) / mx
        if ratio >= 0.7:
            strengths.append(name.lower())
        elif ratio <= 0.4:
            improvements.append(name.lower())
    parts: list[str] = []
    head = title.strip() or "this project"
    parts.append(f"Thanks for the clear work on {head}.")
    if strengths:
        parts.append("It stands out on " + _join(strengths) + ".")
    if improvements:
        parts.append("It could be stronger on " + _join(improvements) + " — a little more evidence or polish there would help.")
    if not strengths and not improvements:
        parts.append("The entry covers the rubric evenly; the deciding factor is how convincingly the core idea is demonstrated.")
    if notes.strip():
        parts.append("Rubric notes: " + notes.strip()[:300])
    return " ".join(parts)


def _join(items: list[str]) -> str:
    items = items[:4]
    if len(items) <= 1:
        return items[0] if items else ""
    return ", ".join(items[:-1]) + " and " + items[-1]
