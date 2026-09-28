import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/**
 * F004/F005 — the hard deadline is the server's clock (and, behind it, the
 * database's), never the client's; invite links are single-use, expiring and
 * race-safe.
 */
let s: TestStack;
const tok: Record<string, string> = {};
beforeAll(async () => {
  s = await startStack();
  for (const id of ["usr_p01", "usr_p02", "usr_p03", "usr_p04", "usr_p05"]) tok[id] = await s.tokenFor(id);
});
afterAll(async () => {
  await s?.close();
});

describe("F005 — deadline lock", () => {
  it("rejects edits after the deadline even when the client lies about the time", async () => {
    const r = await s.as(TOKENS.participant).put(
      "/api/teams/team_01_01/submission",
      { title: "Too late" },
      { date: "Mon, 01 Jan 2024 00:00:00 GMT", "x-client-time": "2024-01-01T00:00:00Z" },
    );
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("DEADLINE_PASSED");
    expect(r.body.details.deadline).toMatch(/Z$/);
    const [row] = await s.sql("SELECT title FROM submissions WHERE id = 'sub_01_01'");
    expect(row.title).toBe("Deadline Sentinel");
  });

  it("also locks submit/unsubmit and roster changes after the deadline", async () => {
    expect((await s.as(TOKENS.participant).post("/api/submissions/sub_01_01/unsubmit")).body.code).toBe("DEADLINE_PASSED");
    expect((await s.as(TOKENS.participant).post("/api/teams/team_01_01/invites")).body.code).toBe("DEADLINE_PASSED");
  });

  it("accepts edits before the deadline", async () => {
    const r = await s.as(TOKENS.participant).put("/api/teams/team_02_01/submission", { title: "Pantry Planner 2" });
    expect(r.status).toBe(200);
    expect(r.body.title).toBe("Pantry Planner 2");
  });

  it("the database refuses late writes even if the API check were bypassed", async () => {
    await expect(
      s.asDbUser("usr_participant", "participant", (q) => q("UPDATE submissions SET title = 'sneaky' WHERE id = 'sub_01_01'")),
    ).rejects.toThrow(/deadline has passed/);
    // Organizer-side eligibility decisions stay possible after the deadline.
    await s.asDbUser("usr_organizer", "organizer", async (q) => {
      const rows = await q("UPDATE submissions SET eligibility = 'eligible' WHERE id = 'sub_01_01' RETURNING id");
      expect(rows).toHaveLength(1);
    });
  });

  it("a per-team extension reopens only that team, and is audited", async () => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    const ext = await s.as(TOKENS.organizer).post("/api/teams/team_01_01/extension", { until, reason: "Venue power outage" });
    expect(ext.status).toBe(200);
    expect((await s.as(TOKENS.participant).put("/api/teams/team_01_01/submission", { tagline: "Extended" })).status).toBe(200);
    // Another team in the same event is still locked.
    const other = await s.as(await s.tokenFor("usr_p02")).put("/api/teams/team_01_02/submission", { tagline: "me too" });
    expect(other.body.code).toBe("DEADLINE_PASSED");
    const [a] = await s.sql("SELECT summary FROM audit_log WHERE action = 'submission.extension_granted' OR summary LIKE 'Extension for%' ORDER BY seq DESC LIMIT 1");
    expect(a.summary).toContain("Venue power outage");
    await s.as(TOKENS.organizer).post("/api/teams/team_01_01/extension", { until: null, reason: "Outage resolved" });
    expect((await s.as(TOKENS.participant).put("/api/teams/team_01_01/submission", { tagline: "again" })).body.code).toBe("DEADLINE_PASSED");
  });

  it("extensions must end after the event deadline and only organizers can grant them", async () => {
    const early = await s.as(TOKENS.organizer).post("/api/teams/team_01_01/extension", { until: "2020-01-01T00:00:00Z", reason: "nope" });
    expect(early.body.code).toBe("EXTENSION_TOO_EARLY");
    expect((await s.as(TOKENS.participant).post("/api/teams/team_01_01/extension", { until: null, reason: "self-serve" })).status).toBe(403);
  });
});

