import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type Client, type TestStack } from "./helpers";

/**
 * One event driven end-to-end through the public API on a controllable
 * server clock: setup → registration → teams → submissions → hard deadline →
 * judge invites → conflicts → algorithmic routing → scoring → normalization
 * (Min-Max fallback, N < 5) → publish → CSV → audit chain.
 */
const HOUR = 3600_000;
let clock = Date.now();
let s: TestStack;
let org: Client;
let eventId: string;
let questionId: string;
const crit: Record<string, string> = {};
const teams: { user: string; client: Client; teamId: string; submissionId: string }[] = [];
const judges: Record<string, Client> = {};

beforeAll(async () => {
  s = await startStack({ now: () => clock });
  org = s.as(TOKENS.organizer);
});
afterAll(async () => {
  await s?.close();
});

describe("event lifecycle", () => {
  it("organizer creates a draft event that nobody else can see", async () => {
    const r = await org.post("/api/events", {
      slug: "lifecycle-2026",
      name: "Lifecycle Hack",
      startsAt: new Date(clock - HOUR).toISOString(),
      submissionDeadline: new Date(clock + 2 * HOUR).toISOString(),
      judgingEndsAt: new Date(clock + 48 * HOUR).toISOString(),
      maxTeamSize: 2,
      reviewsPerSubmission: 2,
    });
    expect(r.status).toBe(201);
    eventId = r.body.id;
    expect(r.body.status).toBe("draft");
    expect((await s.anon.get(`/api/events/${eventId}`)).status).toBe(404);
    expect((await org.post("/api/events", { slug: "lifecycle-2026", name: "Dup", startsAt: "2030-01-01T00:00:00Z", submissionDeadline: "2030-01-02T00:00:00Z" })).body.code).toBe("SLUG_TAKEN");
  });

  it("builds a weighted rubric and a required question, then publishes", async () => {
    crit.impact = (await org.post(`/api/events/${eventId}/criteria`, { name: "Impact", weight: 2, maxScore: 10 })).body.id;
    crit.craft = (await org.post(`/api/events/${eventId}/criteria`, { name: "Craft", weight: 1, maxScore: 10 })).body.id;
    questionId = (await org.post(`/api/events/${eventId}/questions`, { label: "Which API did you use?", required: true })).body.id;
    expect(Object.values(crit).every(Boolean) && questionId).toBeTruthy();
    expect((await org.post(`/api/events/${eventId}/publish`)).status).toBe(200);
    const pub = await s.anon.get(`/api/events/${eventId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.questions).toHaveLength(1);
  });

  it("participants register, form teams and draft submissions", async () => {
    for (let i = 0; i < 6; i++) {
      const user = `usr_p${10 + i}`;
      const client = s.as(await s.tokenFor(user));
      expect((await client.post(`/api/events/${eventId}/register`)).status).toBeLessThan(300);
      const team = await client.post(`/api/events/${eventId}/teams`, { name: `Team ${i + 1}` });
      expect(team.status).toBe(201);
      const title = i === 0 ? '=HYPERLINK("http://evil.example","win")' : `Project ${i + 1}`;
      const draft = await client.put(`/api/teams/${team.body.id}/submission`, {
        title,
        description: "A project that is described in enough detail.",
        repoUrl: `https://github.com/example/project-${i + 1}`,
      });
      expect(draft.status).toBe(200);
      teams.push({ user, client, teamId: team.body.id, submissionId: draft.body.id });
    }
  });

  it("refuses to lock in an incomplete submission and lists what is missing", async () => {
    const r = await teams[0]!.client.post(`/api/submissions/${teams[0]!.submissionId}/submit`);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("INCOMPLETE_SUBMISSION");
    expect(r.body.details.map((d: { path: string }) => d.path)).toEqual([`answers.${questionId}`]);
  });

  it("drafts are private until submitted", async () => {
    expect((await s.anon.get(`/api/submissions/${teams[1]!.submissionId}`)).status).toBe(404);
    expect((await teams[2]!.client.get(`/api/submissions/${teams[1]!.submissionId}`)).status).toBe(404);
  });

  it("locks in complete submissions", async () => {
    for (const t of teams) {
      await t.client.put(`/api/teams/${t.teamId}/submission`, { answers: { [questionId]: "Maps" } });
      const r = await t.client.post(`/api/submissions/${t.submissionId}/submit`);
      expect(r.status).toBe(200);
      expect(r.body.status).toBe("submitted");
    }
    const gallery = await s.anon.get(`/api/events/${eventId}/gallery`);
    expect(gallery.body.items ?? gallery.body).toHaveLength(6);
  });

  it("judge invitations are single-use and keep roles separate", async () => {
    const mint = async () => (await org.post(`/api/events/${eventId}/judge-invites`, { note: "panel" })).body.token as string;
    for (const j of ["usr_judge_c", "usr_judge_d", "usr_judge_e"]) {
      judges[j] = s.as(await s.tokenFor(j));
      const token = await mint();
      expect((await judges[j]!.post(`/api/judge-invites/${token}/accept`)).status).toBe(200);
      expect((await judges.usr_judge_c!.post(`/api/judge-invites/${token}/accept`)).body.code).toBe("INVITE_USED");
    }
    const t1 = await mint();
    expect((await teams[0]!.client.post(`/api/judge-invites/${t1}/accept`)).body.code).toBe("PARTICIPANT_CONFLICT");
    expect((await org.post(`/api/judge-invites/${t1}/accept`)).body.code).toBe("ORGANIZER_CANNOT_JUDGE");
    const panel = await org.get(`/api/events/${eventId}/judges`);
    expect(panel.body.map((j: { judgeId: string }) => j.judgeId).sort()).toEqual(["usr_judge_c", "usr_judge_d", "usr_judge_e"]);
  });

  it("a declared conflict is honoured by routing", async () => {
    const r = await org.post(`/api/events/${eventId}/conflicts`, { judgeId: "usr_judge_c", submissionId: teams[0]!.submissionId, reason: "Former colleague" });
    expect(r.status).toBeLessThan(300);
  });

  it("the deadline passes on the server clock", async () => {
    clock += 3 * HOUR;
    const r = await teams[1]!.client.put(`/api/teams/${teams[1]!.teamId}/submission`, { title: "late" });
    expect(r.body.code).toBe("DEADLINE_PASSED");
  });

  it("auto-assignment previews without writing, then creates a balanced plan", async () => {
    const dry = await org.post(`/api/events/${eventId}/assignments/auto`, { dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.created).toHaveLength(12);
    expect((await s.sql("SELECT count(*)::int AS n FROM assignments WHERE event_id = $1", [eventId]))[0].n).toBe(0);

    const real = await org.post(`/api/events/${eventId}/assignments/auto`, { dryRun: false });
    expect(real.body.created).toHaveLength(12);
    const rows = await s.sql("SELECT judge_id, submission_id FROM assignments WHERE event_id = $1", [eventId]);
    const perSubmission = new Map<string, Set<string>>();
    const perJudge = new Map<string, number>();
    for (const r of rows) {
      perSubmission.set(r.submission_id, (perSubmission.get(r.submission_id) ?? new Set()).add(r.judge_id));
      perJudge.set(r.judge_id, (perJudge.get(r.judge_id) ?? 0) + 1);
    }
    for (const judgesOf of perSubmission.values()) expect(judgesOf.size).toBe(2);
    expect(perSubmission.get(teams[0]!.submissionId)).not.toContain("usr_judge_c");
    expect(Math.max(...perJudge.values()) - Math.min(...perJudge.values())).toBeLessThanOrEqual(1);

    const again = await org.post(`/api/events/${eventId}/assignments/auto`, { dryRun: false });
    expect(again.body.created).toHaveLength(0);
  });

  it("validates ballots against the rubric", async () => {
    const [a] = (await judges.usr_judge_d!.get(`/api/judge/events/${eventId}/assignments`)).body;
    const over = await judges.usr_judge_d!.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { [crt("impact")]: 11 } });
    expect(over.body.code).toBe("INVALID_BALLOT");
    const missing = await judges.usr_judge_d!.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { [crt("impact")]: 5 }, submit: true });
    expect(missing.body.code).toBe("INVALID_BALLOT");
    const foreign = await judges.usr_judge_d!.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { crt_01_impact: 5 } });
    expect(foreign.body.code).toBe("INVALID_BALLOT");
    const partial = await judges.usr_judge_d!.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { [crt("impact")]: 5 } });
    expect(partial.status).toBe(200);
    expect(partial.body.submittedAt).toBeNull();
  });

  it("judges submit every ballot; totals are weighted server-side", async () => {
    const leniency: Record<string, number> = { usr_judge_c: -2, usr_judge_d: 2, usr_judge_e: 0 };
    for (const [id, client] of Object.entries(judges)) {
      const queue = (await client.get(`/api/judge/events/${eventId}/assignments`)).body as { id: string; submissionId: string }[];
      for (const a of queue) {
        const q = teams.findIndex((t) => t.submissionId === a.submissionId);
        const base = 3 + q; // latent quality: later teams are better
        const impact = clamp(base + leniency[id]!);
        const craft = clamp(base - 1 + leniency[id]!);
        const r = await client.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { [crt("impact")]: impact, [crt("craft")]: craft }, comment: "ok", submit: true });
        expect(r.status).toBe(200);
        expect(r.body.rawTotal).toBeCloseTo(((2 * impact) / 10 + craft / 10) / 3 * 100, 6);
      }
    }
  });

  it("results stay hidden until published", async () => {
    const r = await s.anon.get(`/api/events/${eventId}/results`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("RESULTS_HIDDEN");
  });

  it("normalizes with the Min-Max fallback for small samples and reports invariants", async () => {
    const r = await org.post(`/api/events/${eventId}/normalize`);
    expect(r.status).toBe(201);
    expect(r.body.judges).toHaveLength(3);
    for (const j of r.body.judges) expect(j.method).toBe("min_max");
    expect(r.body.invariants.every((i: { holds: boolean }) => i.holds)).toBe(true);
    expect(r.body.results).toHaveLength(6);
    // Leniency is removed: the latent order (team 6 best) is recovered.
    expect(r.body.results[0].submissionId).toBe(teams[5]!.submissionId);
    expect(r.body.spearmanRawVsNormalized).toBeGreaterThan(0.5);
  });

  it("publishes results publicly and then locks ballots", async () => {
    expect((await org.post(`/api/events/${eventId}/results/publish`, { rerun: false })).status).toBe(200);
    const r = await s.anon.get(`/api/events/${eventId}/results`);
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: { rank: number }) => x.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    const [a] = (await judges.usr_judge_e!.get(`/api/judge/events/${eventId}/assignments`)).body;
    const late = await judges.usr_judge_e!.put(`/api/judge/assignments/${a.id}/ballot`, { scores: { [crt("impact")]: 1 } });
    expect(late.body.code).toBe("JUDGING_CLOSED");
  });

  it("exports CSV with formula-injection protection, organizers only", async () => {
    const r = await org.get(`/api/events/${eventId}/exports/results.csv`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    const [header, ...lines] = r.text.trim().split(/\r?\n/);
    expect(header).toMatch(/^rank,submission_id,title/);
    expect(lines).toHaveLength(6);
    expect(r.text).toContain(`"'=HYPERLINK(""http://evil.example"",""win"")"`);
    expect(r.text).not.toMatch(/(^|,)=HYPERLINK/m);
    expect((await teams[0]!.client.get(`/api/events/${eventId}/exports/results.csv`)).status).toBe(403);
    const scores = await org.get(`/api/events/${eventId}/exports/scores.csv`);
    expect(scores.text.trim().split(/\r?\n/)).toHaveLength(13);
  });

  it("the whole story is in a verifiable, hash-chained audit log", async () => {
    const actions = new Set((await s.sql("SELECT action FROM audit_log WHERE event_id = $1", [eventId])).map((r) => r.action));
    for (const a of ["event.created", "criterion.created", "submission.submitted", "judge.joined", "ballot.submitted", "results.normalized", "results.published"]) {
      expect(actions, a).toContain(a);
    }
    const v = await s.as(TOKENS.admin).get("/api/audit/verify");
    expect(v.body.valid).toBe(true);
  });

  it("event status is a one-way machine: no unpublish, and archive is terminal", async () => {
    // Republishing a live event is a safe no-op.
    expect((await org.post(`/api/events/${eventId}/publish`)).status).toBe(200);
    // Unpublish no longer exists.
    expect((await org.post(`/api/events/${eventId}/unpublish`)).status).toBe(404);
    expect((await org.post(`/api/events/${eventId}/archive`)).status).toBe(200);
    expect((await org.post(`/api/events/${eventId}/archive`)).status).toBe(200);
    const back = await org.post(`/api/events/${eventId}/publish`);
    expect(back.status).toBe(409);
    expect(back.body.code).toBe("EVENT_ARCHIVED");
  });
});

function crt(name: string): string {
  return crit[name]!;
}
function clamp(v: number): number {
  return Math.max(0, Math.min(10, v));
}
