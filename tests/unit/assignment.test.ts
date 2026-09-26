import { describe, expect, it } from "vitest";
import { planAssignments, type AssignmentJudge, type AssignmentSubmission } from "@dogfood/core";

function subs(n: number, trackId: string | null = "t1", members: string[] = []): AssignmentSubmission[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${String(i + 1).padStart(2, "0")}`, trackId, memberIds: members }));
}

function judges(n: number, trackIds: string[] | null = null): AssignmentJudge[] {
  return Array.from({ length: n }, (_, i) => ({ id: `j${i + 1}`, trackIds }));
}

describe("planAssignments", () => {
  it("gives every submission k distinct judges with perfectly balanced load", () => {
    const plan = planAssignments({
      submissions: subs(10),
      judges: judges(5),
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 3,
    });
    expect(plan.created).toHaveLength(30);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.stats).toMatchObject({ minLoad: 6, maxLoad: 6, spread: 0, totalAssignments: 30 });
    const perSub = new Map<string, Set<string>>();
    for (const a of plan.created) {
      const set = perSub.get(a.submissionId) ?? new Set();
      expect(set.has(a.judgeId)).toBe(false);
      set.add(a.judgeId);
      perSub.set(a.submissionId, set);
    }
    for (const set of perSub.values()) expect(set.size).toBe(3);
  });

  it("keeps load spread ≤ 1 when the division is uneven", () => {
    const plan = planAssignments({
      submissions: subs(7),
      judges: judges(4),
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 2,
    });
    expect(plan.stats.spread).toBeLessThanOrEqual(1);
    expect(plan.stats.totalAssignments).toBe(14);
  });

  it("respects track scopes", () => {
    const plan = planAssignments({
      submissions: [...subs(3, "web"), ...subs(3, "ai").map((s) => ({ ...s, id: `ai-${s.id}` }))],
      judges: [
        { id: "web-judge", trackIds: ["web"] },
        { id: "ai-judge", trackIds: ["ai"] },
        { id: "generalist", trackIds: null },
      ],
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 2,
    });
    for (const a of plan.created) {
      if (a.judgeId === "web-judge") expect(a.submissionId.startsWith("ai-")).toBe(false);
      if (a.judgeId === "ai-judge") expect(a.submissionId.startsWith("ai-")).toBe(true);
    }
    expect(plan.shortfalls).toEqual([]);
  });

  it("never assigns a judge to their own team or a declared conflict", () => {
    const plan = planAssignments({
      submissions: [
        { id: "mine", trackId: null, memberIds: ["j1"] },
        { id: "friend", trackId: null, memberIds: [] },
      ],
      judges: judges(3),
      existing: [],
      conflicts: [{ judgeId: "j2", submissionId: "friend" }],
      reviewsPerSubmission: 2,
    });
    expect(plan.created).not.toContainEqual({ judgeId: "j1", submissionId: "mine" });
    expect(plan.created).not.toContainEqual({ judgeId: "j2", submissionId: "friend" });
  });

  it("reports shortfalls when coverage is impossible", () => {
    const plan = planAssignments({
      submissions: [...subs(1, "t1"), { id: "orphan", trackId: "nobody", memberIds: [] }],
      judges: [{ id: "j1", trackIds: ["t1"] }],
      existing: [],
      conflicts: [],
      reviewsPerSubmission: 2,
    });
    expect(plan.shortfalls).toContainEqual({ submissionId: "orphan", needed: 2, assigned: 0, reason: "no_eligible_judges" });
    expect(plan.shortfalls).toContainEqual({ submissionId: "s01", needed: 2, assigned: 1, reason: "insufficient_judges" });
  });

  it("tops up incrementally without duplicating existing assignments", () => {
    const first = planAssignments({ submissions: subs(4), judges: judges(3), existing: [], conflicts: [], reviewsPerSubmission: 1 });
    const second = planAssignments({
      submissions: subs(4),
      judges: judges(3),
      existing: first.created,
      conflicts: [],
      reviewsPerSubmission: 2,
    });
    expect(second.created).toHaveLength(4);
    const all = new Set([...first.created, ...second.created].map((a) => `${a.judgeId}|${a.submissionId}`));
    expect(all.size).toBe(8);
  });

  it("honours a per-judge cap", () => {
    const plan = planAssignments({ submissions: subs(10), judges: judges(2), existing: [], conflicts: [], reviewsPerSubmission: 1, maxPerJudge: 3 });
    expect(plan.stats.maxLoad).toBe(3);
    expect(plan.shortfalls).toHaveLength(4);
  });

  it("is deterministic", () => {
    const input = { submissions: subs(9), judges: judges(4), existing: [], conflicts: [], reviewsPerSubmission: 2 };
    expect(planAssignments(input)).toEqual(planAssignments(input));
  });
});
