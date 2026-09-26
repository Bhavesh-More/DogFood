/**
 * Community voting rules (T3).
 *
 * Two styles are supported:
 *   - "single": one vote per project per voter (approval voting).
 *   - "quadratic": each voter gets a credit budget; casting v votes on one
 *     project costs v² credits. Tally = Σ v, so intensity counts but buying
 *     influence gets quadratically expensive — the defence against a single
 *     enthusiast (or a bought account) dominating a project's tally.
 */

export type VotingMode = "off" | "open" | "email" | "authenticated";
export type VotingStyle = "single" | "quadratic";

export const VOTING_MODES: readonly VotingMode[] = ["off", "open", "email", "authenticated"];
export const VOTING_STYLES: readonly VotingStyle[] = ["single", "quadratic"];

export function quadraticCost(votes: number): number {
  return votes * votes;
}

/** Credits spent by an allocation (submissionId → votes). */
export function creditsSpent(allocation: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const v of Object.values(allocation)) total += quadraticCost(v);
  return total;
}

export interface QuadraticCheck {
  ok: boolean;
  spent: number;
  remaining: number;
  reason?: string;
}

/**
 * Validate a voter's full allocation after changing one project's votes.
 * The server always recomputes this from stored rows — clients only propose.
 */
export function checkQuadraticAllocation(
  allocation: Readonly<Record<string, number>>,
  budget: number,
): QuadraticCheck {
  for (const [id, v] of Object.entries(allocation)) {
    if (!Number.isInteger(v) || v < 0) {
      return { ok: false, spent: 0, remaining: budget, reason: `Invalid vote count for ${id}` };
    }
  }
  const spent = creditsSpent(allocation);
  if (spent > budget) {
    return {
      ok: false,
      spent,
      remaining: budget - spent,
      reason: `Allocation costs ${spent} credits but the budget is ${budget}`,
    };
  }
  return { ok: true, spent, remaining: budget - spent };
}

/**
 * Deterministic per-viewer shuffle (Fisher–Yates driven by a seeded PRNG) used
 * for randomized gallery ordering during a voting window: every viewer sees a
 * different but stable order, so position bias is spread evenly.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (Math.imul(state, 31) + seed.charCodeAt(i)) >>> 0;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
