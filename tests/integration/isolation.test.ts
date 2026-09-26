import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/**
 * F009 — judge isolation. Proven twice: through the HTTP API, and directly
 * against Postgres with the application role so Row-Level Security (not an
 * application WHERE clause) is what keeps judges apart.
 */
let s: TestStack;
let bAssignment: string;
let aAssignment: string;
beforeAll(async () => {
  s = await startStack();
  [{ id: bAssignment }] = await s.sql("SELECT id FROM assignments WHERE event_id = 'evt_01' AND judge_id = 'usr_judge_b' ORDER BY id LIMIT 1");
  [{ id: aAssignment }] = await s.sql("SELECT id FROM assignments WHERE event_id = 'evt_01' AND judge_id = 'usr_judge_a' ORDER BY id LIMIT 1");
});
afterAll(async () => {
  await s?.close();
});

describe("judge isolation through the API", () => {
  it("a judge's queue contains only their own assignments", async () => {
    const r = await s.as(TOKENS.judgeA).get("/api/judge/events/evt_01/assignments");
    expect(r.status).toBe(200);
    const expected = await s.sql("SELECT id FROM assignments WHERE event_id = 'evt_01' AND judge_id = 'usr_judge_a'");
    expect(r.body.map((a: { id: string }) => a.id).sort()).toEqual(expected.map((e) => e.id).sort());
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("judge A cannot read judge B's assignment or ballot", async () => {
    const r = await s.as(TOKENS.judgeA).get(`/api/judge/assignments/${bAssignment}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_YOUR_ASSIGNMENT");
    expect(r.text).not.toMatch(/usr_judge_b/);
  });

  it("judge A cannot write into judge B's ballot, and B's scores are untouched", async () => {
    const before = await s.sql("SELECT criterion_id, value FROM scores WHERE assignment_id = $1 ORDER BY criterion_id", [bAssignment]);
    const r = await s.as(TOKENS.judgeA).put(`/api/judge/assignments/${bAssignment}/ballot`, { scores: { crt_01_impact: 0 } });
    expect(r.status).toBe(403);
    expect(await s.sql("SELECT criterion_id, value FROM scores WHERE assignment_id = $1 ORDER BY criterion_id", [bAssignment])).toEqual(before);
  });

  it("a judge sees their own ballot but nobody else's scores for the same project", async () => {
    const r = await s.as(TOKENS.judgeA).get(`/api/judge/assignments/${aAssignment}`);
    expect(r.status).toBe(200);
    const [{ submission_id }] = await s.sql("SELECT submission_id FROM assignments WHERE id = $1", [aAssignment]);
    const others = await s.sql("SELECT DISTINCT judge_id FROM ballots WHERE submission_id = $1 AND judge_id <> 'usr_judge_a'", [submission_id]);
    for (const o of others) expect(r.text).not.toContain(o.judge_id);
    expect(Object.keys(r.body)).toEqual(["assignment", "submission", "criteria", "ballot"]);
  });

  it("track-scoped judges only get projects from their tracks", async () => {
    const r = await s.as(TOKENS.judgeF).get("/api/judge/events/evt_01/assignments");
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    for (const a of r.body) expect(a.trackId).toBe("trk_01_civic");
  });

  it("raw ballots are organizer-only", async () => {
    for (const t of [TOKENS.judgeA, TOKENS.participant, TOKENS.visitor]) {
      const r = await s.as(t).get("/api/events/evt_01/ballots");
      expect(r.status).toBe(403);
    }
    const ok = await s.as(TOKENS.organizer).get("/api/events/evt_01/ballots");
    expect(ok.status).toBe(200);
    expect(new Set(ok.body.map((b: { judgeId: string }) => b.judgeId)).size).toBeGreaterThan(2);
  });

  it("judges of one event cannot see another event's queue", async () => {
    // judge.b is not on evt_02's panel.
    const r = await s.as(TOKENS.judgeB).get("/api/judge/events/evt_02/assignments");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_EVENT_JUDGE");
  });
});

describe("judge isolation enforced by Postgres RLS", () => {
  it("SELECT on scores/ballots/assignments returns only the current judge's rows", async () => {
    await s.asDbUser("usr_judge_a", "judge", async (q) => {
      for (const table of ["scores", "ballots", "assignments"]) {
        const rows = await q(`SELECT DISTINCT judge_id FROM ${table}`);
        expect(rows.map((r) => r.judge_id), table).toEqual(["usr_judge_a"]);
      }
    });
  });

  it("an unfiltered UPDATE of another judge's scores affects zero rows", async () => {
    await s.asDbUser("usr_judge_a", "judge", async (q) => {
      const rows = await q("UPDATE scores SET value = 0 WHERE judge_id = 'usr_judge_b' RETURNING 1");
      expect(rows).toHaveLength(0);
    });
  });

  it("inserting a score on someone else's assignment is rejected", async () => {
    await expect(
      s.asDbUser("usr_judge_a", "judge", (q) =>
        q("INSERT INTO scores (assignment_id, criterion_id, judge_id, event_id, value) VALUES ($1, 'crt_01_impact', 'usr_judge_a', 'evt_01', 1)", [bAssignment]),
      ),
    ).rejects.toThrow();
  });

  it("normalization snapshots are staff-only; ballots are visible only to their own judge", async () => {
    const [{ n: own }] = await s.sql("SELECT count(*)::int AS n FROM ballots WHERE judge_id = 'usr_judge_a'");
    for (const [uid, role, expected] of [["usr_judge_a", "judge", own], [null, "anonymous", 0], ["usr_participant", "participant", 0]] as const) {
      await s.asDbUser(uid, role, async (q) => {
        expect((await q("SELECT count(*)::int AS n FROM normalization_runs"))[0].n).toBe(0);
        expect((await q("SELECT count(*)::int AS n FROM ballots"))[0].n, role).toBe(expected);
        expect((await q("SELECT count(*)::int AS n FROM pairwise_votes WHERE judge_id <> coalesce($1, '')", [uid]))[0].n).toBe(0);
      });
    }
    const [{ n }] = await s.sql("SELECT count(*)::int AS n FROM ballots");
    expect(n).toBeGreaterThan(own);
  });

  it("organizers read ballots only for events they run", async () => {
    // organizer2 co-runs evt_03 but has nothing to do with evt_01.
    await s.asDbUser("usr_organizer2", "organizer", async (q) => {
      const rows = await q("SELECT DISTINCT event_id FROM ballots");
      expect(rows.map((r) => r.event_id)).toEqual(["evt_03"]);
    });
    await s.asDbUser("usr_organizer", "organizer", async (q) => {
      expect((await q("SELECT count(*)::int AS n FROM ballots WHERE event_id = 'evt_01'"))[0].n).toBeGreaterThan(0);
    });
  });

  it("the application role cannot read the signing key or app secret", async () => {
    await expect(s.asDbUser("usr_admin", "admin", (q) => q("SELECT value FROM settings"))).rejects.toThrow(/permission denied/);
    const [{ n }] = await s.sql("SELECT count(*)::int AS n FROM settings WHERE key IN ('app_secret', 'signing_key')");
    expect(n).toBe(2);
  });

  it("the application role cannot rewrite or delete audit history", async () => {
    await expect(s.asDbUser("usr_admin", "admin", (q) => q("UPDATE audit_log SET summary = 'x'"))).rejects.toThrow(/permission denied/);
    await expect(s.asDbUser("usr_admin", "admin", (q) => q("DELETE FROM audit_log"))).rejects.toThrow(/permission denied/);
  });
});
