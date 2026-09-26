import { describe, expect, it } from "vitest";
import { planAssignments, type AssignmentJudge, type AssignmentSubmission } from "@dogfood/core";

const submissions: AssignmentSubmission[] = [
  { id: "s1", trackId: "t1", memberIds: [] },
  { id: "s2", trackId: "t1", memberIds: [] },
];
const judges: AssignmentJudge[] = [
  { id: "j1", trackIds: null },
  { id: "j2", trackIds: null },
];

describe("planAssignments AI affinity tie-break", () => {
  it("is a no-op when no affinity is supplied (behaviour unchanged)", () => {
    const base = planAssignments({ submissions, judges, existing: [], conflicts: [], reviewsPerSubmission: 1 });
    const zero = planAssignments({
      submissions,
      judges,
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 1,
      affinity: () => 0,
    });
    expect(zero).toEqual(base);
  });

  it("picks the higher-affinity judge when loads tie", () => {
    const plan = planAssignments({
      submissions: [submissions[0]!],
      judges,
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 1,
      affinity: (j) => (j === "j2" ? 0.9 : 0.1),
    });
    expect(plan.created).toEqual([{ judgeId: "j2", submissionId: "s1" }]);
  });

  it("never overrides load balancing", () => {
    const plan = planAssignments({
      submissions,
      judges,
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 1,
      // j1 is always preferred, but after taking s1 it is loaded, so s2 goes to j2.
      affinity: (j) => (j === "j1" ? 1 : 0),
    });
    const byJudge = new Map<string, string[]>();
    for (const a of plan.created) byJudge.set(a.judgeId, [...(byJudge.get(a.judgeId) ?? []), a.submissionId]);
    expect(byJudge.get("j1")).toEqual(["s1"]);
    expect(byJudge.get("j2")).toEqual(["s2"]);
    expect(plan.stats.spread).toBe(0);
  });

  it("still excludes conflicts and out-of-scope judges", () => {
    const scoped: AssignmentJudge[] = [{ id: "j1", trackIds: ["t2"] }, { id: "j2", trackIds: ["t1"] }];
    const plan = planAssignments({
      submissions: [submissions[0]!],
      judges: scoped,
      existing: [],
      conflicts: [{ judgeId: "j2", submissionId: "s1" }],
      reviewsPerSubmission: 1,
      affinity: () => 1, // would prefer everyone if constraints were ignored
    });
    expect(plan.created).toEqual([]);
    expect(plan.shortfalls[0]).toMatchObject({ submissionId: "s1", reason: "no_eligible_judges" });
  });

  it("is deterministic for the same affinity function", () => {
    const run = () =>
      planAssignments({
        submissions,
        judges,
        existing: [],
        conflicts: [],
        reviewsPerSubmission: 1,
        affinity: (j, s) => (s === "s1" ? 0.5 : 0.5) + (j === "j1" ? 0.2 : 0),
      });
    expect(run()).toEqual(run());
  });
});
