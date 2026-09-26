import { existsSync } from "node:fs";
import { prepareDatabase } from "./boot";
import { loadConfig } from "./config";
import { migrate } from "./db/migrate";
import { Db } from "./db/pool";

/**
 * Operator CLI:
 *   migrate          apply pending migrations
 *   seed             migrate + load fixtures if the database is empty
 *   reset --yes      DROP everything, then migrate + seed (local/dev only)
 */
async function main() {
  const [command, ...flags] = process.argv.slice(2);
  const config = loadConfig(process.env, existsSync);
  const db = new Db(config.databaseUrl, 2);
  try {
    if (command === "migrate") {
      const applied = await migrate(db, config.migrationsDir);
      console.log(applied.length ? `Applied ${applied.length} migration(s)` : "Schema is up to date");
    } else if (command === "seed") {
      await prepareDatabase(db, { ...config, seedOnBoot: true });
    } else if (command === "reset") {
      if (!flags.includes("--yes")) throw new Error("reset destroys all data; re-run with --yes");
      await db.owner(async (c) => {
        await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      });
      await prepareDatabase(db, { ...config, seedOnBoot: true });
    } else {
      console.log("usage: cli <migrate|seed|reset --yes>");
      process.exitCode = 2;
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
