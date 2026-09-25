#!/usr/bin/env python3
"""
Dogfood acceptance runner.

    python3 acceptance/run.py .dogfood.toml > acceptance-report.txt

Reads the base URL and stable per-role session tokens from the manifest,
loads fixtures.json from the repository root, and exercises the running
stack tier by tier over plain HTTP. Every check talks to the public API the
way a client would; the maths (score normalization, Bradley-Terry, HMAC,
Ed25519) is recomputed here independently rather than trusted.

The run is repeatable against the same stack: everything it creates uses a
unique run id. It needs about 20 seconds because it waits for a real
server-side deadline and voting window to pass.

Standard library only (Python 3.11+). Exit code 0 when every claimed tier
and bonus is verified.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sys
import threading
import time
import tomllib
import traceback
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never route localhost via a proxy


@dataclass
class Resp:
    status: int
    headers: Any
    text: str

    @property
    def json(self) -> Any:
        try:
            return json.loads(self.text) if self.text else None
        except json.JSONDecodeError:
            return None

    @property
    def code(self) -> str | None:
        body = self.json
        return body.get("code") if isinstance(body, dict) else None

    def header(self, name: str) -> str | None:
        return self.headers.get(name)


class Client:
    """A tiny HTTP client: optional bearer token, optional cookie jar."""

    def __init__(self, base: str, token: str | None = None, cookies: bool = False):
        self.base = base.rstrip("/")
        self.token = token
        self.cookies: dict[str, str] | None = {} if cookies else None

    def request(self, method: str, path: str, body: Any = None, headers: dict[str, str] | None = None, raw: bytes | None = None) -> Resp:
        h = {"accept": "application/json", "user-agent": "dogfood-acceptance/1"}
        data = None
        if raw is not None:
            data = raw
        elif body is not None or method in ("POST", "PUT", "PATCH"):
            data = json.dumps({} if body is None else body).encode()
            h["content-type"] = "application/json"
        if self.token:
            h["authorization"] = f"Bearer {self.token}"
        if self.cookies:
            h["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        h.update(headers or {})
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with _OPENER.open(req, timeout=30) as r:
                resp = Resp(r.status, r.headers, r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            resp = Resp(e.code, e.headers, e.read().decode("utf-8", "replace"))
        if self.cookies is not None:
            for c in resp.headers.get_all("Set-Cookie") or []:
                pair = c.split(";", 1)[0]
                name, _, value = pair.partition("=")
                if re.search(r"Max-Age=0", c, re.I):
                    self.cookies.pop(name, None)
                else:
                    self.cookies[name] = value
        return resp

    def get(self, path: str, **kw: Any) -> Resp:
        return self.request("GET", path, **kw)

    def post(self, path: str, body: Any = None, **kw: Any) -> Resp:
        return self.request("POST", path, body, **kw)

    def put(self, path: str, body: Any = None, **kw: Any) -> Resp:
        return self.request("PUT", path, body, **kw)

    def patch(self, path: str, body: Any = None, **kw: Any) -> Resp:
        return self.request("PATCH", path, body, **kw)

    def delete(self, path: str, **kw: Any) -> Resp:
        return self.request("DELETE", path, **kw)


# ---------------------------------------------------------------------------
# Independent maths
# ---------------------------------------------------------------------------

def canonical_json(value: Any) -> str:
    """Sorted keys, no whitespace — the documented record canonicalisation."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# RFC 8032 §6 reference Ed25519 verification (pure Python; slow but tiny).
_P = 2**255 - 19
_Q = 2**252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _inv(x: int) -> int:
    return pow(x, _P - 2, _P)


def _point_add(a: tuple, b: tuple) -> tuple:
    A = (a[1] - a[0]) * (b[1] - b[0]) % _P
    B = (a[1] + a[0]) * (b[1] + b[0]) % _P
    C = 2 * a[3] * b[3] * _D % _P
    D = 2 * a[2] * b[2] % _P
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F, G * H, F * G, E * H)


def _point_mul(s: int, pt: tuple) -> tuple:
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _point_add(q, pt)
        pt = _point_add(pt, pt)
        s >>= 1
    return q


def _point_equal(a: tuple, b: tuple) -> bool:
    return (a[0] * b[2] - b[0] * a[2]) % _P == 0 and (a[1] * b[2] - b[1] * a[2]) % _P == 0


def _recover_x(y: int, sign: int) -> int | None:
    if y >= _P:
        return None
    x2 = (y * y - 1) * _inv(_D * y * y + 1)
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * _inv(5) % _P
_GX = _recover_x(_GY, 0)
_G = (_GX, _GY, 1, _GX * _GY % _P)


