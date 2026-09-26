import { existsSync } from "node:fs";
import { createApp, VERSION } from "./app";
import { prepareDatabase } from "./boot";
import { loadConfig } from "./config";
import { Db } from "./db/pool";
import { startWebhookWorker } from "./modules/webhooks";

async function waitForDatabase(db: Db, attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    if (await db.ping()) return;
    console.log(`[boot] waiting for database (${i}/${attempts})…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Database did not become available");
}

async function main() {
  const config = loadConfig(process.env, existsSync);
  const db = new Db(config.databaseUrl);
  await waitForDatabase(db);
  await prepareDatabase(db, config);
  const { app } = await createApp({ config, db });
  const stopWorker = config.webhookWorker ? startWebhookWorker(db) : () => undefined;

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`[boot] Dogfood portal ${VERSION} listening on ${config.publicUrl} (port ${config.port})`);
    if (!config.webDist || !existsSync(config.webDist)) console.log("[boot] web UI not found — serving API only");
  });

  const shutdown = (signal: string) => {
    console.log(`[boot] ${signal} received, shutting down`);
    stopWorker();
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[boot] fatal:", err);
  process.exit(1);
});
