import { describe, expect, it } from "vitest";
import {
  DEFAULT_NORMALIZATION,
  checkInvariants,
  displayScore,
  mean,
  normalize,
  populationSd,
  spearman,
  weightedTotal,
  type RawEntry,
} from "@dogfood/core";

const EPS = DEFAULT_NORMALIZATION.epsilon;

function entries(judgeId: string, raws: number[], prefix = "s"): RawEntry[] {
  return raws.map((raw, i) => ({ judgeId, submissionId: `${prefix}${i + 1}`, raw }));
}

describe("weightedTotal", () => {
  const criteria = [
    { id: "impact", weight: 0.4, maxScore: 10 },
    { id: "code", weight: 0.35, maxScore: 10 },
    { id: "ux", weight: 0.25, maxScore: 5 },
  ];

  it("combines criteria on a 0–100 scale using weights", () => {
    expect(weightedTotal({ impact: 10, code: 10, ux: 5 }, criteria)).toBeCloseTo(100);
    expect(weightedTotal({ impact: 0, code: 0, ux: 0 }, criteria)).toBeCloseTo(0);
    // 0.4·0.5 + 0.35·1 + 0.25·0.2 = 0.6
    expect(weightedTotal({ impact: 5, code: 10, ux: 1 }, criteria)).toBeCloseTo(60);
  });

  it("is invariant to the absolute scale of the weights", () => {
    const scaled = criteria.map((c) => ({ ...c, weight: c.weight * 40 }));
    const scores = { impact: 7, code: 3, ux: 4 };
    expect(weightedTotal(scores, scaled)).toBeCloseTo(weightedTotal(scores, criteria));
  });

  it("clamps out-of-range criterion scores", () => {
    expect(weightedTotal({ impact: 99, code: -4, ux: 5 }, criteria)).toBeCloseTo(40 + 0 + 25);
  });

  it("rejects incomplete ballots instead of treating them as zero", () => {
    expect(() => weightedTotal({ impact: 5, code: 5 }, criteria)).toThrow(/Missing score/);
  });

  it("rejects empty rubrics and non-positive weights", () => {
    expect(() => weightedTotal({}, [])).toThrow(/no criteria/);
    expect(() => weightedTotal({ a: 1 }, [{ id: "a", weight: 0, maxScore: 10 }])).toThrow(
      /non-positive weight/,
    );
  });
});

