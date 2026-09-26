import type { Config } from "./config";
import { migrate } from "./db/migrate";
import type { Db } from "./db/pool";
import { ensureSecrets } from "./app";
import { isSeeded, loadFixtures, seedDatabase, upsertCheckerSessions } from "./seed/seed";

/**
 * Idempotent boot sequence shared by the server and the CLI:
 *   1. apply migrations (advisory-locked),
 *   2. ensure the app secret and signing key exist,
 *   3. seed deterministic fixtures into an empty database,
 *   4. refresh the acceptance-checker sessions listed in fixtures.json.
 */
export async function prepareDatabase(db: Db, config: Config, log = console.log): Promise<void> {
  await migrate(db, config.migrationsDir, log);
  const { keys } = await ensureSecrets(db, config);
  const loaded = config.seedOnBoot || config.checkerSessions ? await loadFixtures(config.fixturesPath, log) : null;
  if (config.seedOnBoot) {
    if (await isSeeded(db)) {
      log("[seed] database already has data — skipping fixtures");
    } else if (loaded) {
      log(`[seed] loading ${loaded.source}`);
      await seedDatabase({ db, keys, publicUrl: config.publicUrl, now: Date.now(), log }, loaded.fixtures, loaded.source);
    } else {
      log("[seed] no fixtures.json found — starting empty");
    }
  }
  if (config.checkerSessions && loaded) {
    const n = await upsertCheckerSessions(db, loaded.fixtures);
    log(`[seed] ${n} acceptance-checker sessions active (disable with CHECKER_SESSIONS=false)`);
  }
}
