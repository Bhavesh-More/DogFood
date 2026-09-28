import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/**
 * T3 — community voting. Budgets, quadratic cost, duplicate prevention,
 * email gating with canonicalised addresses, the open-link Sybil heuristic,
 * hidden tallies and comments.
 */
const HOUR = 3600_000;
let clock = Date.now();
let s: TestStack;
beforeAll(async () => {
  s = await startStack({ now: () => clock });
});
afterAll(async () => {
  await s?.close();
});

const vote = (client: ReturnType<TestStack["cookieJar"]>, sub: string, votes = 1, headers?: Record<string, string>) =>
  client.put(`/api/submissions/${sub}/vote`, { votes }, headers);

describe("open-link voting (evt_01, single style, 3 picks)", () => {
  let jar: ReturnType<TestStack["cookieJar"]>;
  beforeAll(() => {
    jar = s.cookieJar();
  });

  it("an anonymous device can vote, and re-voting never double-counts", async () => {
    const r = await vote(jar, "sub_01_02");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ budget: 3, spent: 1, remaining: 2, allocation: { sub_01_02: 1 } });
    expect((await vote(jar, "sub_01_02", 5)).body.allocation).toEqual({ sub_01_02: 1 });
    const me = await jar.get("/api/events/evt_01/votes/me");
    expect(me.body).toMatchObject({ mode: "open", identified: true, votingOpen: true });
  });

  it("enforces the per-voter budget atomically and allows withdrawing", async () => {
    await vote(jar, "sub_01_03");
    await vote(jar, "sub_01_04");
    const over = await vote(jar, "sub_01_06");
    expect(over.status).toBe(422);
    expect(over.body.code).toBe("BUDGET_EXCEEDED");
    const back = await vote(jar, "sub_01_04", 0);
    expect(back.body.remaining).toBe(1);
  });

  it("rejects self-votes and organizer votes", async () => {
    expect((await s.as(TOKENS.participant).put("/api/submissions/sub_01_01/vote", { votes: 1 })).body.code).toBe("OWN_TEAM");
    expect((await s.as(TOKENS.organizer).put("/api/submissions/sub_01_02/vote", { votes: 1 })).body.code).toBe("ORGANIZER_CANNOT_VOTE");
  });

  it("flags the fourth distinct device behind one IP, and keeps flagging it thereafter", async () => {
    const beforeRows = (await s.as(TOKENS.organizer).get("/api/events/evt_01/votes?status=flagged")).body as { id: string }[];
    const beforeIds = new Set(beforeRows.map((v) => v.id));
    expect((await vote(s.cookieJar(), "sub_01_07")).status).toBe(200);
    expect((await vote(s.cookieJar(), "sub_01_07")).status).toBe(200);
    // jar + 2 more = 3 voters on this IP; the next one is flagged.
    const spam = s.cookieJar();
    const r = await vote(spam, "sub_01_07", 1, { "x-forwarded-for": "203.0.113.9" });
    expect(r.status).toBe(200);
    // The same device's next vote must not slip back in as counted.
    expect((await vote(spam, "sub_01_06")).status).toBe(200);
    const flagged = (await s.as(TOKENS.organizer).get("/api/events/evt_01/votes?status=flagged")).body as { id: string; submissionId: string }[];
    const fresh = flagged.filter((v) => !beforeIds.has(v.id));
    expect(fresh.map((v) => v.submissionId).sort()).toEqual(["sub_01_06", "sub_01_07"]);
  });

  it("organizers can overturn a flag, and the decision is audited", async () => {
    const [f] = (await s.as(TOKENS.organizer).get("/api/events/evt_01/votes?status=flagged")).body;
    const r = await s.as(TOKENS.organizer).patch(`/api/votes/${f.id}`, { status: "counted", reason: "Shared office network" });
    expect(r.status).toBe(200);
    const [a] = await s.sql("SELECT summary FROM audit_log WHERE action LIKE 'vote.%' ORDER BY seq DESC LIMIT 1");
    expect(a.summary).toContain("Shared office network");
  });

  it("hides tallies from the public while voting is open", async () => {
    const pub = await s.anon.get("/api/events/evt_01/votes/summary");
    expect(pub.status).toBe(403);
    expect(pub.body.code).toBe("RESULTS_HIDDEN");
    const org = await s.as(TOKENS.organizer).get("/api/events/evt_01/votes/summary");
    expect(org.status).toBe(200);
    expect(org.body.tallies[0]).toHaveProperty("flagged");
  });

  it("closes voting on the server clock and then reveals tallies (without anti-abuse details)", async () => {
    clock += 49 * HOUR;
    expect((await vote(jar, "sub_01_05")).body.code).toBe("VOTING_CLOSED");
    const pub = await s.anon.get("/api/events/evt_01/votes/summary");
    expect(pub.status).toBe(200);
    expect(pub.body.tallies[0]).not.toHaveProperty("flagged");
    const counted = pub.body.tallies.find((t: { submissionId: string }) => t.submissionId === "sub_01_02").counted;
    expect(counted).toBeGreaterThanOrEqual(1);
  });
});

