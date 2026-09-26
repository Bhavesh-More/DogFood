import pg from "pg";

/**
 * Connection handling.
 *
 * - `Db.tx(actor, fn)` runs `fn` inside a transaction whose connection has
 *   `SET ROLE dogfood_app` (non-owner ⇒ Row-Level Security applies) and the
 *   request context `app.user_id` / `app.role` set with SET LOCAL semantics.
 * - `Db.system(fn)` does the same with role 'system' for trusted internal jobs
 *   (seeding, normalization snapshots, webhook worker).
 * - `Db.owner(fn)` uses the owner connection without SET ROLE; migrations only.
 */

// Return timestamptz as ISO strings and bigint/numeric as numbers.
const parseTimestamptz = pg.types.getTypeParser(1184) as (v: string) => Date;
pg.types.setTypeParser(1184, (v: string) => parseTimestamptz(v).toISOString()); // timestamptz
pg.types.setTypeParser(20, (v: string) => Number(v)); // int8
pg.types.setTypeParser(1700, (v: string) => Number(v)); // numeric

export type Tx = pg.PoolClient;

export interface DbActor {
  userId: string | null;
  role: string;
}

export const SYSTEM_ACTOR: DbActor = { userId: null, role: "system" };
export const ANONYMOUS_ACTOR: DbActor = { userId: null, role: "anonymous" };

export class Db {
  readonly pool: pg.Pool;

  constructor(connectionString: string, max = 10) {
    this.pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
    this.pool.on("error", (err) => {
      console.error("[db] idle client error:", err.message);
    });
  }

  async tx<T>(actor: DbActor, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE dogfood_app");
      await client.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)",
        [actor.userId ?? "", actor.role],
      );
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.tx(SYSTEM_ACTOR, fn);
  }

  async owner<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

/** Convenience: first row or null. */
export async function one<T extends pg.QueryResultRow>(
  tx: Tx,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const res = await tx.query<T>(sql, params);
  return res.rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow>(
  tx: Tx,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await tx.query<T>(sql, params);
  return res.rows;
}

/**
 * Map over items one query at a time. A transaction owns a single pg client,
 * which cannot pipeline queries (pg 9 removes the implicit queue), so we never
 * fan out with Promise.all inside `tx`.
 */
export async function mapSeq<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

/** Map a Postgres error raised by our triggers/constraints to an app code. */
export function pgErrorCode(err: unknown): { code: string; constraint?: string; hint?: string } | null {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    const e = err as { code: string; constraint?: string; hint?: string };
    return { code: e.code, constraint: e.constraint, hint: e.hint };
  }
  return null;
}
