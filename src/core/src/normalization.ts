/**
 * Cross-judge score normalization.
 *
 * Pipeline (see JUDGING.md for the proofs):
 *   1. A ballot's criterion scores are combined into a weighted raw total
 *      S_ij on a 0–100 scale:  S = 100 · Σ_c w_c · (s_c / max_c) / Σ_c w_c
 *   2. For every judge j we compute N_j, μ_j and the population σ_j of their
 *      raw totals.
 *   3. If N_j ≥ minSampleSize (default 5) the judge is Z-scored:
 *          Z_ij = (S_ij − μ_j) / (σ_j + ε)
 *      otherwise we fall back to Min-Max scaling:
 *          x_ij = (S_ij − min_j) / ((max_j − min_j) + ε)        (x = ½ if max = min)
 *      and map x onto the Z scale of a uniform distribution with unit
 *      variance:  Z_ij = (2x − 1) · √3
 *   4. Every Z is rescaled to the target distribution:
 *          N_ij = μ_target + Z_ij · σ_target
 *   5. A project's final score is the mean of its N_ij across judges; ties are
 *      broken by raw mean, then judge count, then id (fully deterministic).
 */

export interface NormalizationConfig {
  targetMean: number;
  targetSd: number;
  /** Judges with fewer than this many ballots use the Min-Max fallback. */
  minSampleSize: number;
  epsilon: number;
}

export const DEFAULT_NORMALIZATION: NormalizationConfig = {
  targetMean: 70,
  targetSd: 15,
  minSampleSize: 5,
  epsilon: 1e-6,
};

export interface CriterionSpec {
  id: string;
  weight: number;
  maxScore: number;
}

export type NormalizationMethod = "z_score" | "min_max";

export interface RawEntry {
  judgeId: string;
  submissionId: string;
  /** Weighted raw total on a 0–100 scale. */
  raw: number;
}

export interface JudgeStat {
  judgeId: string;
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  method: NormalizationMethod;
  /** μ_j − global mean of all raw totals: positive = lenient, negative = strict. */
  bias: number;
}

export interface NormalizedEntry extends RawEntry {
  z: number;
  normalized: number;
  method: NormalizationMethod;
}

export interface SubmissionResult {
  submissionId: string;
  judgeCount: number;
  rawMean: number;
  zMean: number;
  normalizedMean: number;
  /** Spread of normalized scores across judges (disagreement indicator). */
  normalizedSd: number;
  rank: number;
  rawRank: number;
}

export interface NormalizationOutcome {
  config: NormalizationConfig;
  globalMean: number;
  judges: JudgeStat[];
  entries: NormalizedEntry[];
  results: SubmissionResult[];
}

const SQRT3 = Math.sqrt(3);

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation (divides by N, matching the spec formula). */
export function populationSd(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / values.length);
}

/**
 * Weighted raw total on a 0–100 scale. Throws if a criterion is missing, so an
 * incomplete ballot can never silently count as zero.
 */