describe("F004 — teams & single-use invites", () => {
  let first: { id: string; token: string };

  it("invites return the raw token once and store only its SHA-256 hash", async () => {
    const r = await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites");
    expect(r.status).toBe(201);
    first = r.body;
    expect(first.token.length).toBeGreaterThanOrEqual(24);
    const [row] = await s.sql("SELECT token_hash FROM team_invites WHERE id = $1", [first.id]);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toContain(first.token);
    const list = await s.as(TOKENS.participant).get("/api/teams/team_02_01/invites");
    expect(list.text).not.toContain(first.token);
  });

  it("only team members can mint invites", async () => {
    expect((await s.as(tok.usr_p01!).post("/api/teams/team_02_01/invites")).status).toBe(403);
  });

  it("an invite admits exactly one person, even under a race", async () => {
    const [a, b] = await Promise.all([
      s.as(tok.usr_p01!).post(`/api/invites/${first.token}/accept`),
      s.as(tok.usr_p02!).post(`/api/invites/${first.token}/accept`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body.code, b.body.code]).toContain("INVITE_USED");
    const [{ n }] = await s.sql("SELECT count(*)::int AS n FROM team_members WHERE team_id = 'team_02_01'");
    expect(n).toBe(2);
  });

  it("one team per person per event", async () => {
    const joined = (await s.sql("SELECT user_id FROM team_members WHERE team_id = 'team_02_01' AND user_id IN ('usr_p01','usr_p02')"))[0].user_id;
    const inv = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    const again = await s.as(tok[joined]!).post(`/api/invites/${inv.token}/accept`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_ON_TEAM");
    await s.as(TOKENS.participant).del(`/api/teams/team_02_01/invites/${inv.id}`);
  });

  it("expired and revoked links are refused with 410", async () => {
    const exp = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    await s.sql("UPDATE team_invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [exp.id]);
    const r1 = await s.as(tok.usr_p03!).post(`/api/invites/${exp.token}/accept`);
    expect(r1.status).toBe(410);
    expect(r1.body.code).toBe("INVITE_EXPIRED");

    const rev = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    expect((await s.as(TOKENS.participant).del(`/api/teams/team_02_01/invites/${rev.id}`)).status).toBe(204);
    const r2 = await s.as(tok.usr_p03!).post(`/api/invites/${rev.token}/accept`);
    expect(r2.status).toBe(410);
    expect(r2.body.code).toBe("INVITE_REVOKED");
    expect((await s.as(tok.usr_p03!).post("/api/invites/not-a-real-token/accept")).status).toBe(404);
  });

  it("enforces the maximum team size at mint time and at accept time", async () => {
    // evt_02 allows 3 members; the team has 2. Mint two links while there is room.
    const i1 = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    const i2 = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    expect((await s.as(tok.usr_p04!).post(`/api/invites/${i1.token}/accept`)).status).toBe(200);
    const full = await s.as(tok.usr_p05!).post(`/api/invites/${i2.token}/accept`);
    expect(full.status).toBe(409);
    expect(full.body.code).toBe("TEAM_FULL");
    expect((await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body.code).toBe("TEAM_FULL");
  });

  it("judges on the panel cannot join or form teams in that event", async () => {
    const r = await s.as(TOKENS.judgeA).post("/api/events/evt_02/teams", { name: "Judge Squad" });
    expect(r.status).toBe(403);
  });

  it("every roster change lands in the audit log", async () => {
    const rows = await s.sql("SELECT action FROM audit_log WHERE event_id = 'evt_02' AND action LIKE 'team.%'");
    const actions = new Set(rows.map((r) => r.action));
    expect(actions).toContain("team.invite_created");
    expect(actions).toContain("team.member_joined");
  });

  it("only the captain can rename a team", async () => {
    const member = await s.tokenFor("usr_p36"); // member of team_02_02
    const r = await s.as(member).patch("/api/teams/team_02_02", { name: "Hijacked" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_CAPTAIN");
  });

  it("archiving an event locks rosters and invite minting", async () => {
    expect((await s.as(TOKENS.organizer).post("/api/events/evt_02/archive")).status).toBe(200);
    const captain = await s.tokenFor("usr_p38"); // captain of team_02_02
    const mint = await s.as(captain).post("/api/teams/team_02_02/invites");
    expect(mint.status).toBe(403);
    expect(mint.body.code).toBe("EVENT_NOT_OPEN");
    const rename = await s.as(captain).patch("/api/teams/team_02_02", { name: "Nope" });
    expect(rename.status).toBe(403);
    expect(rename.body.code).toBe("EVENT_NOT_OPEN");
  });
});
