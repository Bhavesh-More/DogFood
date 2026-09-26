import importlib.util

from fastapi.testclient import TestClient

from app import provision, text
from app.backends import BackendUnavailable, get_classifier
from app.config import Settings, resolve_device

import app.main as main_mod


def client() -> TestClient:
    return TestClient(main_mod.app)


def test_health_reports_effective_config():
    r = client().get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["device"] in {"cpu", "cuda", "mps"}
    assert body["classifierBackend"] in {"heuristic", "laya"}


def test_classify_finds_domain_tags():
    r = client().post(
        "/v1/classify",
        json={
            "projects": [
                {
                    "id": "sub_1",
                    "title": "Phishing Guard",
                    "description": "An AI security tool that detects phishing emails using an LLM.",
                    "techTags": ["python"],
                }
            ],
            "vocab": ["security"],
        },
    )
    assert r.status_code == 200
    result = r.json()["results"][0]
    assert "security" in result["tags"]
    assert "ai" in result["tags"]
    assert result["primaryTag"] in result["tags"] or result["primaryTag"] == "general"
    assert 0 < result["confidence"] <= 1


def test_expertise_uses_declared_scope_and_history():
    r = client().post(
        "/v1/expertise",
        json={"judges": [{"id": "u1", "declared": ["security", "privacy"], "scope": ["Applied AI"], "historyTags": ["nlp"]}]},
    )
    tags = r.json()["results"][0]["tags"]
    assert "security" in tags and "privacy" in tags and "nlp" in tags
    assert "ai" in tags  # derived from the "Applied AI" track scope


def test_affinity_is_deterministic_and_skips_conflicts():
    body = {
        "projects": [{"id": "s1", "tags": ["security", "ai"]}, {"id": "s2", "tags": ["games"]}],
        "judges": [
            {"id": "j1", "tags": ["security"], "scope": []},
            {"id": "j2", "tags": ["games"], "scope": []},
        ],
        "conflictPairs": [["j1", "s1"]],
    }
    a = client().post("/v1/affinity", json=body).json()
    b = client().post("/v1/affinity", json=body).json()
    assert a == b, "affinity must be deterministic"
    pairs = {(p["judgeId"], p["submissionId"]): p["score"] for p in a["pairs"]}
    assert ("j1", "s1") not in pairs
    assert pairs[("j1", "s2")] == 0.0
    assert pairs[("j2", "s2")] > pairs[("j1", "s2")]


def test_summary_is_extractive_and_mentions_title():
    r = client().post(
        "/v1/summary",
        json={
            "title": "Pantry Planner",
            "description": "Pantry Planner turns cupboard contents into a week of meals. It builds a shopping list for the gaps. It works offline.",
        },
    )
    assert r.status_code == 200
    out = r.json()
    assert "Pantry Planner" in out["summary"]
    assert out["source"]  # heuristic by default


def test_summary_accepts_non_string_answers():
    r = client().post(
        "/v1/summary",
        json={"title": "Flagship", "description": "A long enough sentence to be summarised here.", "answers": {"offline": True, "score": 3, "tags": ["a", "b"]}},
    )
    assert r.status_code == 200
    assert r.json()["summary"]


def test_feedback_derives_strengths_and_gaps():
    r = client().post(
        "/v1/feedback",
        json={
            "title": "Budget Lens",
            "criteria": [
                {"name": "Impact", "value": 9, "max": 10},
                {"name": "Design", "value": 2, "max": 10},
            ],
        },
    )
    body = r.json()
    assert "Budget Lens" in body["feedback"]
    assert "impact" in body["feedback"].lower()
    assert "design" in body["feedback"].lower()


def test_laya_backend_degrades_to_heuristic_when_absent():
    main_mod._classifier = None
    original = main_mod.settings
    try:
        main_mod.settings = type(original)(**{**original.__dict__, "classifier_backend": "laya"})
        backend = main_mod.classifier()
        assert backend.name in {"laya", "heuristic"}
    finally:
        main_mod.settings = original
        main_mod._classifier = None


def test_provision_is_a_noop_without_laya(capsys):
    assert provision.main() == 0
    assert "nothing to provision" in capsys.readouterr().out


def test_laya_backend_reports_unavailable_when_package_absent():
    settings = Settings.from_env({"AI_CLASSIFIER_BACKEND": "laya"})
    if importlib.util.find_spec("laya") is None:
        try:
            get_classifier(settings)
            raise AssertionError("expected BackendUnavailable")
        except BackendUnavailable:
            pass
    else:  # pragma: no cover - only when the heavy extras are installed
        assert get_classifier(settings).name == "laya"


def test_text_helpers_are_pure():
    assert text.match_tags("A secure AI web app")[:1]
    assert resolve_device("cpu") == "cpu"
    assert resolve_device("cuda") == "cuda"
    assert resolve_device("mps") == "mps"
    assert resolve_device("nonsense") in {"cpu", "cuda", "mps"}


def test_key_enforced_when_configured():
    original = main_mod.settings
    try:
        # require_key() reads the module-level settings at call time.
        main_mod.settings = type(original)(**{**original.__dict__, "api_key": "secret"})
        c = client()
        assert c.get("/health").status_code == 200
        assert c.post("/v1/classify", json={"projects": []}).status_code == 401
        assert c.post("/v1/classify", json={"projects": []}, headers={"Authorization": "Bearer secret"}).status_code == 200
    finally:
        main_mod.settings = original