describe("descriptive statistics", () => {
  it("uses the population standard deviation", () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(populationSd([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(populationSd([])).toBe(0);
  });
});

describe("normalize — Z-score path (N_j ≥ 5)", () => {
  it("matches the spec formula exactly", () => {
    const raws = [50, 60, 70, 80, 90];
    const out = normalize(entries("j1", raws));
    const mu = 70;
    const sd = Math.sqrt(200);
    for (const e of out.entries) {
      const z = (e.raw - mu) / (sd + EPS);
      expect(e.method).toBe("z_score");
      expect(e.z).toBeCloseTo(z, 12);
      expect(e.normalized).toBeCloseTo(70 + 15 * z, 10);
    }
    expect(out.judges[0]).toMatchObject({ n: 5, mean: 70, method: "z_score" });
  });

  it("gives every Z-scored judge mean μ_target and sd σ_target (live invariant)", () => {
    const out = normalize([
      ...entries("strict", [20, 25, 30, 35, 40, 45]),
      ...entries("lenient", [80, 85, 88, 90, 95, 99]),
    ]);
    const checks = checkInvariants(out);
    expect(checks).toHaveLength(2);
    for (const c of checks) {
      expect(c.holds).toBe(true);
      expect(c.normalizedMean).toBeCloseTo(70, 9);
      expect(c.normalizedSd).toBeCloseTo(15, 5);
    }
  });

  it("removes affine judge bias: a strict and a lenient judge agree after normalization", () => {
    // True quality of 6 projects; judge A is strict/compressed, judge B lenient/stretched.
    const quality = [3, 9, 5, 7, 1, 6];
    const a = quality.map((q) => 20 + 2 * q);
    const b = quality.map((q) => 55 + 4.5 * q);
    const out = normalize([...entries("A", a), ...entries("B", b)]);
    const byKey = new Map(out.entries.map((e) => [`${e.judgeId}:${e.submissionId}`, e]));
    for (let i = 1; i <= quality.length; i++) {
      const na = byKey.get(`A:s${i}`)!.normalized;
      const nb = byKey.get(`B:s${i}`)!.normalized;
      expect(na).toBeCloseTo(nb, 4);
    }
    // Ranking follows true quality.
    const order = out.results.map((r) => r.submissionId);
    expect(order).toEqual(["s2", "s4", "s6", "s3", "s1", "s5"]);
  });

  it("fixes a raw-average ranking that is distorted by who judged what", () => {
    // P1 is the best project a harsh judge saw; P2 is the weakest project a
    // generous judge saw. Raw averages invert that relationship.
    const harsh = [
      { judgeId: "harsh", submissionId: "P1", raw: 60 },
      ...entries("harsh", [30, 35, 40, 45], "h"),
    ];
    const generous = [
      { judgeId: "generous", submissionId: "P2", raw: 92 },
      ...entries("generous", [95, 96, 97, 98], "g"),
    ];
    const out = normalize([...harsh, ...generous]);
    const p1 = out.results.find((r) => r.submissionId === "P1")!;
    const p2 = out.results.find((r) => r.submissionId === "P2")!;
    expect(p1.rawMean).toBeLessThan(p2.rawMean); // raw average says P2 is better…
    expect(p1.normalizedMean).toBeGreaterThan(p2.normalizedMean); // …normalization disagrees.
    expect(p1.rank).toBeLessThan(p2.rank);
    expect(p1.rawRank).toBeGreaterThan(p2.rawRank);
  });

  it("handles zero variance with ε: identical scores map to μ_target, no NaN", () => {
    const out = normalize(entries("flat", [77, 77, 77, 77, 77, 77]));
    for (const e of out.entries) {
      expect(Number.isFinite(e.z)).toBe(true);
      expect(e.z).toBe(0);
      expect(e.normalized).toBe(70);
    }
  });
});

describe("normalize — Min-Max fallback (N_j < 5)", () => {
  it("switches method below the sample threshold", () => {
    const out = normalize(entries("j", [40, 60, 80]));
    expect(out.judges[0]!.method).toBe("min_max");
    const [lo, mid, hi] = out.entries;
    // x = (S − min)/((max − min) + ε);  Z = (2x − 1)·√3
    const x = (s: number) => (s - 40) / (40 + EPS);
    expect(lo!.z).toBeCloseTo((2 * x(40) - 1) * Math.sqrt(3), 9);
    expect(mid!.z).toBeCloseTo((2 * x(60) - 1) * Math.sqrt(3), 9);
    expect(hi!.z).toBeCloseTo((2 * x(80) - 1) * Math.sqrt(3), 9);
    expect(mid!.normalized).toBeCloseTo(70, 4);
  });

  it("keeps a single-ballot judge neutral instead of scoring them 0", () => {
    const out = normalize([{ judgeId: "solo", submissionId: "x", raw: 91 }]);
    expect(out.entries[0]!.method).toBe("min_max");
    expect(out.entries[0]!.normalized).toBe(70);
  });

  it("respects a configurable threshold", () => {
    const out = normalize(entries("j", [10, 20, 30]), { minSampleSize: 3 });
    expect(out.judges[0]!.method).toBe("z_score");
  });
});

describe("aggregate and ranking", () => {
  it("averages normalized scores across judges and ranks deterministically", () => {
    const out = normalize([
      ...entries("a", [50, 60, 70, 80, 90]),
      ...entries("b", [55, 65, 75, 85, 95]),
    ]);
    expect(out.results.map((r) => r.submissionId)).toEqual(["s5", "s4", "s3", "s2", "s1"]);
    expect(out.results.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(out.results[0]!.judgeCount).toBe(2);
  });

  it("gives exact ties the same competition rank", () => {
    const out = normalize([
      { judgeId: "a", submissionId: "x", raw: 70 },
      { judgeId: "a", submissionId: "y", raw: 70 },
      { judgeId: "a", submissionId: "z", raw: 10 },
    ]);
    const ranks = Object.fromEntries(out.results.map((r) => [r.submissionId, r.rank]));
    expect(ranks).toEqual({ x: 1, y: 1, z: 3 });
  });

  it("is independent of input order", () => {
    const base = [...entries("a", [12, 40, 33, 90, 71, 55]), ...entries("b", [80, 82, 85, 90])];
    const shuffled = [...base].reverse();
    expect(normalize(shuffled).results).toEqual(normalize(base).results);
  });

  it("rejects non-finite input", () => {
    expect(() => normalize([{ judgeId: "a", submissionId: "x", raw: Number.NaN }])).toThrow();
  });
});

describe("helpers", () => {
  it("clamps display scores into 0–100", () => {
    expect(displayScore(104.2)).toBe(100);
    expect(displayScore(-3)).toBe(0);
    expect(displayScore(71.2345)).toBe(71.23);
  });

  it("computes Spearman correlation of rank vectors", () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
});