describe("email-gated quadratic voting (evt_02, 25 credits)", () => {
  let jar: ReturnType<TestStack["cookieJar"]>;
  const latestCode = async (to: string) => {
    const [row] = await s.sql("SELECT body FROM outbox WHERE to_email = $1 ORDER BY created_at DESC LIMIT 1", [to]);
    return /(\d{6})/.exec(row.body)![1]!;
  };

  it("requires a verified email before voting", async () => {
    clock = Date.now() + 3 * 24 * HOUR + HOUR; // evt_02's voting window is open
    jar = s.cookieJar();
    const r = await vote(jar, "sub_02_03", 3);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("sends a one-time code to the local outbox and verifies it", async () => {
    const req = await jar.post("/api/events/evt_02/votes/email-code", { email: "ada+one@example.org" });
    expect(req.status).toBe(202);
    const code = await latestCode("ada+one@example.org");
    const wrong = await jar.post("/api/events/evt_02/votes/verify", { email: "ada+one@example.org", code: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(401);
    const ok = await jar.post("/api/events/evt_02/votes/verify", { email: "ada+one@example.org", code });
    expect(ok.status).toBe(200);
    // Codes are stored hashed, never in clear.
    const stored = await s.sql("SELECT code_hash FROM vote_email_codes WHERE event_id = 'evt_02'");
    for (const r of stored) expect(r.code_hash).not.toContain(code);
  });

  it("charges v² credits and refuses to overspend", async () => {
    expect((await vote(jar, "sub_02_03", 3)).body).toMatchObject({ budget: 25, spent: 9, remaining: 16 });
    const over = await vote(jar, "sub_02_03", 6);
    expect(over.status).toBe(422);
    expect(over.body.details).toMatchObject({ spent: 36, budget: 25 });
    expect((await vote(jar, "sub_02_03", 5)).body).toMatchObject({ spent: 25, remaining: 0 });
  });

  it("treats +tag and case variants of an address as the same voter", async () => {
    const other = s.cookieJar();
    await other.post("/api/events/evt_02/votes/email-code", { email: "ADA+two@Example.org" });
    const code = await latestCode("ada+two@example.org");
    expect((await other.post("/api/events/evt_02/votes/verify", { email: "ADA+two@Example.org", code })).status).toBe(200);
    const me = await other.get("/api/events/evt_02/votes/me");
    expect(me.body.allocation).toEqual({ sub_02_03: 5 });
    expect(me.body.remaining).toBe(0);
  });

  it("stores only a keyed hash of the voter's email", async () => {
    const rows = await s.sql("SELECT email_hash, voter_key FROM votes WHERE event_id = 'evt_02'");
    expect(rows).toHaveLength(1);
    expect(rows[0].email_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rows)).not.toMatch(/ada|example/i);
  });
});

describe("comments", () => {
  let id: string;
  it("signed-in users comment; anonymous users cannot", async () => {
    expect((await s.anon.post("/api/submissions/sub_01_02/comments", { body: "Nice" })).status).toBe(401);
    const r = await s.as(TOKENS.participant2).post("/api/submissions/sub_01_02/comments", { body: "Loved the demo <b>!</b>" });
    expect(r.status).toBe(201);
    id = r.body.id;
    const list = await s.anon.get("/api/submissions/sub_01_02/comments");
    expect(list.body.find((c: { id: string }) => c.id === id).body).toBe("Loved the demo <b>!</b>");
  });

  it("only the author (or staff) can delete a comment", async () => {
    const r = await s.as(TOKENS.participant).del(`/api/comments/${id}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_COMMENT_AUTHOR");
    expect((await s.as(TOKENS.participant2).del(`/api/comments/${id}`)).status).toBe(204);
  });

  it("drafts cannot be commented on", async () => {
    expect((await s.as(TOKENS.participant2).post("/api/submissions/sub_02_01/comments", { body: "peek" })).status).toBe(404);
  });
});
