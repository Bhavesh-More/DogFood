import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/**
 * Exercises the optional AI integration with a fake sidecar, and the graceful
 * degraded behaviour when AI is off. The real service is covered by its own
 * pytest suite (src/ai/tests).
 */

function fakeAi(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const send = (obj: unknown, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      const url = (req.url ?? "").split("?")[0];
      if (url === "/health")
        return send({ device: "cpu", classifierBackend: "heuristic", generatorBackend: "heuristic", classifierModel: "heuristic-v1", summaryModel: "fake-sum", feedbackModel: "fake-fb" });
      if (url === "/v1/classify")
        return send({ results: body.projects.map((p: { id: string }) => ({ id: p.id, tags: ["ai", "security"], primaryTag: "ai", confidence: 0.8, source: "heuristic", model: "heuristic-v1" })) });
      if (url === "/v1/expertise")
        return send({ results: body.judges.map((j: { id: string }) => ({ id: j.id, tags: ["ai"], source: "heuristic", model: "heuristic-v1" })) });
      if (url === "/v1/affinity") {
        const pairs = [];
        for (const p of body.projects) for (const j of body.judges) pairs.push({ judgeId: j.id, submissionId: p.id, score: j.id < p.id ? 0.9 : 0.1 });
        return send({ pairs });
      }
      if (url === "/v1/summary") return send({ summary: `FAKE ${body.title}`, model: "fake-sum", source: "heuristic" });
      if (url === "/v1/feedback") return send({ feedback: `Draft for ${body.title}`, model: "fake-fb", source: "heuristic" });
      send({ error: "not found" }, 404);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe("AI integration (enabled)", () => {
  let stack: TestStack;
  let ai: { server: Server; url: string };

  beforeAll(async () => {
    ai = await fakeAi();
    stack = await startStack({ env: { AI_ENABLED: "true", AI_SERVICE_URL: ai.url } });
  }, 60_000);
  afterAll(async () => {
    await stack?.close();
    await new Promise<void>((r) => ai.server.close(() => r()));
  });

  it("reports the sidecar as up", async () => {
    const res = await stack.anon.get("/api/ai/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, service: "up", device: "cpu" });
  });

  it("classifies projects and judges for an event (organizer only)", async () => {
    expect((await stack.as(TOKENS.participant).post("/api/events/evt_01/ai/classify")).status).toBe(403);
    const res = await stack.as(TOKENS.organizer).post("/api/events/evt_01/ai/classify");
    expect(res.status).toBe(200);
    expect(res.body.projects).toBeGreaterThan(0);
    const rows = await stack.sql<{ n: number }>("SELECT count(*)::int AS n FROM project_classifications WHERE event_id = 'evt_01'");
    expect(rows[0]!.n).toBeGreaterThan(0);
  });

  it("returns the affinity matrix for the organizer", async () => {
    const res = await stack.as(TOKENS.organizer).get("/api/events/evt_01/ai/matrix");
    expect(res.status).toBe(200);
    expect(res.body.projects.length).toBeGreaterThan(0);
    expect(res.body.judges.length).toBeGreaterThan(0);
    expect(res.body.pairs.length).toBeGreaterThan(0);
  });

  it("generates and caches a public project summary", async () => {
    const first = await stack.anon.get("/api/ai/submissions/sub_03_01/summary");
    expect(first.status).toBe(200);
    expect(first.body.summary).toContain("FAKE");
    const second = await stack.anon.get("/api/ai/submissions/sub_03_01/summary");
    expect(second.body.summary).toBe(first.body.summary);
    const rows = await stack.sql<{ n: number }>("SELECT count(*)::int AS n FROM project_summaries WHERE submission_id = 'sub_03_01'");
    expect(rows[0]!.n).toBe(1);
  });

  it("drafts feedback for the judge's own assignment only", async () => {
    const rows = await stack.sql<{ id: string }>("SELECT id FROM assignments WHERE judge_id = 'usr_judge_a' AND event_id = 'evt_01' LIMIT 1");
    const assignmentId = rows[0]!.id;
    const mine = await stack.as(TOKENS.judgeA).post(`/api/judge/assignments/${assignmentId}/ai/feedback`, {});
    expect(mine.status).toBe(200);
    expect(mine.body.draft).toContain("Draft");
    const other = await stack.as(TOKENS.judgeB).post(`/api/judge/assignments/${assignmentId}/ai/feedback`, {});
    expect(other.status).toBe(404); // RLS hides another judge's assignment
  });

  it("uses AI affinity only as a tie-break, never weakening constraints", async () => {
    const before = await stack.sql<{ id: string }>("SELECT id FROM assignments WHERE event_id = 'evt_01'");
    const conflicts = await stack.sql<{ judge_id: string; submission_id: string }>("SELECT judge_id, submission_id FROM conflicts WHERE event_id = 'evt_01'");
    const res = await stack.as(TOKENS.organizer).post("/api/events/evt_01/assignments/auto", { dryRun: true });
    expect(res.status).toBe(200);
    const conflictKeys = new Set(conflicts.map((c) => `${c.judge_id}:${c.submission_id}`));
    for (const a of res.body.created as { judgeId: string; submissionId: string }[]) {
      expect(conflictKeys.has(`${a.judgeId}:${a.submissionId}`)).toBe(false);
    }
    // dry run: nothing written, and every existing assignment is kept
    const after = await stack.sql<{ id: string }>("SELECT id FROM assignments WHERE event_id = 'evt_01'");
    expect(after.length).toBe(before.length);
  });
});

describe("AI integration (disabled)", () => {
  let stack: TestStack;
  beforeAll(async () => {
    stack = await startStack();
  }, 60_000);
  afterAll(async () => {
    await stack?.close();
  });

  it("reports disabled and degrades every route", async () => {
    expect((await stack.anon.get("/api/ai/status")).body).toMatchObject({ enabled: false, service: "disabled" });
    expect((await stack.as(TOKENS.organizer).post("/api/events/evt_01/ai/classify")).status).toBe(503);
    const summary = await stack.anon.get("/api/ai/submissions/sub_03_01/summary");
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ enabled: false, summary: null });
  });
});
