/**
 * In-memory token buckets. Good enough for a single self-hosted node, which
 * is the deployment target; documented as a known limitation for multi-node.
 */
export interface BucketSpec {
  /** Burst size. */
  capacity: number;
  /** Tokens added per minute. */
  perMinute: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns 0 when allowed, otherwise seconds until a token is available. */
  take(key: string, spec: BucketSpec, cost = 1): number {
    const t = this.now();
    this.sweep(t);
    const rate = spec.perMinute / 60_000;
    const b = this.buckets.get(key) ?? { tokens: spec.capacity, updatedAt: t };
    b.tokens = Math.min(spec.capacity, b.tokens + (t - b.updatedAt) * rate);
    b.updatedAt = t;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      this.buckets.set(key, b);
      return 0;
    }
    this.buckets.set(key, b);
    return Math.max(1, Math.ceil((cost - b.tokens) / rate / 1000));
  }

  reset(): void {
    this.buckets.clear();
  }

  private sweep(t: number) {
    if (t - this.lastSweep < 60_000) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) if (t - b.updatedAt > 3_600_000) this.buckets.delete(k);
  }
}

export const LIMITS = {
  global: { capacity: 600, perMinute: 600 },
  auth: { capacity: 10, perMinute: 10 },
  vote: { capacity: 20, perMinute: 20 },
  emailCode: { capacity: 3, perMinute: 2 },
  comment: { capacity: 10, perMinute: 6 },
  upload: { capacity: 20, perMinute: 20 },
  write: { capacity: 120, perMinute: 120 },
} satisfies Record<string, BucketSpec>;
