import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/**
 * Judge isolation must follow the submission's state, not just the assignment:
 * withdrawing (unsubmit) or ruling a project ineligible hides it from every
 * judge read/score path, and a submitted ballot cannot be deleted out from
 * under a judge.
 */
let s: TestStack;
let judge: string;
let owner: string;
let asg: string;
const EVENT = "evt_02";
const SUB = "sub_02_03"; // seeded submitted project, team owner usr_p37

beforeAll(async () => {
  s = await startStack();
  judge = await s.tokenFor("usr_judge_a");
  owner = await s.tokenFor("usr_p37");
});
afterAll(async () => {
  await s?.close();
});

describe("judge isolation follows submission state", () => {
  it("hides a withdrawn draft from the queue, the detail and the ballot", async () => {
    const created = await s.as(TOKENS.organizer).post(`/api/events/${EVENT}/assignments`, {
      judgeId: "usr_judge_a",
      submissionId: SUB,
    });
    expect(created.status).toBe(201);
    asg = created.body.id as string;
    expect((await s.as(judge).get(`/api/judge/assignments/${asg}`)).status).toBe(200);
    expect((await s.as(owner).post(`/api/submissions/${SUB}/unsubmit`)).status).toBe(200);
    const queue = await s.as(judge).get(`/api/judge/events/${EVENT}/assignments`);
    expect(queue.body.some((a: { id: string }) => a.id === asg)).toBe(false);
    expect((await s.as(judge).get(`/api/judge/assignments/${asg}`)).status).toBe(404);
    const ballot = await s.as(judge).put(`/api/judge/assignments/${asg}/ballot`, { scores: {}, submit: false });
    expect(ballot.status).toBe(409);
    expect(ballot.body.code).toBe("NOT_SUBMITTED");
    // Put it back so the next test has a submitted project.
    expect((await s.as(owner).post(`/api/submissions/${SUB}/submit`)).status).toBe(200);
  });

  it("hides an ineligible project even after a ballot was submitted", async () => {
    const detail = await s.as(judge).get(`/api/judge/assignments/${asg}`);
    expect(detail.status).toBe(200);
    const scores = Object.fromEntries((detail.body.criteria as { id: string; maxScore: number }[]).map((c) => [c.id, c.maxScore]));
    expect((await s.as(judge).put(`/api/judge/assignments/${asg}/ballot`, { scores, submit: true })).status).toBe(200);
    expect((await s.as(TOKENS.organizer).patch(`/api/submissions/${SUB}/eligibility`, { eligibility: "ineligible", note: "Rules breach" })).status).toBe(200);
    const queue = await s.as(judge).get(`/api/judge/events/${EVENT}/assignments`);
    expect(queue.body.some((a: { id: string }) => a.id === asg)).toBe(false);
    expect((await s.as(judge).get(`/api/judge/assignments/${asg}`)).status).toBe(404);
    expect((await s.as(judge).put(`/api/judge/assignments/${asg}/ballot`, { scores, submit: false })).body.code).toBe("INELIGIBLE");
  });

  it("refuses to delete an assignment whose ballot was submitted", async () => {
    const [row] = await s.sql<{ status: string }>("SELECT status FROM assignments WHERE id = $1", [asg]);
    expect(row?.status).toBe("submitted");
    const del = await s.as(TOKENS.organizer).del(`/api/events/${EVENT}/assignments/${asg}`);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe("HAS_BALLOTS");
    const [still] = await s.sql("SELECT 1 AS ok FROM assignments WHERE id = $1", [asg]);
    expect(still?.ok).toBe(1);
  });
});
