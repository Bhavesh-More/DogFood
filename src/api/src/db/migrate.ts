import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./pool";

/**
 * Forward-only SQL migrations. Files `NNN_name.sql` run in lexical order,
 * each inside its own transaction, guarded by an advisory lock so several
 * app replicas booting at once cannot race.
 */
export async function migrate(db: Db, dir: string, log = console.log): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  await db.owner(async (client) => {
    await client.query("SELECT pg_advisory_lock(727274000)");
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name       text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`);
      const done = new Set(
        (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
      );
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(dir, file), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
        }
        applied.push(file);
        log(`[migrate] applied ${file}`);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(727274000)");
    }
  });
  return applied;
}
