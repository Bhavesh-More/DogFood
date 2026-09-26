import { fnv1a } from "./bradley-terry";

/**
 * Algorithmic judge assignment with workload balancing.
 *
 * Goal: give every eligible submission `reviewsPerSubmission` distinct judges
 * such that
 *   - a judge only receives submissions from tracks inside their scope,
 *   - a judge never reviews a team they belong to or a declared conflict,
 *   - the per-judge load is as even as possible (max − min ≤ 1 whenever the
 *     scope/conflict constraints allow it),
 *   - the result is deterministic for the same input (auditable, testable).
 *
 * Strategy: "most-constrained submission first, least-loaded judge first".
 * Submissions with the fewest eligible judges are placed first so that scarce
 * judges are not used up by easy submissions; within a submission the judges
 * with the lowest current load win, ties broken by a stable hash of
 * (judge, submission) so that the same judges are not always paired together.
 */

export interface AssignmentSubmission {
  id: string;
  trackId: string | null;
  /** User ids of the submitting team — these judges are conflicted. */
  memberIds: readonly string[];
}

export interface AssignmentJudge {
  id: string;
  /** `null` = may judge every track of the event. */
  trackIds: readonly string[] | null;
}

export interface AssignmentPair {
  judgeId: string;
  submissionId: string;
}

export interface AssignmentInput {
  submissions: readonly AssignmentSubmission[];
  judges: readonly AssignmentJudge[];
  existing: readonly AssignmentPair[];
  conflicts: readonly AssignmentPair[];
  reviewsPerSubmission: number;
  /** Optional hard cap on assignments per judge. */
  maxPerJudge?: number;
  /**
   * Optional AI/expertise affinity in [0, 1]. Used only as a tie-break between
   * judges that already have the same load, so the hard guarantees (scope,
   * conflicts, balance, determinism) are never weakened. Higher wins.
   */
  affinity?: (judgeId: string, submissionId: string) => number;
}

export interface AssignmentShortfall {
  submissionId: string;
  needed: number;
  assigned: number;
  reason: "no_eligible_judges" | "insufficient_judges";
}

export interface AssignmentPlan {
  created: AssignmentPair[];
  loads: Record<string, number>;
  shortfalls: AssignmentShortfall[];
  stats: { minLoad: number; maxLoad: number; spread: number; totalAssignments: number };
}

export function judgeCanSee(judge: AssignmentJudge, trackId: string | null): boolean {
  if (judge.trackIds === null) return true;
  return trackId !== null && judge.trackIds.includes(trackId);
}

export function planAssignments(input: AssignmentInput): AssignmentPlan {
  const k = Math.max(1, Math.floor(input.reviewsPerSubmission));
  const cap = input.maxPerJudge ?? Number.POSITIVE_INFINITY;
  const judges = [...input.judges].sort((a, b) => (a.id < b.id ? -1 : 1));

  const loads = new Map<string, number>(judges.map((j) => [j.id, 0]));
  const assigned = new Set<string>();
  const perSubmission = new Map<string, number>();
  const key = (judgeId: string, submissionId: string) => `${judgeId}\u0000${submissionId}`;

  for (const a of input.existing) {
    assigned.add(key(a.judgeId, a.submissionId));
    if (loads.has(a.judgeId)) loads.set(a.judgeId, loads.get(a.judgeId)! + 1);
    perSubmission.set(a.submissionId, (perSubmission.get(a.submissionId) ?? 0) + 1);
  }
  const conflicts = new Set(input.conflicts.map((c) => key(c.judgeId, c.submissionId)));

  const eligibleJudges = (s: AssignmentSubmission) =>
    judges.filter(
      (j) =>
        judgeCanSee(j, s.trackId) &&
        !s.memberIds.includes(j.id) &&
        !conflicts.has(key(j.id, s.id)),
    );

  // Eligible pools computed once (not inside the sort comparator).
  const eligible = new Map(input.submissions.map((sub) => [sub.id, eligibleJudges(sub)]));
  const ordered = [...input.submissions].sort((a, b) => {
    const ea = eligible.get(a.id)!.length;
    const eb = eligible.get(b.id)!.length;
    return ea - eb || (a.id < b.id ? -1 : 1);
  });

  const created: AssignmentPair[] = [];
  const shortfalls: AssignmentShortfall[] = [];

  for (const s of ordered) {
    const have = perSubmission.get(s.id) ?? 0;
    let need = k - have;
    if (need <= 0) continue;
    // Least-loaded first; ties broken by a stable per-(judge, submission) hash, computed once.
    const pool = eligible
      .get(s.id)!
      .filter((j) => !assigned.has(key(j.id, s.id)) && (loads.get(j.id) ?? 0) < cap)
      .map((j) => ({ j, load: loads.get(j.id) ?? 0, aff: input.affinity?.(j.id, s.id) ?? 0, h: fnv1a(`${j.id}:${s.id}`) }))
      .sort((a, b) => a.load - b.load || b.aff - a.aff || a.h - b.h || (a.j.id < b.j.id ? -1 : 1))
      .map((x) => x.j);
    for (const j of pool) {
      if (need <= 0) break;
      created.push({ judgeId: j.id, submissionId: s.id });
      assigned.add(key(j.id, s.id));
      loads.set(j.id, (loads.get(j.id) ?? 0) + 1);
      perSubmission.set(s.id, (perSubmission.get(s.id) ?? 0) + 1);
      need -= 1;
    }
    if (need > 0) {
      const eligibleCount = eligible.get(s.id)!.length;
      shortfalls.push({
        submissionId: s.id,
        needed: k,
        assigned: k - need,
        reason: eligibleCount === 0 ? "no_eligible_judges" : "insufficient_judges",
      });
    }
  }

  const loadValues = [...loads.values()];
  const minLoad = loadValues.length ? Math.min(...loadValues) : 0;
  const maxLoad = loadValues.length ? Math.max(...loadValues) : 0;
  return {
    created,
    loads: Object.fromEntries(loads),
    shortfalls,
    stats: {
      minLoad,
      maxLoad,
      spread: maxLoad - minLoad,
      totalAssignments: loadValues.reduce((a, b) => a + b, 0),
    },
  };
}
