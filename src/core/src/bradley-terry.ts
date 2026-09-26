/**
 * Pairwise judging with the Bradley–Terry model.
 *
 *   P(i beats j) = p_i / (p_i + p_j)
 *
 * Strengths are fitted with Hunter's (2004) minorization–maximization update
 *
 *   p_i ← W_i / Σ_{j≠i} n_ij / (p_i + p_j)
 *
 * To keep estimates finite for items that never lost (or never won) every item
 * plays `prior` virtual wins and `prior` virtual losses against a phantom item
 * of fixed strength 1. This is equivalent to a weak Beta-style prior centred on
 * the average item and makes the fit well-defined from the first comparison.
 */

export interface Comparison {
  winnerId: string;
  loserId: string;
}

export interface BradleyTerryOptions {
  prior: number;
  maxIterations: number;
  tolerance: number;
}

export const DEFAULT_BT: BradleyTerryOptions = {
  prior: 0.5,
  maxIterations: 10_000,
  tolerance: 1e-10,
};

export interface BTItemResult {
  id: string;
  strength: number;
  /** Natural-log strength; differences are log-odds of winning. */
  score: number;
  /** P(beats an average item of strength 1). */
  winProbability: number;
  wins: number;
  losses: number;
  comparisons: number;
  rank: number;
}

export interface BTOutcome {
  items: BTItemResult[];
  iterations: number;
  converged: boolean;
}

export function fitBradleyTerry(
  itemIds: readonly string[],
  comparisons: readonly Comparison[],
  options: Partial<BradleyTerryOptions> = {},
): BTOutcome {
  const opt = { ...DEFAULT_BT, ...options };
  const ids = [...new Set(itemIds)].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  const wins = new Array<number>(n).fill(0);
  const losses = new Array<number>(n).fill(0);
  // pairCounts[i].get(j) = number of comparisons between i and j (symmetric, sparse)
  const pairCounts: Map<number, number>[] = Array.from({ length: n }, () => new Map());

  for (const c of comparisons) {
    const w = index.get(c.winnerId);
    const l = index.get(c.loserId);
    if (w === undefined || l === undefined || w === l) continue;
    wins[w]! += 1;
    losses[l]! += 1;
    pairCounts[w]!.set(l, (pairCounts[w]!.get(l) ?? 0) + 1);
    pairCounts[l]!.set(w, (pairCounts[l]!.get(w) ?? 0) + 1);
  }

  // Sparse adjacency (opponent, count): each MM step costs O(comparisons), not O(n²).
  // Sorted by opponent so the floating-point summation order is deterministic.
  const neighbours: [number, number][][] = pairCounts.map((row) => [...row.entries()].sort((a, b) => a[0] - b[0]));

  let p = new Array<number>(n).fill(1);
  let iterations = 0;
  let converged = n === 0;

  while (!converged && iterations < opt.maxIterations) {
    iterations += 1;
    const next = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const pi = p[i]!;
      let denom = 0;
      for (const [j, nij] of neighbours[i]!) denom += nij / (pi + p[j]!);
      // Phantom opponent of strength 1: `prior` wins + `prior` losses.
      denom += (2 * opt.prior) / (pi + 1);
      const numer = wins[i]! + opt.prior;
      next[i] = numer / denom;
    }
    // No rescaling: the phantom opponent (strength 1) anchors the scale, so
    // the fixed point of this update is the exact MAP estimate.
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      maxChange = Math.max(maxChange, Math.abs(next[i]! - p[i]!) / p[i]!);
    }
    p = next;
    if (maxChange < opt.tolerance) converged = true;
  }

  const items: BTItemResult[] = ids.map((id, i) => ({
    id,
    strength: p[i]!,
    score: Math.log(p[i]!),
    winProbability: p[i]! / (p[i]! + 1),
    wins: wins[i]!,
    losses: losses[i]!,
    comparisons: wins[i]! + losses[i]!,
    rank: 0,
  }));

  items.sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
  items.forEach((item, i) => {
    const prev = items[i - 1];
    item.rank = prev && Math.abs(prev.strength - item.strength) < 1e-12 ? prev.rank : i + 1;
  });

  return { items, iterations, converged };
}

/** Probability that `a` beats `b` under fitted strengths. */
export function winProbability(strengthA: number, strengthB: number): number {
  return strengthA / (strengthA + strengthB);
}

/**
 * FNV-1a 32-bit hash followed by the MurmurHash3 finalizer. Plain FNV-1a has
 * weak avalanche in its high bits for keys that differ only at the end
 * ("sub_01" vs "sub_02"), which made deterministic draws cluster; the
 * finalizer spreads every input bit across the output.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Choose the next pair for a judge.
 *
 * Preference order: pairs this judge has not compared yet → items with the
 * fewest total comparisons (information is scarcest there) → pairs whose
 * current strengths are closest (the outcome is least predictable) →
 * deterministic hash tie-break seeded by the judge id.
 */
export function selectNextPair(
  candidateIds: readonly string[],
  allComparisons: readonly Comparison[],
  judgeComparisons: readonly Comparison[],
  judgeId: string,
): [string, string] | null {
  const ids = [...new Set(candidateIds)].sort();
  if (ids.length < 2) return null;

  const seen = new Set(
    judgeComparisons.map((c) => [c.winnerId, c.loserId].sort().join("|")),
  );
  const totals = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const c of allComparisons) {
    if (totals.has(c.winnerId)) totals.set(c.winnerId, totals.get(c.winnerId)! + 1);
    if (totals.has(c.loserId)) totals.set(c.loserId, totals.get(c.loserId)! + 1);
  }
  const fit = fitBradleyTerry(ids, allComparisons);
  const strength = new Map(fit.items.map((it) => [it.id, it.score]));

  let best: { pair: [string, string]; key: number[] } | null = null;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      const pairKey = `${a}|${b}`;
      if (seen.has(pairKey)) continue;
      const key = [
        (totals.get(a) ?? 0) + (totals.get(b) ?? 0),
        Math.abs((strength.get(a) ?? 0) - (strength.get(b) ?? 0)),
        fnv1a(`${judgeId}:${pairKey}`),
      ];
      if (!best || lexLess(key, best.key)) best = { pair: [a, b], key };
    }
  }
  if (!best) return null;
  // Present in a hash-determined order so position bias does not favour ids.
  return fnv1a(`${judgeId}:order:${best.pair.join("|")}`) % 2 === 0
    ? best.pair
    : [best.pair[1], best.pair[0]];
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}