export function weightedTotal(
  scores: Readonly<Record<string, number>>,
  criteria: readonly CriterionSpec[],
): number {
  if (criteria.length === 0) throw new Error("Rubric has no criteria");
  let weightSum = 0;
  let acc = 0;
  for (const c of criteria) {
    if (!(c.weight > 0)) throw new Error(`Criterion ${c.id} has non-positive weight`);
    if (!(c.maxScore > 0)) throw new Error(`Criterion ${c.id} has non-positive max score`);
    const value = scores[c.id];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`Missing score for criterion ${c.id}`);
    }
    const ratio = Math.min(1, Math.max(0, value / c.maxScore));
    acc += c.weight * ratio;
    weightSum += c.weight;
  }
  return (100 * acc) / weightSum;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalize(
  entries: readonly RawEntry[],
  config: Partial<NormalizationConfig> = {},
): NormalizationOutcome {
  const cfg: NormalizationConfig = { ...DEFAULT_NORMALIZATION, ...config };
  if (!(cfg.epsilon > 0)) throw new Error("epsilon must be positive");
  if (!(cfg.targetSd >= 0)) throw new Error("targetSd must be non-negative");
  if (!(cfg.minSampleSize >= 1)) throw new Error("minSampleSize must be at least 1");

  for (const e of entries) {
    if (!Number.isFinite(e.raw)) throw new Error(`Non-finite raw score for ${e.submissionId}`);
  }

  const globalMean = mean(entries.map((e) => e.raw));
  const byJudge = groupBy(entries, (e) => e.judgeId);
  const judges: JudgeStat[] = [];
  const normalized: NormalizedEntry[] = [];

  for (const judgeId of [...byJudge.keys()].sort(compareIds)) {
    const list = byJudge.get(judgeId) ?? [];
    const values = list.map((e) => e.raw);
    const n = values.length;
    const mu = mean(values);
    const sd = populationSd(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const method: NormalizationMethod = n >= cfg.minSampleSize ? "z_score" : "min_max";
    judges.push({ judgeId, n, mean: mu, sd, min, max, method, bias: mu - globalMean });

    for (const e of list) {
      let z: number;
      if (method === "z_score") {
        z = (e.raw - mu) / (sd + cfg.epsilon);
      } else {
        const range = max - min;
        const x = range === 0 ? 0.5 : (e.raw - min) / (range + cfg.epsilon);
        z = (2 * x - 1) * SQRT3;
      }
      normalized.push({
        ...e,
        z,
        normalized: cfg.targetMean + z * cfg.targetSd,
        method,
      });
    }
  }

  return {
    config: cfg,
    globalMean,
    judges,
    entries: normalized,
    results: aggregate(normalized),
  };
}

/** Aggregate per-judge normalized entries into ranked per-submission results. */
export function aggregate(entries: readonly NormalizedEntry[]): SubmissionResult[] {
  const bySubmission = groupBy(entries, (e) => e.submissionId);
  const rows = [...bySubmission.entries()].map(([submissionId, list]) => {
    const norms = list.map((e) => e.normalized);
    return {
      submissionId,
      judgeCount: list.length,
      rawMean: mean(list.map((e) => e.raw)),
      zMean: mean(list.map((e) => e.z)),
      normalizedMean: mean(norms),
      normalizedSd: populationSd(norms),
      rank: 0,
      rawRank: 0,
    };
  });

  const TOL = 1e-9;
  const byNormalized = [...rows].sort(
    (a, b) =>
      b.normalizedMean - a.normalizedMean ||
      b.rawMean - a.rawMean ||
      b.judgeCount - a.judgeCount ||
      compareIds(a.submissionId, b.submissionId),
  );
  // Standard competition ranking ("1224"): exact ties on both score keys share a rank.
  byNormalized.forEach((row, i) => {
    const prev = byNormalized[i - 1];
    row.rank =
      prev &&
      Math.abs(prev.normalizedMean - row.normalizedMean) < TOL &&
      Math.abs(prev.rawMean - row.rawMean) < TOL
        ? prev.rank
        : i + 1;
  });

  const byRaw = [...rows].sort(
    (a, b) => b.rawMean - a.rawMean || compareIds(a.submissionId, b.submissionId),
  );
  byRaw.forEach((row, i) => {
    const prev = byRaw[i - 1];
    row.rawRank = prev && Math.abs(prev.rawMean - row.rawMean) < TOL ? prev.rawRank : i + 1;
  });

  return byNormalized;
}

/** Clamp a normalized score into the displayable 0–100 band. */
export function displayScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

/**
 * Spearman rank correlation between two rankings of the same items.
 * Used by the Normalization Lab to show how much the ordering changed.
 */
export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("Rank vectors must have equal length");
  const n = a.length;
  if (n < 2) return 1;
  const ra = mean(a);
  const rb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] ?? 0) - ra;
    const y = (b[i] ?? 0) - rb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return 1;
  return num / Math.sqrt(da * db);
}

export interface InvariantCheck {
  judgeId: string;
  method: NormalizationMethod;
  normalizedMean: number;
  normalizedSd: number;
  expectedMean: number;
  expectedSd: number;
  holds: boolean;
}

/**
 * Live proof helper: for every Z-scored judge the normalized scores must have
 * mean μ_target and standard deviation σ_target · σ_j/(σ_j + ε) (→ σ_target).
 */
export function checkInvariants(outcome: NormalizationOutcome, tolerance = 1e-6): InvariantCheck[] {
  const { config } = outcome;
  const byJudge = groupBy(outcome.entries, (e) => e.judgeId);
  return outcome.judges.map((j) => {
    const values = (byJudge.get(j.judgeId) ?? []).map((e) => e.normalized);
    const m = mean(values);
    const sd = populationSd(values);
    const expectedMean = config.targetMean;
    const expectedSd =
      j.method === "z_score"
        ? (config.targetSd * j.sd) / (j.sd + config.epsilon)
        : Number.NaN;
    const holds =
      j.method === "z_score"
        ? Math.abs(m - expectedMean) <= tolerance * Math.max(1, config.targetMean) &&
          Math.abs(sd - expectedSd) <= tolerance * Math.max(1, config.targetSd)
        : true;
    return {
      judgeId: j.judgeId,
      method: j.method,
      normalizedMean: m,
      normalizedSd: sd,
      expectedMean,
      expectedSd,
      holds,
    };
  });
}