def _decompress(s: bytes) -> tuple | None:
    y = int.from_bytes(s, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    return None if x is None else (x, y, 1, x * y % _P)


def ed25519_verify(public: bytes, msg: bytes, sig: bytes) -> bool:
    if len(public) != 32 or len(sig) != 64:
        return False
    a = _decompress(public)
    r = _decompress(sig[:32])
    if a is None or r is None:
        return False
    s = int.from_bytes(sig[32:], "little")
    if s >= _Q:
        return False
    h = int.from_bytes(hashlib.sha512(sig[:32] + public + msg).digest(), "little") % _Q
    return _point_equal(_point_mul(s, _G), _point_add(r, _point_mul(h, a)))


def ed25519_public_from_pem(pem: str) -> bytes:
    der = base64.b64decode("".join(l for l in pem.strip().splitlines() if "-----" not in l))
    prefix = bytes.fromhex("302a300506032b6570032100")  # SPKI header for an Ed25519 key
    if not der.startswith(prefix) or len(der) != 44:
        raise ValueError("not an Ed25519 SubjectPublicKeyInfo")
    return der[len(prefix):]


def b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def recompute_normalization(run: dict) -> float:
    """Re-derive every normalized score from raw totals; return the max abs error."""
    cfg = run["config"]
    eps = cfg.get("epsilon", 1e-6)
    by_judge: dict[str, list[dict]] = {}
    for e in run["entries"]:
        by_judge.setdefault(e["judgeId"], []).append(e)
    worst = 0.0
    for judge, entries in by_judge.items():
        raws = [e["raw"] for e in entries]
        n = len(raws)
        mu = sum(raws) / n
        sd = math.sqrt(sum((r - mu) ** 2 for r in raws) / n)
        method = "z_score" if n >= cfg["minSampleSize"] else "min_max"
        lo, hi = min(raws), max(raws)
        for e in entries:
            if e["method"] != method:
                return float("inf")
            if method == "z_score":
                z = (e["raw"] - mu) / (sd + eps)
            else:
                x = 0.5 if hi - lo == 0 else (e["raw"] - lo) / (hi - lo + eps)
                z = (2 * x - 1) * math.sqrt(3)
            worst = max(worst, abs(cfg["targetMean"] + z * cfg["targetSd"] - e["normalized"]), abs(z - e["z"]))
    return worst


# ---------------------------------------------------------------------------
# Webhook receiver
# ---------------------------------------------------------------------------

class Receiver:
    def __init__(self) -> None:
        self.received: list[dict] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("content-length") or 0)
                body = self.rfile.read(length).decode()
                outer.received.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
                self.send_response(204)
                self.end_headers()

            def log_message(self, *_: Any) -> None:
                pass

        self.server = ThreadingHTTPServer(("0.0.0.0", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def wait_for(self, pred: Callable[[dict], bool], timeout: float) -> dict | None:
        end = time.time() + timeout
        while time.time() < end:
            for r in self.received:
                if pred(r):
                    return r
            time.sleep(0.25)
        return None

    def close(self) -> None:
        self.server.shutdown()


# ---------------------------------------------------------------------------
# Check framework
# ---------------------------------------------------------------------------

class CheckFailed(Exception):
    pass


def expect(cond: Any, message: str) -> None:
    if not cond:
        raise CheckFailed(message)


def expect_status(r: Resp, status: int | tuple[int, ...], what: str) -> None:
    ok = r.status in status if isinstance(status, tuple) else r.status == status
    if not ok:
        detail = r.code or r.text[:160].replace("\n", " ")
        raise CheckFailed(f"{what}: expected HTTP {status}, got {r.status} ({detail})")


@dataclass
class Result:
    tier: str
    cid: str
    title: str
    ok: bool
    ms: int
    note: str = ""


@dataclass
class Ctx:
    base: str
    manifest: dict
    fixtures: dict
    root: str
    tokens: dict[str, str]
    run: str = field(default_factory=lambda: secrets.token_hex(3))
    skew_ms: float = 0.0
    state: dict[str, Any] = field(default_factory=dict)

    def client(self, role: str | None = None, cookies: bool = False) -> Client:
        return Client(self.base, self.tokens[role] if role else None, cookies=cookies)

    def now(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(milliseconds=self.skew_ms)

    def iso(self, delta_seconds: float) -> str:
        return (self.now() + timedelta(seconds=delta_seconds)).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def wait_until(self, iso: str, pad: float = 0.4) -> None:
        target = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        delay = (target - self.now()).total_seconds() + pad
        if delay > 0:
            time.sleep(delay)


CHECKS: list[tuple[str, str, str, Callable[[Ctx], str | None]]] = []


def check(tier: str, cid: str, title: str):
    def deco(fn: Callable[[Ctx], str | None]):
        CHECKS.append((tier, cid, title, fn))
        return fn

    return deco


# ---------------------------------------------------------------------------
# T1 — core platform
# ---------------------------------------------------------------------------

@check("T1", "T1.01", "Stack is up: health endpoint reports the database reachable")
def t1_health(c: Ctx):
    r = c.client().get("/api/health")
    expect_status(r, 200, "GET /api/health")
    expect(r.json.get("db") is True, "database not reachable")
    server = datetime.fromisoformat(r.json["time"].replace("Z", "+00:00"))
    c.skew_ms = (server - datetime.now(timezone.utc)).total_seconds() * 1000
    return f"version {r.json.get('version')}, clock skew {c.skew_ms:+.0f} ms"


@check("T1", "T1.02", "Seeded fixtures are served; draft events stay private")
def t1_fixtures(c: Ctx):
    anon = c.client()
    listed = anon.get("/api/events")
    expect_status(listed, 200, "GET /api/events")
    items = listed.json["items"] if isinstance(listed.json, dict) else listed.json
    slugs = {e["slug"] for e in items}
    published = [e for e in c.fixtures["events"] if e.get("status") in ("published", "archived")]
    drafts = [e for e in c.fixtures["events"] if e.get("status") == "draft"]
    for e in published:
        expect(e["slug"] in slugs, f"fixture event {e['slug']} missing from /api/events")
    for e in drafts:
        expect(e["slug"] not in slugs, f"draft {e['slug']} is publicly listed")
        expect(anon.get(f"/api/events/{e['id']}").status == 404, f"draft {e['id']} readable anonymously")
    sample = next(e for e in c.fixtures["events"] if e["id"] == "evt_01")
    gallery = anon.get(f"/api/events/{sample['id']}/gallery?pageSize=200").json
    submitted = [t for t in sample["teams"] if t.get("submission", {}).get("status") == "submitted" and t["submission"].get("eligibility") != "ineligible"]
    expect(gallery["total"] == len(submitted), f"gallery shows {gallery['total']} projects, fixtures have {len(submitted)} submitted")
    return f"{len(published)} public events, {len(drafts)} private draft(s), {len(submitted)} eligible projects in {sample['slug']}"


@check("T1", "T1.03", "Every checker token authenticates as its declared role")
def t1_tokens(c: Ctx):
    seen = []
    for key, token in c.tokens.items():
        role = key.split("_")[0]
        r = Client(c.base, token).get("/api/auth/me")
        expect_status(r, 200, f"/api/auth/me as {key}")
        user = r.json.get("user")
        expect(user is not None, f"token for {key} is not a valid session")
        expect(user["role"] == role, f"token {key} has role {user['role']}, expected {role}")
        seen.append(key)
    return ", ".join(seen)


@check("T1", "T1.04", "Registration, login and logout with an HttpOnly SameSite session cookie")
def t1_register(c: Ctx):
    email = f"acc-{c.run}-u1@example.org"
    jar = Client(c.base, cookies=True)
    r = jar.post("/api/auth/register", {"email": email, "password": "acceptance-pass-1", "name": f"Acceptance One {c.run}"})
    expect_status(r, 201, "register")
    cookie = next((x for x in r.headers.get_all("Set-Cookie") or [] if x.startswith("dogfood_session=")), "")
    expect("HttpOnly" in cookie and "SameSite=Lax" in cookie, "session cookie lacks HttpOnly/SameSite")
    expect(jar.get("/api/auth/me").json["user"]["email"] == email, "cookie session not recognised")
    tok = jar.post("/api/auth/tokens", {"label": "acceptance"})
    expect_status(tok, 201, "create API token")
    c.state["u1"] = {"token": tok.json["token"], "email": email}
    expect_status(jar.post("/api/auth/logout"), 204, "logout")
    expect(jar.get("/api/auth/me").json["user"] is None, "still signed in after logout")
    dup = Client(c.base).post("/api/auth/register", {"email": email.upper(), "password": "acceptance-pass-1", "name": "Dup"})
    expect(dup.status == 409, "duplicate email (different case) accepted")
    login = Client(c.base, cookies=True).post("/api/auth/login", {"email": email, "password": "acceptance-pass-1"})
    expect_status(login, 200, "login")
    bad = Client(c.base).post("/api/auth/login", {"email": email, "password": "wrong"})
    ghost = Client(c.base).post("/api/auth/login", {"email": f"ghost-{c.run}@example.org", "password": "wrong"})
    expect(bad.status == ghost.status == 401 and bad.json == ghost.json, "login failure leaks whether the account exists")
    # A second account for later team/voting checks.
    jar2 = Client(c.base, cookies=True)
    expect_status(jar2.post("/api/auth/register", {"email": f"acc-{c.run}-u2@example.org", "password": "acceptance-pass-2", "name": f"Acceptance Two {c.run}"}), 201, "register second user")
    c.state["u2"] = {"token": jar2.post("/api/auth/tokens", {"label": "acceptance"}).json["token"]}
    return None


@check("T1", "T1.05", "Five-role RBAC is enforced by the API (401 anonymous, 403 wrong role)")
def t1_rbac(c: Ctx):
    body = {"slug": f"acc-{c.run}-rbac", "name": "RBAC probe", "startsAt": c.iso(86400), "submissionDeadline": c.iso(2 * 86400)}
    expect(c.client().post("/api/events", body).status == 401, "anonymous user could create an event")
    for role in ("participant", "judge", "visitor"):
        r = c.client(role).post("/api/events", body)
        expect(r.status == 403, f"{role} could create an event ({r.status})")
    expect(c.client("organizer").get("/api/admin/users").status == 403, "organizer reached admin user management")
    expect_status(c.client("admin").get("/api/admin/users"), 200, "admin user list")
    for p in ("/api/judge/events", "/api/me/records", "/api/auth/tokens"):
        expect(c.client().get(p).status == 401, f"{p} served anonymously")
    return None


@check("T1", "T1.06", "Organizer creates an event with tracks, prizes, questions and a weighted rubric")
def t1_event(c: Ctx):
    org = c.client("organizer")
    deadline = c.iso(float(c.manifest.get("acceptance", {}).get("deadline_seconds", 14)))
    slug = f"acc-{c.run}"
    r = org.post("/api/events", {
        "slug": slug, "name": f"Acceptance Run {c.run}", "tagline": "Created by the acceptance runner",
        "startsAt": c.iso(-3600), "submissionDeadline": deadline, "judgingEndsAt": c.iso(86400),
        "votingOpensAt": c.iso(-1800), "votingClosesAt": deadline,
        "maxTeamSize": 2, "votingMode": "open", "votingStyle": "single", "quadraticCredits": 2, "reviewsPerSubmission": 2,
    })
    expect_status(r, 201, "create event")
    eid = r.json["id"]
    expect(r.json["status"] == "draft", "new events must start as drafts")
    expect(c.client().get(f"/api/events/{eid}").status == 404, "draft visible anonymously")
    tools = org.post(f"/api/events/{eid}/tracks", {"name": "Tools"}).json["id"]
    civic = org.post(f"/api/events/{eid}/tracks", {"name": "Civic"}).json["id"]
    expect_status(org.post(f"/api/events/{eid}/prizes", {"name": "Best Tool", "value": "$500", "trackId": tools}), 201, "add prize")
    q = org.post(f"/api/events/{eid}/questions", {"label": "Licence", "kind": "select", "required": True, "options": ["MIT", "Apache-2.0"]})
    expect_status(q, 201, "add question")
    crit = {}
    for name, w, mx, tr in (("Impact", 2, 10, None), ("Craft", 1, 10, None), ("Civic fit", 1, 5, civic)):
        cr = org.post(f"/api/events/{eid}/criteria", {"name": name, "weight": w, "maxScore": mx, "trackId": tr})
        expect_status(cr, 201, f"add criterion {name}")
        crit[name] = {"id": cr.json["id"], "w": w, "max": mx, "track": tr}
    expect_status(org.post(f"/api/events/{eid}/publish"), 200, "publish")
    pub = c.client().get(f"/api/events/{eid}")
    expect_status(pub, 200, "public event page")
    expect(len(pub.json["tracks"]) == 2 and len(pub.json["prizes"]) == 1 and len(pub.json["questions"]) == 1, "event structure not exposed publicly")
    c.state.update(eid=eid, slug=slug, deadline=deadline, tracks={"tools": tools, "civic": civic}, question=q.json["id"], crit=crit)
    return f"{slug}, hard deadline {deadline}"


@check("T1", "T1.07", "Participants register and form teams; one team per person per event")
def t1_teams(c: Ctx):
    eid = c.state["eid"]
    teams = {}
    for key, client in (("a", c.client("participant")), ("b", c.client("participant_2")), ("c", Client(c.base, c.state["u2"]["token"]))):
        expect(client.post(f"/api/events/{eid}/register").status in (200, 201, 204), f"registration failed for team {key}")
        t = client.post(f"/api/events/{eid}/teams", {"name": f"Team {key.upper()} {c.run}"})
        expect_status(t, 201, f"create team {key}")
        teams[key] = {"id": t.json["id"], "client": client}
    again = c.client("participant").post(f"/api/events/{eid}/teams", {"name": f"Second {c.run}"})
    expect(again.status == 409, "a participant created a second team in the same event")
    judge_team = c.client("judge").post(f"/api/events/{eid}/teams", {"name": "Judges"})
    expect(judge_team.status == 403, "a judge-role account formed a team")
    c.state["teams"] = teams
    return None


@check("T1", "T1.08", "Team invites are single-use, hash-stored, revocable and expiring")
def t1_invites(c: Ctx):
    team = c.state["teams"]["a"]
    cap = team["client"]
    inv = cap.post(f"/api/teams/{team['id']}/invites")
    expect_status(inv, 201, "mint invite")
    token = inv.json["token"]
    exp = datetime.fromisoformat(inv.json["expiresAt"].replace("Z", "+00:00"))
    expect(timedelta(0) < exp - c.now() <= timedelta(hours=72, minutes=1), "invite expiry missing or longer than 72h")
    expect(token not in cap.get(f"/api/teams/{team['id']}/invites").text, "invite list re-exposes raw tokens")
    u1 = Client(c.base, c.state["u1"]["token"])
    expect_status(u1.post(f"/api/invites/{token}/accept"), 200, "accept invite")
    reuse = Client(c.base, c.state["u2"]["token"]).post(f"/api/invites/{token}/accept")
    expect(reuse.status == 409 and reuse.code == "INVITE_USED", f"invite reused ({reuse.status} {reuse.code})")
    extra = cap.post(f"/api/teams/{team['id']}/invites")
    expect(extra.status == 409 and extra.code == "TEAM_FULL", "invite minted for a full team")
    team_c = c.state["teams"]["c"]
    rev = team_c["client"].post(f"/api/teams/{team_c['id']}/invites").json
    expect_status(team_c["client"].delete(f"/api/teams/{team_c['id']}/invites/{rev['id']}"), 204, "revoke invite")
    gone = c.client("visitor").post(f"/api/invites/{rev['token']}/accept")
    expect(gone.status in (403, 410), "revoked invite still accepted")
    return None


@check("T1", "T1.09", "Submissions: drafts are private, completeness is validated, then locked in")
def t1_submissions(c: Ctx):
    eid, q, tr = c.state["eid"], c.state["question"], c.state["tracks"]
    subs = {}
    specs = {
        "a": ('=HYPERLINK("http://evil.example","prize")', tr["tools"]),
        "b": (f"Civic Lens {c.run}", tr["civic"]),
        "c": (f"Build Buddy {c.run}", tr["tools"]),
    }
    for key, (title, track) in specs.items():
        team = c.state["teams"][key]
        d = team["client"].put(f"/api/teams/{team['id']}/submission", {
            "title": title, "description": "A project described in enough detail to be judged.",
            "repoUrl": f"https://example.org/{c.run}/{key}", "trackId": track,
        })
        expect_status(d, 200, f"save draft {key}")
        subs[key] = d.json["id"]
    expect(c.client().get(f"/api/submissions/{subs['b']}").status == 404, "draft readable anonymously")
    incomplete = c.state["teams"]["a"]["client"].post(f"/api/submissions/{subs['a']}/submit")
    expect(incomplete.status == 422 and incomplete.code == "INCOMPLETE_SUBMISSION", "incomplete submission accepted")
    expect(any(d["path"] == f"answers.{q}" for d in incomplete.json["details"]), "missing required answer not reported")
    for key, team in c.state["teams"].items():
        team["client"].put(f"/api/teams/{team['id']}/submission", {"answers": {q: "MIT"}})
        s = team["client"].post(f"/api/submissions/{subs[key]}/submit")
        expect_status(s, 200, f"submit {key}")
        expect(s.json["status"] == "submitted", "status not submitted")
    c.state["subs"] = subs
    return None


@check("T1", "T1.10", "Public gallery lists submitted projects with search and track filters")
def t1_gallery(c: Ctx):
    anon = c.client()
    eid, subs = c.state["eid"], c.state["subs"]
    g = anon.get(f"/api/events/{eid}/gallery")
    expect_status(g, 200, "gallery")
    expect({i["id"] for i in g.json["items"]} == set(subs.values()), "gallery does not match submitted projects")
    civic = anon.get(f"/api/events/{eid}/gallery?track={c.state['tracks']['civic']}").json["items"]
    expect([i["id"] for i in civic] == [subs["b"]], "track filter wrong")
    found = anon.get(f"/api/events/{eid}/gallery?q=Buddy").json["items"]
    expect([i["id"] for i in found] == [subs["c"]], "search wrong")
    expect_status(anon.get(f"/api/submissions/{subs['c']}"), 200, "public project page")
    return None


# ---------------------------------------------------------------------------
# T3 checks that need the voting window open run before the deadline passes.
# ---------------------------------------------------------------------------

@check("T3", "T3.01", "Open-link voting: one vote per device per project, per-voter budget enforced")
def t3_open_vote(c: Ctx):
    subs = c.state["subs"]
    d1 = Client(c.base, cookies=True)
    r = d1.put(f"/api/submissions/{subs['a']}/vote", {"votes": 1})
    expect_status(r, 200, "vote")
    expect(r.json["spent"] == 1 and r.json["budget"] == 2, "budget accounting wrong")
    expect(d1.put(f"/api/submissions/{subs['a']}/vote", {"votes": 3}).json["allocation"] == {subs["a"]: 1}, "re-vote double counted")
    expect_status(d1.put(f"/api/submissions/{subs['c']}/vote", {"votes": 1}), 200, "second pick")
    over = d1.put(f"/api/submissions/{subs['b']}/vote", {"votes": 1})
    expect(over.status == 422 and over.code == "BUDGET_EXCEEDED", "budget not enforced")
    expect(d1.put(f"/api/submissions/{subs['c']}/vote", {"votes": 0}).json["remaining"] == 1, "withdrawing a vote failed")
    own = c.client("participant").put(f"/api/submissions/{subs['a']}/vote", {"votes": 1})
    expect(own.status == 403 and own.code == "OWN_TEAM", "self-vote allowed")
    org = c.client("organizer").put(f"/api/submissions/{subs['b']}/vote", {"votes": 1})
    expect(org.status == 403, "organizer allowed to vote")
    c.state["d1"] = d1
    return None


@check("T3", "T3.02", "Anti-Sybil: devices beyond 3 per IP are flagged (X-Forwarded-For is not trusted)")
def t3_sybil(c: Ctx):
    sub = c.state["subs"]["b"]
    for _ in range(2):
        expect_status(Client(c.base, cookies=True).put(f"/api/submissions/{sub}/vote", {"votes": 1}), 200, "vote")
    r = Client(c.base, cookies=True).put(f"/api/submissions/{sub}/vote", {"votes": 1}, headers={"x-forwarded-for": "203.0.113.77"})
    expect_status(r, 200, "fourth device vote")
    flagged = c.client("organizer").get(f"/api/events/{c.state['eid']}/votes?status=flagged")
    expect_status(flagged, 200, "organizer vote review")
    expect(len(flagged.json) == 1 and flagged.json[0]["submissionId"] == sub, f"expected 1 flagged vote, got {len(flagged.json)}")
    return flagged.json[0].get("flagReason")


@check("T3", "T3.03", "Tallies are hidden from everyone but organizers while voting is open")
def t3_hidden(c: Ctx):
    eid = c.state["eid"]
    pub = c.client().get(f"/api/events/{eid}/votes/summary")
    expect(pub.status == 403 and pub.code == "RESULTS_HIDDEN", "tallies visible while voting is open")
    expect(c.client("participant").get(f"/api/events/{eid}/votes/summary").status == 403, "participant sees live tallies")
    org = c.client("organizer").get(f"/api/events/{eid}/votes/summary")
    expect_status(org, 200, "organizer tallies")
    expect("flagged" in org.json["tallies"][0], "organizer view lacks anti-abuse columns")
    g = c.client().get(f"/api/events/{eid}/gallery").json
    expect(all(i.get("voteTally") in (None,) for i in g["items"]), "gallery leaks vote counts during voting")
    return None


@check("T3", "T3.04", "Randomized, per-viewer-stable project order during voting (position-bias control)")
def t3_random_order(c: Ctx):
    evt = "evt_01" if c.client().get("/api/events/evt_01/votes/me").json.get("votingOpen") else c.state["eid"]
    # Distinct signed-in viewers get distinct shuffles; the same viewer always sees the same order.
    viewers = [c.client(r) for r in ("participant", "participant_2", "visitor", "judge", "judge_b", "judge_track")]
    orders = []
    for v in viewers:
        first = v.get(f"/api/events/{evt}/gallery?pageSize=200").json
        second = v.get(f"/api/events/{evt}/gallery?pageSize=200").json
        expect(first["order"] == "random", f"default order is {first['order']} during voting")
        a, b = [i["id"] for i in first["items"]], [i["id"] for i in second["items"]]
        expect(a == b, "order is not stable for the same viewer")
        orders.append(tuple(a))
    expect(len(set(orders)) > 1, "every viewer sees the same order")
    return f"{len(set(orders))} distinct orders across 6 viewers on {evt}"


@check("T3", "T3.05", "Comments: signed-in users post, authors delete, anonymous users cannot")
def t3_comments(c: Ctx):
    sub = c.state["subs"]["c"]
    expect(c.client().post(f"/api/submissions/{sub}/comments", {"body": "hi"}).status == 401, "anonymous comment accepted")
    r = c.client("participant_2").post(f"/api/submissions/{sub}/comments", {"body": f"Great demo ({c.run})"})
    expect_status(r, 201, "comment")
    listed = c.client().get(f"/api/submissions/{sub}/comments").json
    expect(any(x["id"] == r.json["id"] for x in listed), "comment not listed")
    expect(c.client("participant").delete(f"/api/comments/{r.json['id']}").status == 403, "non-author deleted a comment")
    expect_status(c.client("participant_2").delete(f"/api/comments/{r.json['id']}"), 204, "author delete")
    return None


@check("T3", "T3.06", "Email-gated quadratic voting: outbox code, v² credits, +tag aliases are one voter")
def t3_quadratic(c: Ctx):
    org = c.client("organizer")
    r = org.post("/api/events", {
        "slug": f"acc-{c.run}-qv", "name": f"Acceptance QV {c.run}", "startsAt": c.iso(-3600), "submissionDeadline": c.iso(3600),
        "votingOpensAt": c.iso(-60), "votingClosesAt": c.iso(3600), "votingMode": "email", "votingStyle": "quadratic", "quadraticCredits": 9,
    })
    expect_status(r, 201, "create quadratic event")
    eid = r.json["id"]
    org.post(f"/api/events/{eid}/publish")
    subs = []
    for role in ("participant", "participant_2"):
        cl = c.client(role)
        cl.post(f"/api/events/{eid}/register")
        team = cl.post(f"/api/events/{eid}/teams", {"name": f"QV {role} {c.run}"}).json["id"]
        sid = cl.put(f"/api/teams/{team}/submission", {"title": f"QV {role}", "description": "Quadratic voting probe project.", "repoUrl": "https://example.org/qv"}).json["id"]
        expect_status(cl.post(f"/api/submissions/{sid}/submit"), 200, "submit")
        subs.append(sid)
    voter = Client(c.base, cookies=True)
    gate = voter.put(f"/api/submissions/{subs[0]}/vote", {"votes": 1})
    expect(gate.status == 401 and gate.code == "EMAIL_VERIFICATION_REQUIRED", "unverified vote accepted")
    addr = f"voter+one-{c.run}@example.org"
    expect_status(voter.post(f"/api/events/{eid}/votes/email-code", {"email": addr}), 202, "request code")
    code = _code_from_outbox(c, addr)
    wrong = "000000" if code != "000000" else "111111"
    expect(voter.post(f"/api/events/{eid}/votes/verify", {"email": addr, "code": wrong}).status == 401, "wrong code accepted")
    expect_status(voter.post(f"/api/events/{eid}/votes/verify", {"email": addr, "code": code}), 200, "verify code")
    expect(voter.put(f"/api/submissions/{subs[0]}/vote", {"votes": 2}).json["spent"] == 4, "2 votes should cost 4 credits")
    expect(voter.put(f"/api/submissions/{subs[1]}/vote", {"votes": 2}).json["spent"] == 8, "cost not cumulative")
    over = voter.put(f"/api/submissions/{subs[1]}/vote", {"votes": 3})
    expect(over.status == 422 and over.code == "BUDGET_EXCEEDED", "13 credits accepted on a 9-credit budget")
    alias = f"VOTER+two-{c.run}@Example.org"
    other = Client(c.base, cookies=True)
    expect_status(other.post(f"/api/events/{eid}/votes/email-code", {"email": alias}), 202, "request alias code")
    expect_status(other.post(f"/api/events/{eid}/votes/verify", {"email": alias, "code": _code_from_outbox(c, alias)}), 200, "verify alias")
    me = other.get(f"/api/events/{eid}/votes/me").json
    expect(me["spent"] == 8, f"+tag alias treated as a new voter (spent {me['spent']})")
    return None


def _code_from_outbox(c: Ctx, addr: str) -> str:
    for _ in range(10):
        mails = c.client("admin").get("/api/admin/outbox").json
        for m in mails:
            if m["to"].lower() == addr.lower():
                found = re.search(r"\b(\d{6})\b", m["body"])
                if found:
                    return found.group(1)
        time.sleep(0.3)
    raise CheckFailed(f"no code for {addr} in the local outbox")


# ---------------------------------------------------------------------------
# Deadline (T1) — waits for the real server-side deadline
# ---------------------------------------------------------------------------

@check("T1", "T1.11", "Hard deadline: server-clock lock, client time headers ignored, rosters frozen")
def t1_deadline(c: Ctx):
    c.wait_until(c.state["deadline"])
    team = c.state["teams"]["a"]
    before = c.client().get(f"/api/submissions/{c.state['subs']['a']}").json["title"]
    late = team["client"].put(f"/api/teams/{team['id']}/submission", {"title": "Edited after the deadline"},
                              headers={"date": "Mon, 01 Jan 2024 00:00:00 GMT", "x-client-time": "2024-01-01T00:00:00Z"})
    expect(late.status == 403 and late.code == "DEADLINE_PASSED", f"late edit returned {late.status} {late.code}")
    expect(c.client().get(f"/api/submissions/{c.state['subs']['a']}").json["title"] == before, "late edit changed data")
    un = team["client"].post(f"/api/submissions/{c.state['subs']['a']}/unsubmit")
    expect(un.code == "DEADLINE_PASSED", "unsubmit allowed after the deadline")
    inv = c.state["teams"]["c"]["client"].post(f"/api/teams/{c.state['teams']['c']['id']}/invites")
    expect(inv.code == "DEADLINE_PASSED", "roster changes allowed after the deadline")
    return None


@check("T3", "T3.07", "Voting closes on the server clock; tallies are then public without anti-abuse details")
def t3_closed(c: Ctx):
    eid = c.state["eid"]
    closed = c.state["d1"].put(f"/api/submissions/{c.state['subs']['b']}/vote", {"votes": 1})
    expect(closed.status == 403 and closed.code == "VOTING_CLOSED", "vote accepted after close")
    pub = c.client().get(f"/api/events/{eid}/votes/summary")
    expect_status(pub, 200, "public tallies after close")
    expect(all("flagged" not in t for t in pub.json["tallies"]), "public tallies expose anti-abuse data")
    by_id = {t["submissionId"]: t for t in pub.json["tallies"]}
    expect(by_id[c.state["subs"]["a"]]["counted"] == 1, "tally for project A wrong")
    expect(by_id[c.state["subs"]["b"]]["counted"] == 2, "flagged vote was counted")
    return None


# ---------------------------------------------------------------------------
# T2 — judging
# ---------------------------------------------------------------------------

@check("T2", "T2.01", "Judge invitations: single-use, track-scoped, organizers cannot judge")
def t2_judges(c: Ctx):
    eid, org = c.state["eid"], c.client("organizer")
    judges = {"judge": [], "judge_b": [], "judge_track": [c.state["tracks"]["civic"]]}
    for role, tracks in judges.items():
        inv = org.post(f"/api/events/{eid}/judge-invites", {"trackIds": tracks, "note": "acceptance"})
        expect_status(inv, 201, "mint judge invite")
        expect_status(c.client(role).post(f"/api/judge-invites/{inv.json['token']}/accept"), 200, f"{role} accepts")
        reuse = c.client("judge_b" if role == "judge" else "judge").post(f"/api/judge-invites/{inv.json['token']}/accept")
        expect(reuse.code == "INVITE_USED", "judge invite reused")
    spare = org.post(f"/api/events/{eid}/judge-invites", {}).json["token"]
    expect(org.post(f"/api/judge-invites/{spare}/accept").code == "ORGANIZER_CANNOT_JUDGE", "organizer joined the panel")
    expect(c.client("participant").post(f"/api/judge-invites/{spare}/accept").code == "PARTICIPANT_CONFLICT", "participant judged own event")
    ids = {c.client(r).get("/api/auth/me").json["user"]["id"]: r for r in judges}
    c.state["judge_ids"] = ids
    return None


@check("T2", "T2.02", "Algorithmic routing: dry run first, k reviews each, conflicts and track scopes honoured")
def t2_routing(c: Ctx):
    eid, org, subs = c.state["eid"], c.client("organizer"), c.state["subs"]
    judge_b = next(i for i, r in c.state["judge_ids"].items() if r == "judge_b")
    expect(org.post(f"/api/events/{eid}/conflicts", {"judgeId": judge_b, "submissionId": subs["b"], "reason": "Mentored the team"}).status in (200, 201), "declare conflict")
    dry = org.post(f"/api/events/{eid}/assignments/auto", {"dryRun": True})
    expect_status(dry, 200, "dry run")
    expect(len(dry.json["created"]) == 6, f"dry run planned {len(dry.json['created'])} reviews, expected 6")
    expect(org.get(f"/api/events/{eid}/assignments").json["assignments"] == [], "dry run wrote assignments")
    real = org.post(f"/api/events/{eid}/assignments/auto", {"dryRun": False})
    expect(len(real.json["created"]) == 6 and not real.json["shortfalls"], "routing incomplete")
    rows = org.get(f"/api/events/{eid}/assignments").json["assignments"]
    per_sub: dict[str, set] = {}
    for a in rows:
        per_sub.setdefault(a["submissionId"], set()).add(a["judgeId"])
    expect(all(len(v) == 2 for v in per_sub.values()) and len(per_sub) == 3, "each project needs exactly 2 distinct judges")
    expect(judge_b not in per_sub[subs["b"]], "conflicted judge assigned")
    track_judge = next(i for i, r in c.state["judge_ids"].items() if r == "judge_track")
    expect(all(s == subs["b"] for s, js in per_sub.items() if track_judge in js), "track-scoped judge got an out-of-scope project")
    expect(org.post(f"/api/events/{eid}/assignments/auto", {}).json["created"] == [], "re-running routing duplicated work")
    return f"{len(rows)} assignments"


@check("T2", "T2.03", "Judge isolation: own queue only; others' assignments and raw ballots are forbidden")
def t2_isolation(c: Ctx):
    eid = c.state["eid"]
    qa = c.client("judge").get(f"/api/judge/events/{eid}/assignments").json
    qb = c.client("judge_b").get(f"/api/judge/events/{eid}/assignments").json
    expect(qa and qb and not ({a["id"] for a in qa} & {b["id"] for b in qb}), "queues overlap or are empty")
    other = qb[0]["id"]
    r = c.client("judge").get(f"/api/judge/assignments/{other}")
    expect(r.status == 403 and r.code == "NOT_YOUR_ASSIGNMENT", f"judge read another judge's assignment ({r.status})")
    w = c.client("judge").put(f"/api/judge/assignments/{other}/ballot", {"scores": {}})
    expect(w.status == 403, "judge wrote another judge's ballot")
    for role in ("judge", "participant", "visitor"):
        expect(c.client(role).get(f"/api/events/{eid}/ballots").status == 403, f"{role} can read raw ballots")
    for a in c.client("judge_track").get(f"/api/judge/events/{eid}/assignments").json:
        expect(a["trackId"] == c.state["tracks"]["civic"], "track judge sees another track")
    return None


@check("T2", "T2.04", "Weighted rubric: bounds and completeness validated, totals weighted server-side")
def t2_ballots(c: Ctx):
    crit = c.state["crit"]
    civic = c.state["tracks"]["civic"]
    lean = {"judge": -2, "judge_b": 2, "judge_track": 0}
    quality = {c.state["subs"]["a"]: 5, c.state["subs"]["b"]: 7, c.state["subs"]["c"]: 3}
    first = True
    for role in lean:
        cl = c.client(role)
        for a in cl.get(f"/api/judge/events/{c.state['eid']}/assignments").json:
            applicable = [v for v in crit.values() if v["track"] in (None, a["trackId"])]
            if first:
                bad = cl.put(f"/api/judge/assignments/{a['id']}/ballot", {"scores": {crit["Impact"]["id"]: 11}})
                expect(bad.code == "INVALID_BALLOT", "score above the criterion maximum accepted")
                part = cl.put(f"/api/judge/assignments/{a['id']}/ballot", {"scores": {crit["Impact"]["id"]: 5}, "submit": True})
                expect(part.code == "INVALID_BALLOT", "incomplete ballot submitted")
                first = False
            scores = {v["id"]: max(0, min(v["max"], round((quality[a["submissionId"]] + lean[role]) * v["max"] / 10))) for v in applicable}
            r = cl.put(f"/api/judge/assignments/{a['id']}/ballot", {"scores": scores, "comment": "acceptance", "submit": True})
            expect_status(r, 200, "submit ballot")
            expected = 100 * sum(v["w"] * scores[v["id"]] / v["max"] for v in applicable) / sum(v["w"] for v in applicable)
            expect(abs(r.json["rawTotal"] - expected) < 1e-6, f"weighted total {r.json['rawTotal']} != {expected}")
            expect(a["trackId"] != civic or crit["Civic fit"]["id"] in scores, "track criterion missing")
    return None


@check("T2", "T2.05", "Organizer progress view reflects completed reviews")
def t2_progress(c: Ctx):
    rows = c.client("organizer").get(f"/api/events/{c.state['eid']}/judges").json
    expect(len(rows) == 3, "panel size wrong")
    for j in rows:
        done = j.get("completed", j.get("submitted"))
        expect(done == j["assigned"] and j["assigned"] > 0, f"judge {j['name']} progress {done}/{j['assigned']}")
    return None


@check("T2", "T2.06", "Normalization: Z-score for n>=5, Min-Max fallback below, invariants hold (seeded event)")
def t2_normalize_seeded(c: Ctx):
    r = c.client("organizer").post("/api/events/evt_01/normalize")
    expect_status(r, 201, "normalize evt_01")
    run = r.json
    methods = {j["judgeId"]: (j["method"], j["n"]) for j in run["judges"]}
    expect(any(m == "z_score" for m, _ in methods.values()), "no judge normalized with Z-scores")
    expect(any(m == "min_max" for m, _ in methods.values()), "the small-sample judge did not fall back to Min-Max")
    for m, n in methods.values():
        expect((m == "z_score") == (n >= run["config"]["minSampleSize"]), "method does not follow the sample-size rule")
    expect(all(i["holds"] for i in run["invariants"]), "normalization invariants violated")
    err = recompute_normalization(run)
    expect(err < 1e-6, f"independent recomputation differs by {err}")
    c.state["seeded_run"] = run
    bias = sorted(((j["bias"], j["name"]) for j in run["judges"]))
    return f"{len(run['entries'])} ballots, max recompute error {err:.1e}, strictest {bias[0][1]} ({bias[0][0]:+.1f}), most lenient {bias[-1][1]} ({bias[-1][0]:+.1f})"


@check("T2", "T2.07", "Results are hidden until published, then public and ranked; ballots lock")
def t2_publish(c: Ctx):
    eid, org = c.state["eid"], c.client("organizer")
    hidden = c.client().get(f"/api/events/{eid}/results")
    expect(hidden.status == 403 and hidden.code == "RESULTS_HIDDEN", "results visible before publishing")
    run = org.post(f"/api/events/{eid}/normalize").json
    expect(all(j["method"] == "min_max" for j in run["judges"]), "small panels must use the Min-Max fallback")
    expect(recompute_normalization(run) < 1e-6, "fallback recomputation mismatch")
    expect_status(org.post(f"/api/events/{eid}/results/publish", {"rerun": False}), 200, "publish")
    pub = c.client().get(f"/api/events/{eid}/results")
    expect_status(pub, 200, "public results")
    board = pub.json["results"]
    expect(sorted(x["rank"] for x in board) == sorted(r["rank"] for r in run["results"]) and len(board) == 3, "published ranks differ from the run")
    by_run = {r["submissionId"]: r for r in run["results"]}
    for x in board:
        expect(abs(x["normalizedScore"] - by_run[x["submissionId"]]["normalizedMean"]) < 1e-9, "published score differs from the normalization run")
    a = c.client("judge").get(f"/api/judge/events/{eid}/assignments").json[0]
    locked = c.client("judge").put(f"/api/judge/assignments/{a['id']}/ballot", {"scores": {}})
    expect(locked.code == "JUDGING_CLOSED", "ballot editable after publishing")
    return None


@check("T2", "T2.08", "CSV exports for organizers, with spreadsheet formula-injection neutralised")
def t2_csv(c: Ctx):
    eid, org = c.state["eid"], c.client("organizer")
    for kind in ("results", "scores", "submissions", "judges", "votes", "audit"):
        r = org.get(f"/api/events/{eid}/exports/{kind}.csv")
        expect_status(r, 200, f"{kind}.csv")
        expect((r.header("content-type") or "").startswith("text/csv"), f"{kind}.csv content type")
    res = org.get(f"/api/events/{eid}/exports/results.csv").text
    expect("'=HYPERLINK" in res and not re.search(r"(^|,)\"?=HYPERLINK", res, re.M), "formula cell not neutralised")
    expect(c.client("participant").get(f"/api/events/{eid}/exports/results.csv").status == 403, "participant exported results")
    return None


# ---------------------------------------------------------------------------
# T3 — audit
# ---------------------------------------------------------------------------

@check("T3", "T3.08", "Tamper-evident audit trail: every sensitive action logged, hash chain verifies")
def t3_audit(c: Ctx):
    rows = c.client("organizer").get(f"/api/events/{c.state['eid']}/audit?pageSize=200").json
    items = rows["items"] if isinstance(rows, dict) else rows
    actions = {r["action"] for r in items}
    for a in ("event.created", "team.member_joined", "submission.submitted", "vote.cast", "vote.flagged", "judge.joined", "ballot.submitted", "results.normalized", "results.published"):
        expect(a in actions, f"audit log lacks {a}")
    v = c.client("admin").get("/api/audit/verify").json
    expect(v["valid"] is True, f"audit chain broken: {v['problems'][:3]}")
    return f"{v['entries']} chained entries, head {v['headHash'][:12]}…"


# ---------------------------------------------------------------------------
# T4 — platform
# ---------------------------------------------------------------------------

@check("T4", "T4.01", "REST API described by a live OpenAPI 3.1 document")
def t4_openapi(c: Ctx):
    doc = c.client().get("/api/openapi.json").json
    expect(doc and str(doc.get("openapi", "")).startswith("3.1"), "not OpenAPI 3.1")
    ops = [(p, m) for p, v in doc["paths"].items() for m in v]
    expect(len(ops) >= 100, f"only {len(ops)} operations documented")
    for p in ("/api/events/{eventId}/normalize", "/api/judge/assignments/{assignmentId}/ballot", "/api/submissions/{submissionId}/vote", "/api/records/{recordId}"):
        expect(p in doc["paths"], f"{p} undocumented")
    expect(all(v.get("summary") and v.get("responses") for x in doc["paths"].values() for v in x.values()), "operation without summary/responses")
    c.state["openapi_ops"] = len(ops)
    return f"{len(doc['paths'])} paths, {len(ops)} operations"


@check("T4", "T4.02", "Personal API tokens work as Bearer credentials and can be revoked")
def t4_tokens(c: Ctx):
    cl = c.client("participant")
    t = cl.post("/api/auth/tokens", {"label": f"acc-{c.run}"})
    expect_status(t, 201, "create token")
    expect(Client(c.base, t.json["token"]).get("/api/auth/me").json["user"] is not None, "new token rejected")
    expect_status(cl.delete(f"/api/auth/tokens/{t.json['id']}"), 204, "revoke")
    expect(Client(c.base, t.json["token"]).get("/api/auth/me").json["user"] is None, "revoked token still works")
    return None


@check("T4", "T4.03", "Webhooks: domain events delivered with a valid HMAC-SHA256 signature")
def t4_webhooks(c: Ctx):
    rec: Receiver = c.state["receiver"]
    hooks = c.state.get("hooks", [])
    expect(hooks, "webhooks were not registered")
    org = c.client("organizer")
    for h in hooks:
        org.post(f"/api/events/{c.state['eid']}/webhooks/{h['id']}/test")
    got = rec.wait_for(lambda r: r["headers"].get("x-dogfood-event") == "submission.submitted", 20)
    expect(got is not None, f"no delivery reached the local receiver (hosts tried: {', '.join(h['url'] for h in hooks)})")
    hook = next(h for h in hooks if got["path"].startswith(h["path"]))
    ts = got["headers"]["x-dogfood-timestamp"]
    expected = "sha256=" + hmac.new(hook["secret"].encode(), f"{ts}.{got['body']}".encode(), hashlib.sha256).hexdigest()
    expect(hmac.compare_digest(expected, got["headers"]["x-dogfood-signature"]), "signature does not verify")
    body = json.loads(got["body"])
    expect(body["eventId"] == c.state["eid"] and body["data"]["submissionId"] in c.state["subs"].values(), "payload wrong")
    ping = rec.wait_for(lambda r: r["headers"].get("x-dogfood-event") == "ping", 10)
    expect(ping is not None, "test ping not delivered")
    unsafe = org.post(f"/api/events/{c.state['eid']}/webhooks", {"url": "http://169.254.169.254/latest/meta-data", "events": ["vote.cast"]})
    expect(unsafe.code == "UNSAFE_WEBHOOK_TARGET", "cloud metadata target accepted")
    return f"delivered via {hook['url'].split('/')[2]}"


@check("T4", "T4.04", "Ed25519-signed records verify independently; tampering is detected")
def t4_records(c: Ctx):
    key = c.client().get("/.well-known/dogfood-signing-key.json").json
    expect(key.get("algorithm") == "Ed25519", "no Ed25519 key published")
    public = ed25519_public_from_pem(key["publicKeyPem"])
    issued = c.client("organizer").post(f"/api/events/{c.state['eid']}/records/issue")
    expect(issued.status in (200, 201), f"issue records: {issued.status}")
    records = c.client("organizer").get(f"/api/events/{c.state['eid']}/records").json
    kinds = {r["kind"] for r in records}
    expect({"judge_participation", "participant", "winner"} <= kinds, f"record kinds: {sorted(kinds)}")
    checked = 0
    for r in records:
        rec = c.client().get(f"/api/records/{r['id']}").json
        msg = canonical_json(rec["payload"]).encode()
        sig = b64url(rec["signature"])
        expect(rec["valid"] is True, "server says record invalid")
        expect(ed25519_verify(public, msg, sig), f"record {r['id']} fails independent Ed25519 verification")
        forged = dict(rec["payload"], subject=dict(rec["payload"]["subject"], name="Mallory"))
        expect(not ed25519_verify(public, canonical_json(forged).encode(), sig), "forged payload verified")
        checked += 1
    mine = c.client("participant").get("/api/me/records").json
    expect(any(m["payload"]["event"]["id"] == c.state["eid"] for m in mine), "participant cannot see their record")
    return f"{checked} records verified with a pure-Python RFC 8032 verifier"


@check("T4", "T4.05", "Embeddable gallery: CORS feed and frameable widget; the app itself refuses framing")
def t4_embed(c: Ctx):
    feed = c.client().get(f"/api/embed/events/{c.state['eid']}/gallery.json")
    expect_status(feed, 200, "embed feed")
    expect(feed.header("access-control-allow-origin") == "*", "feed lacks CORS")
    page = Client(c.base).request("GET", f"/embed/{c.state['slug']}", headers={"accept": "text/html"})
    expect("frame-ancestors *" in (page.header("content-security-policy") or ""), "widget not frameable")
    expect(page.status == 200 and "<div id=\"root\"" in page.text, f"widget page not served ({page.status})")
    home = Client(c.base).request("GET", "/", headers={"accept": "text/html"})
    expect(home.header("x-frame-options") == "DENY", "main app is frameable")
    expect(c.client().get("/api/embed/events/evt_04/gallery.json").status == 404, "draft event embeddable")
    return None


@check("T4", "T4.06", "Import/export: an exported event bundle re-imports as a faithful draft clone")
def t4_bundles(c: Ctx):
    org = c.client("organizer")
    exp = org.get(f"/api/events/{c.state['eid']}/export.json")
    expect_status(exp, 200, "export")
    b = exp.json
    expect(b["format"] == "dogfood.event.v1" and len(b["submissions"]) == 3 and b["assignments"], "export incomplete")
    b["event"] = dict(b["event"], slug=f"acc-{c.run}-clone", name=f"Clone {c.run}")
    imp = org.post("/api/events/import", b)
    expect_status(imp, 201, "import")
    clone = org.get(f"/api/events/{imp.json['id']}").json
    expect(clone["status"] == "draft" and [t["name"] for t in clone["tracks"]] == ["Tools", "Civic"], "clone structure wrong")
    crit = org.get(f"/api/events/{imp.json['id']}/criteria").json
    crit = crit["criteria"] if isinstance(crit, dict) else crit
    scoped = [x for x in crit if x["trackId"]]
    civic = next(t["id"] for t in clone["tracks"] if t["name"] == "Civic")
    expect(len(crit) == 3 and len(scoped) == 1 and scoped[0]["trackId"] == civic, "track-scoped criterion not re-linked")
    return None


@check("T4", "T4.07", "Uploads accept real images only (magic bytes), served with nosniff")
def t4_uploads(c: Ctx):
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082")
    cl = c.client("participant")
    ok = cl.request("POST", "/api/uploads", raw=png, headers={"content-type": "image/png"})
    expect_status(ok, 201, "upload PNG")
    served = Client(c.base).request("GET", ok.json["url"], headers={"accept": "image/*"})
    expect(served.status == 200 and served.header("x-content-type-options") == "nosniff", "upload not served safely")
    svg = cl.request("POST", "/api/uploads", raw=b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", headers={"content-type": "image/svg+xml"})
    expect(svg.status == 415, "SVG accepted")
    fake = cl.request("POST", "/api/uploads", raw=b"<html>not an image</html>", headers={"content-type": "image/png"})
    expect(fake.status == 415, "HTML disguised as PNG accepted")
    return None


# ---------------------------------------------------------------------------
# Bonuses
# ---------------------------------------------------------------------------

@check("BONUS", "B.01", "Normalization proof: documented and independently reproduced")
def b_norm(c: Ctx):
    run = c.state.get("seeded_run")
    expect(run, "seeded normalization run unavailable")
    for j in run["judges"]:
        if j["method"] != "z_score":
            continue
        zs = [e["z"] for e in run["entries"] if e["judgeId"] == j["judgeId"]]
        mean = sum(zs) / len(zs)
        expect(abs(mean) < 1e-9, f"judge {j['name']} z mean {mean}")
    doc = _read(c, "JUDGING.md")
    expect(doc and re.search(r"proof", doc, re.I), "JUDGING.md lacks the proof")
    return f"Spearman raw vs normalized = {run['spearmanRawVsNormalized']:.3f}"


@check("BONUS", "B.02", "Pairwise judging with a Bradley-Terry ranking (MAP fixed point verified)")
def b_pairwise(c: Ctx):
    eid = "evt_01"  # seeded event whose judging window is open
    judge = c.client("judge")
    nxt = judge.get(f"/api/judge/events/{eid}/pairwise/next").json
    if nxt["pair"]:
        a, b = nxt["pair"][0]["id"], nxt["pair"][1]["id"]
        expect_status(judge.post(f"/api/judge/events/{eid}/pairwise", {"winnerId": a, "loserId": b}), 201, "record comparison")
        dup = judge.post(f"/api/judge/events/{eid}/pairwise", {"winnerId": b, "loserId": a})
        expect(dup.code == "DUPLICATE_COMPARISON", "same pair compared twice")
    rank = c.client("organizer").get("/api/events/evt_01/pairwise/ranking").json
    expect(rank["converged"] and rank["comparisons"] > 0, "Bradley-Terry fit did not converge")
    items = rank["items"]
    expect(all(items[i]["strength"] >= items[i + 1]["strength"] for i in range(len(items) - 1)), "ranking not ordered by strength")
    # At the MAP fixed point with a strength-1 phantom opponent, the mean win
    # probability against the phantom is exactly 1/2 (sum over the MM update).
    total = sum(i["strength"] / (i["strength"] + 1) for i in items)
    expect(abs(total - len(items) / 2) < 1e-6, f"fixed-point identity off by {total - len(items) / 2}")
    return f"{rank['comparisons']} comparisons, {rank['iterations']} MM iterations"


@check("BONUS", "B.03", "Threat model covers Sybil voting, ballot stuffing, scraping, collusion and deadline gaming")
def b_threats(c: Ctx):
    doc = _read(c, "THREAT-MODEL.md")
    expect(doc, "THREAT-MODEL.md missing")
    for topic in ("sybil", "ballot stuffing", "scrap", "collusion", "deadline"):
        expect(topic in doc.lower(), f"threat model lacks {topic}")
    return None


@check("BONUS", "B.04", "API-first: every screen is backed by documented endpoints; interactive docs shipped")
def b_api_first(c: Ctx):
    expect(c.state.get("openapi_ops", 0) >= 100, "OpenAPI coverage too small")
    page = Client(c.base).request("GET", "/api-docs", headers={"accept": "text/html"})
    expect(page.status == 200, "API docs screen not served")
    return None


def _read(c: Ctx, name: str) -> str | None:
    p = os.path.join(c.root, name)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else None


# ---------------------------------------------------------------------------
# Setup hooks that must happen at a particular point in the sequence
# ---------------------------------------------------------------------------

def register_webhooks(c: Ctx) -> None:
    """Register receivers before submissions so real domain events are captured."""
    rec = Receiver()
    c.state["receiver"] = rec
    hosts = c.manifest.get("acceptance", {}).get("webhook_hosts", ["127.0.0.1", "host.docker.internal"])
    hooks = []
    for i, host in enumerate(hosts):
        path = f"/hook{i}"
        url = f"http://{host}:{rec.port}{path}"
        r = c.client("organizer").post(f"/api/events/{c.state['eid']}/webhooks", {"url": url, "events": ["submission.submitted"]})
        if r.status == 201:
            hooks.append({"id": r.json["id"], "secret": r.json["secret"], "url": url, "path": path})
    c.state["hooks"] = hooks


HOOKS_AFTER = {"T1.08": register_webhooks}

ORDER = [
    "T1.01", "T1.02", "T1.03", "T1.04", "T1.05", "T1.06", "T1.07", "T1.08", "T1.09", "T1.10",
    "T3.01", "T3.02", "T3.03", "T3.04", "T3.05", "T3.06",
    "T1.11", "T3.07",
    "T2.01", "T2.02", "T2.03", "T2.04", "T2.05", "T2.06", "T2.07", "T2.08",
    "T3.08",
    "T4.01", "T4.02", "T4.03", "T4.04", "T4.05", "T4.06", "T4.07",
    "B.01", "B.02", "B.03", "B.04",
]

TIER_TITLES = {
    "T1": "Tier 1 — Core platform (auth, events, teams, submissions, deadline, gallery)",
    "T2": "Tier 2 — Judging (invites, routing, rubric, isolation, normalization, CSV)",
    "T3": "Tier 3 — Community voting & integrity (modes, quadratic, Sybil, comments, audit)",
    "T4": "Tier 4 — Platform (OpenAPI, tokens, webhooks, signed records, embed, bundles)",
    "BONUS": "Bonuses",
}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python3 acceptance/run.py .dogfood.toml > acceptance-report.txt", file=sys.stderr)
        return 2
    manifest_path = os.path.abspath(argv[1])
    root = os.path.dirname(manifest_path)
    with open(manifest_path, "rb") as f:
        manifest = tomllib.load(f)
    base = os.environ.get("DOGFOOD_BASE_URL") or manifest["stack"]["base_url"]
    fixtures_path = os.path.join(root, manifest["stack"].get("fixtures", "fixtures.json"))
    with open(fixtures_path, encoding="utf-8") as f:
        fixtures = json.load(f)
    ctx = Ctx(base=base, manifest=manifest, fixtures=fixtures, root=root, tokens=dict(manifest["sessions"]))

    claimed = [f"T{t}" for t in manifest["tiers"]["claimed"]]
    bonuses = manifest.get("bonuses", {}).get("claimed", [])
    started = datetime.now(timezone.utc)

    out: list[str] = []
    w = out.append
    w("Dogfood acceptance report")
    w("=" * 72)
    w(f"Project      {manifest['project']['name']} {manifest['project'].get('version', '')}".rstrip())
    w(f"Target       {base}")
    w(f"Manifest     {os.path.basename(manifest_path)} — claims {', '.join(claimed)} + {len(bonuses)} bonus(es)")
    w(f"Fixtures     {os.path.basename(fixtures_path)} ({fixtures.get('format')}, {len(fixtures['users'])} users, {len(fixtures['events'])} events)")
    w(f"Run id       {ctx.run}")
    w(f"Started      {started.isoformat(timespec='seconds').replace('+00:00', 'Z')}")
    w("")

    registry = {cid: (tier, title, fn) for tier, cid, title, fn in CHECKS}
    results: list[Result] = []
    for cid in ORDER:
        tier, title, fn = registry[cid]
        t0 = time.perf_counter()
        try:
            note = fn(ctx) or ""
            ok = True
        except CheckFailed as e:
            ok, note = False, str(e)
        except Exception as e:  # noqa: BLE001 — a crash is a failure, with context
            ok, note = False, f"{type(e).__name__}: {e} @ {traceback.extract_tb(e.__traceback__)[-1].lineno}"
        results.append(Result(tier, cid, title, ok, int((time.perf_counter() - t0) * 1000), note))
        print(f"{'PASS' if ok else 'FAIL'} {cid} {title}" + (f" — {note}" if note and not ok else ""), file=sys.stderr)
        if cid in HOOKS_AFTER and ok:
            try:
                HOOKS_AFTER[cid](ctx)
            except Exception as e:  # noqa: BLE001
                print(f"setup after {cid} failed: {e}", file=sys.stderr)

    if "receiver" in ctx.state:
        ctx.state["receiver"].close()

    summary: dict[str, tuple[int, int]] = {}
    for tier in ("T1", "T2", "T3", "T4", "BONUS"):
        rows = [r for r in results if r.tier == tier]
        w(TIER_TITLES[tier])
        w("-" * 72)
        for r in rows:
            w(f"  {'PASS' if r.ok else 'FAIL'}  {r.cid:<6} {r.title}  ({r.ms} ms)")
            if r.note:
                w(f"                {'↳' if r.ok else '✗'} {r.note}")
        passed = sum(r.ok for r in rows)
        summary[tier] = (passed, len(rows))
        w(f"  {passed}/{len(rows)} passed")
        w("")

    verified = 0
    for t in ("T1", "T2", "T3", "T4"):
        p, n = summary[t]
        if p == n:
            verified = int(t[1])
        else:
            break
    claimed_max = max(int(t[1]) for t in claimed)
    bonus_ok = summary["BONUS"][0] == summary["BONUS"][1]
    total_p = sum(p for p, _ in summary.values())
    total_n = sum(n for _, n in summary.values())

    w("Summary")
    w("=" * 72)
    for t in ("T1", "T2", "T3", "T4"):
        p, n = summary[t]
        w(f"  {t}      {p:>2}/{n:<2}  {'VERIFIED' if p == n else 'NOT VERIFIED'}{'  (claimed)' if t in claimed else ''}")
    p, n = summary["BONUS"]
    w(f"  Bonus   {p:>2}/{n:<2}  {', '.join(bonuses) if bonuses else '-'}")
    w("")
    w(f"  Checks passed    {total_p}/{total_n}")
    w(f"  Claimed tier     T{claimed_max}")
    w(f"  Verified tier    T{verified}")
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    w(f"  Duration         {elapsed:.1f} s")
    passed_all = verified >= claimed_max and bonus_ok
    w(f"  Result           {'PASS' if passed_all else 'FAIL'}")
    print("\n".join(out))
    return 0 if passed_all else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
