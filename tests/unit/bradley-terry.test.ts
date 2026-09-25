import { describe, expect, it } from "vitest";
import { fitBradleyTerry, fnv1a, selectNextPair, winProbability, type Comparison } from "@dogfood/core";

function beats(winnerId: string, loserId: string, times = 1): Comparison[] {
  return Array.from({ length: times }, () => ({ winnerId, loserId }));
}

describe("fitBradleyTerry", () => {
  it("returns neutral strengths with no data", () => {
    const out = fitBradleyTerry(["a", "b", "c"], []);
    for (const item of out.items) expect(item.strength).toBeCloseTo(1, 9);
    expect(out.converged).toBe(true);
  });

  it("recovers a transitive order", () => {
    const comparisons = [
      ...beats("a", "b", 4),
      ...beats("b", "c", 4),
      ...beats("a", "c", 4),
      ...beats("b", "a", 1),
    ];
    const out = fitBradleyTerry(["a", "b", "c"], comparisons);
    expect(out.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(out.items.map((i) => i.rank)).toEqual([1, 2, 3]);
    expect(out.converged).toBe(true);
  });

  it("stays finite for an undefeated item thanks to the prior", () => {
    const out = fitBradleyTerry(["a", "b"], beats("a", "b", 10));
    const [a, b] = out.items;
    expect(Number.isFinite(a!.strength)).toBe(true);
    expect(a!.strength).toBeGreaterThan(b!.strength);
    expect(winProbability(a!.strength, b!.strength)).toBeGreaterThan(0.8);
  });

  it("satisfies the MLE balance condition (expected wins = observed wins incl. prior)", () => {
    const comparisons = [...beats("a", "b", 3), ...beats("b", "a", 1), ...beats("b", "c", 2), ...beats("c", "a", 1)];
    const out = fitBradleyTerry(["a", "b", "c"], comparisons, { prior: 0.5, tolerance: 1e-13 });
    const p = new Map(out.items.map((i) => [i.id, i.strength]));
    const pair = new Map<string, number>();
    for (const c of comparisons) {
      const k = [c.winnerId, c.loserId].sort().join("|");
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
    for (const item of out.items) {
      let expected = 0;
      for (const [k, n] of pair) {
        const [x, y] = k.split("|") as [string, string];
        if (x === item.id) expected += (n * p.get(x)!) / (p.get(x)! + p.get(y)!);
        if (y === item.id) expected += (n * p.get(y)!) / (p.get(x)! + p.get(y)!);
      }
      expected += (2 * 0.5 * item.strength) / (item.strength + 1); // phantom games
      expect(expected).toBeCloseTo(item.wins + 0.5, 6);
    }
  });

  it("anchors the scale to the phantom average item (mirror-symmetric data → reciprocal strengths)", () => {
    const out = fitBradleyTerry(["a", "b"], beats("a", "b", 3), { tolerance: 1e-13 });
    const [a, b] = out.items;
    expect(a!.strength * b!.strength).toBeCloseTo(1, 9);
    expect(a!.winProbability + b!.winProbability).toBeCloseTo(1, 9);
  });

  it("ignores self-comparisons and unknown ids", () => {
    const out = fitBradleyTerry(["a", "b"], [{ winnerId: "a", loserId: "a" }, { winnerId: "z", loserId: "a" }]);
    expect(out.items.every((i) => i.comparisons === 0)).toBe(true);
  });
});

describe("selectNextPair", () => {
  it("returns null when fewer than two candidates", () => {
    expect(selectNextPair(["a"], [], [], "j")).toBeNull();
  });

  it("never repeats a pair the judge already compared", () => {
    const ids = ["a", "b", "c"];
    const judgeHistory: Comparison[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const pair = selectNextPair(ids, judgeHistory, judgeHistory, "judge-1");
      expect(pair).not.toBeNull();
      const key = [...pair!].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      judgeHistory.push({ winnerId: pair![0], loserId: pair![1] });
    }
    expect(selectNextPair(ids, judgeHistory, judgeHistory, "judge-1")).toBeNull();
  });

  it("prefers the least-compared items", () => {
    const all = [...beats("a", "b", 5), ...beats("b", "a", 5)];
    const pair = selectNextPair(["a", "b", "c", "d"], all, [], "j");
    expect([...pair!].sort()).toEqual(["c", "d"]);
  });

  it("is deterministic", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    expect(selectNextPair(ids, [], [], "j9")).toEqual(selectNextPair(ids, [], [], "j9"));
  });
});

describe("fnv1a (with murmur3 finalizer)", () => {
  it("is stable", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("spreads keys that differ only in their last characters", () => {
    // Regression: plain FNV-1a put all of these in a narrow band of [0, 1).
    const draws = Array.from({ length: 200 }, (_, i) => fnv1a(`complete:judge:sub_${String(i).padStart(3, "0")}`) / 2 ** 32);
    const buckets = new Array(10).fill(0);
    for (const d of draws) buckets[Math.floor(d * 10)] += 1;
    for (const b of buckets) expect(b).toBeGreaterThan(8);
    expect(Math.min(...draws)).toBeLessThan(0.05);
    expect(Math.max(...draws)).toBeGreaterThan(0.95);
  });
});
