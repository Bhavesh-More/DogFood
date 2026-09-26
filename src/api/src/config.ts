import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runtime configuration, read once from the environment.
 * Every value has a safe local default so `docker compose up` needs no .env.
 */
export interface Config {
  port: number;
  databaseUrl: string;
  /** HMAC key for IP/email hashing and signed voter tokens. Generated and
   *  persisted in the database on first boot when not provided. */
  appSecret: string | null;
  cookieSecure: boolean;
  trustProxy: boolean;
  uploadDir: string;
  webDist: string | null;
  seedOnBoot: boolean;
  fixturesPath: string | null;
  /** Seed long-lived per-role sessions whose tokens are listed in .dogfood.toml
   *  so the acceptance runner can authenticate. Disable in production. */
  checkerSessions: boolean;
  publicUrl: string;
  migrationsDir: string;
  webhookWorker: boolean;
  logRequests: boolean;
  /** Optional AI sidecar. Off by default so the core stack stays offline and
   *  single-command; every AI route degrades gracefully when disabled. */
  aiEnabled: boolean;
  aiServiceUrl: string;
  aiTimeoutMs: number;
  aiServiceKey: string | null;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolve a directory that differs between `tsx src/…` and the bundled `dist/…`. */
function firstExisting(candidates: string[], exists: (p: string) => boolean): string {
  return candidates.find(exists) ?? candidates[0]!;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, exists?: (p: string) => boolean): Config {
  const check = exists ?? (() => true);
  const port = Number(env.PORT ?? 8000);
  return {
    port,
    databaseUrl: env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/dogfood",
    appSecret: env.APP_SECRET && env.APP_SECRET.length >= 32 ? env.APP_SECRET : null,
    cookieSecure: bool(env.COOKIE_SECURE, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    uploadDir: path.resolve(env.UPLOAD_DIR ?? "data/uploads"),
    webDist: env.WEB_DIST === "" ? null : path.resolve(env.WEB_DIST ?? path.join(here, "../../web/dist")),
    seedOnBoot: bool(env.SEED_ON_BOOT, true),
    fixturesPath: env.FIXTURES_PATH ? path.resolve(env.FIXTURES_PATH) : null,
    checkerSessions: bool(env.CHECKER_SESSIONS, true),
    publicUrl: (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
    migrationsDir:
      env.MIGRATIONS_DIR ??
      firstExisting([path.join(here, "../migrations"), path.join(here, "migrations")], check),
    webhookWorker: bool(env.WEBHOOK_WORKER, true),
    logRequests: bool(env.LOG_REQUESTS, env.NODE_ENV !== "test"),
    aiEnabled: bool(env.AI_ENABLED, false),
    aiServiceUrl: (env.AI_SERVICE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, ""),
    aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 5000),
    aiServiceKey: env.AI_SERVICE_KEY && env.AI_SERVICE_KEY.length > 0 ? env.AI_SERVICE_KEY : null,
  };
}
