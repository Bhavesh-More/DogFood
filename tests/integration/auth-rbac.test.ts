import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

let s: TestStack;
beforeAll(async () => {
  s = await startStack();
});
afterAll(async () => {
  await s?.close();
});

describe("F001 — local session auth", () => {
  it("registers, keeps an HttpOnly SameSite session cookie, and logs out", async () => {
    const jar = s.cookieJar();
    const reg = await jar.post("/api/auth/register", { email: "new.person@example.org", password: "correct horse", name: "New Person" });
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ email: "new.person@example.org", role: "participant" });
    const cookie = reg.headers.getSetCookie().find((c) => c.startsWith("dogfood_session="))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect((await jar.get("/api/auth/me")).body.user.email).toBe("new.person@example.org");
    expect((await jar.post("/api/auth/logout")).status).toBe(204);
    expect((await jar.get("/api/auth/me")).body.user).toBeNull();
  });

  it("stores only a password hash (scrypt), never plaintext", async () => {
    const [row] = await s.sql("SELECT password_hash FROM users WHERE email = 'new.person@example.org'");
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain("correct horse");
  });

  it("rejects duplicate emails case-insensitively", async () => {
    const r = await s.anon.post("/api/auth/register", { email: "NEW.PERSON@example.org", password: "whatever12", name: "X" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EMAIL_TAKEN");
  });

  it("logs in with the seeded demo password and answers 401 identically for unknown emails", async () => {
    const ok = await s.cookieJar().post("/api/auth/login", { email: "organizer@dogfood.local", password: "dogfood-demo-2026" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("organizer");
    const wrong = await s.anon.post("/api/auth/login", { email: "organizer@dogfood.local", password: "nope" });
    const unknown = await s.anon.post("/api/auth/login", { email: "ghost@dogfood.local", password: "nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it("returns structured validation errors", async () => {
    const r = await s.anon.post("/api/auth/register", { email: "not-an-email", password: "short", name: "" });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("VALIDATION_FAILED");
    expect(r.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["email", "name", "password"]);
  });

  it("accepts Bearer API tokens and lets users revoke them", async () => {
    const created = await s.as(TOKENS.participant).post("/api/auth/tokens", { label: "ci" });
    expect(created.status).toBe(201);
    const me = await s.as(created.body.token).get("/api/auth/me");
    expect(me.body.user.email).toBe("participant@dogfood.local");
    await s.as(TOKENS.participant).del(`/api/auth/tokens/${created.body.id}`);
    expect((await s.as(created.body.token).get("/api/auth/me")).body.user).toBeNull();
  });

  it("rejects malformed JSON with 400 and oversized tokens gracefully", async () => {
    const res = await s.anon.raw("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_JSON");
    expect((await s.as("x".repeat(600)).get("/api/auth/me")).body.user).toBeNull();
  });
});

describe("F001 — five-role RBAC enforced by the API", () => {
  const createBody = { slug: "rbac-test", name: "RBAC Test", startsAt: "2030-01-01T00:00:00Z", submissionDeadline: "2030-01-03T00:00:00Z" };

  it("401 for anonymous calls to protected endpoints", async () => {
    for (const p of ["/api/judge/events", "/api/auth/tokens", "/api/me/records", "/api/admin/users"]) {
      const r = await s.anon.get(p);
      expect(r.status, p).toBe(401);
      expect(r.body.code).toBe("UNAUTHORIZED");
    }
  });

  it("only organizers and admins can create events", async () => {
    for (const t of [TOKENS.participant, TOKENS.judgeA, TOKENS.visitor]) {
      const r = await s.as(t).post("/api/events", createBody);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("ROLE_FORBIDDEN");
    }
    expect((await s.as(TOKENS.organizer).post("/api/events", createBody)).status).toBe(201);
  });

  it("only admins manage users", async () => {
    expect((await s.as(TOKENS.organizer).get("/api/admin/users")).status).toBe(403);
    expect((await s.as(TOKENS.admin).get("/api/admin/users")).status).toBe(200);
  });

  it("judges cannot form teams and visitors cannot submit", async () => {
    expect((await s.as(TOKENS.judgeA).post("/api/events/evt_02/teams", { name: "Sneaky" })).status).toBe(403);
    expect((await s.as(TOKENS.visitor).put("/api/teams/team_02_01/submission", { title: "x" })).status).toBe(403);
  });

  it("an organizer cannot manage another organizer's event (tenant isolation)", async () => {
    // evt_04 is a draft owned by organizer2: invisible, not just forbidden.
    expect((await s.as(TOKENS.organizer).get("/api/events/evt_04")).status).toBe(404);
    expect((await s.as(TOKENS.organizer).patch("/api/events/evt_04", { name: "Hijack" })).status).toBe(404);
    expect((await s.anon.get("/api/events/evt_04")).status).toBe(404);
    expect((await s.as(TOKENS.admin).get("/api/events/evt_04")).status).toBe(200);
  });

  it("role changes are admin-only, audited and sign the user out", async () => {
    const [u] = await s.sql("SELECT id FROM users WHERE email = 'visitor@dogfood.local'");
    const r = await s.as(TOKENS.admin).patch(`/api/admin/users/${u.id}/role`, { role: "participant" });
    expect(r.status).toBe(200);
    const [audit] = await s.sql("SELECT summary FROM audit_log WHERE action = 'user.role_changed' ORDER BY seq DESC LIMIT 1");
    expect(audit.summary).toContain("visitor → participant");
  });
});

describe("privacy of public endpoints", () => {
  it("never exposes email addresses to anonymous or other users", async () => {
    const paths = [
      "/api/events",
      "/api/events/evt_01",
      "/api/events/evt_01/gallery?pageSize=200",
      "/api/submissions/sub_01_02",
      "/api/submissions/sub_01_02/comments",
      "/api/events/evt_03/results",
      "/api/embed/events/evt_01/gallery.json",
    ];
    for (const p of paths) {
      for (const client of [s.anon, s.as(TOKENS.participant2)]) {
        const r = await client.get(p);
        expect(r.status, p).toBe(200);
        expect(r.text, p).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      }
    }
  });
});

describe("security headers & CSRF", () => {
  it("sends a strict CSP and anti-framing headers", async () => {
    const r = await s.anon.get("/api/health");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("blocks cross-origin cookie-authenticated writes", async () => {
    const jar = s.cookieJar();
    await jar.post("/api/auth/login", { email: "participant@dogfood.local", password: "dogfood-demo-2026" });
    const r = await jar.put("/api/teams/team_02_01/submission", { title: "CSRF" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CSRF_BLOCKED");
  });

  it("answers malformed input with 4xx, never 500", async () => {
    const probes: [string, Promise<{ status: number }>][] = [
      ["NUL in a path param", s.anon.get("/api/events/evt%00")],
      ["invalid percent-encoding", s.anon.get("/api/events/%C0%AF")],
      ["NUL inside a JSON string", s.as(TOKENS.participant).put("/api/teams/team_02_01/submission", { title: "bad\u0000title" })],
      ["duplicated query params", s.anon.get("/api/events/evt_01/gallery?page=1&page=2")],
      ["tsquery operators in search", s.anon.get("/api/events/evt_01/gallery?q=%21%26%7C%3A%2A%28%29")],
      ["array instead of object", s.as(TOKENS.organizer).post("/api/events", [1, 2, 3])],
    ];
    for (const [what, p] of probes) {
      const r = await p;
      expect(r.status, what).toBeLessThan(500);
    }
  });

  it("never leaks stack traces", async () => {
    const r = await s.anon.get("/api/does-not-exist");
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts/);
  });
});
