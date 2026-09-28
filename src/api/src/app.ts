import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import type { Config } from "./config";
import type { Db } from "./db/pool";
import { createAiClient } from "./ai/client";
import { generateSigningKeyPem, loadSigningKeys, randomToken, type SigningKeys } from "./lib/crypto";
import { notFound } from "./lib/errors";
import type { AppContext } from "./http/context";
import { authenticate, csrfGuard, errorHandler, globalRateLimit, requestLogger, securityHeaders } from "./http/middleware";
import { RateLimiter } from "./http/rate-limit";
import { mountRoutes, openApiDocument, route, type RouteDef } from "./http/route";
import { adminRoutes } from "./modules/admin";
import { aiRoutes } from "./modules/ai";
import { announcementRoutes } from "./modules/announcements";
import { teamFinderRoutes } from "./modules/teamfinder";
import { authRoutes } from "./modules/auth";
import { eventRoutes } from "./modules/events";
import { judgingRoutes } from "./modules/judging";
import { notificationRoutes } from "./modules/notifications";
import { platformRoutes } from "./modules/platform";
import { profileRoutes } from "./modules/profiles";
import { recordRoutes } from "./modules/records";
import { resultRoutes } from "./modules/results";
import { submissionRoutes } from "./modules/submissions";
import { teamRoutes } from "./modules/teams";
import { votingRoutes } from "./modules/voting";
import { createWebhookSink, webhookRoutes } from "./modules/webhooks";

export const VERSION = "1.0.0";

/** App secret and Ed25519 signing key: from env, else generated once and persisted. */
export async function ensureSecrets(db: Db, config: Config): Promise<{ secret: string; keys: SigningKeys }> {
  return db.owner(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(727274002)");
      const get = async (key: string) =>
        (await client.query<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key])).rows[0]?.value ?? null;
      let secret = config.appSecret ?? (await get("app_secret"));
      if (!secret) {
        secret = randomToken(48);
        await client.query("INSERT INTO settings (key, value) VALUES ('app_secret', $1)", [secret]);
      }
      let pem = await get("signing_key");
      if (!pem) {
        pem = generateSigningKeyPem();
        await client.query("INSERT INTO settings (key, value) VALUES ('signing_key', $1)", [pem]);
      }
      await client.query("COMMIT");
      return { secret, keys: loadSigningKeys(pem) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

export function allRoutes(): RouteDef[] {
  return [
    ...authRoutes,
    ...eventRoutes,
    ...aiRoutes,
    ...announcementRoutes,
    ...profileRoutes,
    ...teamRoutes,
    ...teamFinderRoutes,
    ...submissionRoutes,
    ...judgingRoutes,
    ...notificationRoutes,
    ...resultRoutes,
    ...votingRoutes,
    ...adminRoutes,
    ...webhookRoutes,
    ...recordRoutes,
    ...platformRoutes,
  ];
}

export interface CreateAppOptions {
  config: Config;
  db: Db;
  now?: () => number;
}

export async function createApp({ config, db, now = Date.now }: CreateAppOptions): Promise<{ app: Express; ctx: AppContext }> {
  const { secret, keys } = await ensureSecrets(db, config);
  const ctx: AppContext = {
    config,
    db,
    secret,
    keys,
    now,
    limiter: new RateLimiter(now),
    webhooks: createWebhookSink(db),
    ai: createAiClient(config),
  };

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("etag", false);

  app.use(securityHeaders);
  app.use(authenticate(ctx));
  app.use(requestLogger(config.logRequests));
  app.use(globalRateLimit(ctx));
  app.use(csrfGuard(ctx));
  app.use("/api/uploads", express.raw({ type: ["image/*", "application/octet-stream"], limit: "5mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const routes = allRoutes();
  const docRoutes: RouteDef[] = [
    route({
      method: "get",
      path: "/api/health",
      summary: "Liveness and database connectivity",
      tags: ["Platform"],
      auth: "public",
      async handler({ app: c }) {
        const dbOk = await c.db.ping();
        return { status: dbOk ? "ok" : "degraded", db: dbOk, version: VERSION, time: new Date(c.now()).toISOString() };
      },
    }),
    route({
      method: "get",
      path: "/api/openapi.json",
      summary: "OpenAPI 3.1 document generated from the live route table",
      tags: ["Platform"],
      auth: "public",
      async handler() {
        return openApiDocument([...docRoutes, ...routes], { version: VERSION, serverUrl: config.publicUrl });
      },
    }),
  ];
  const router = express.Router();
  mountRoutes(router, [...docRoutes, ...routes], ctx);
  app.use(router);

  app.get("/health", async (_req, res) => {
    const ok = await db.ping();
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded" });
  });

  app.use(
    "/uploads",
    express.static(config.uploadDir, {
      fallthrough: false,
      index: false,
      dotfiles: "deny",
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      },
    }),
  );

  app.use("/api", (_req, _res, next) => next(notFound("Endpoint")));

  if (config.webDist && existsSync(path.join(config.webDist, "index.html"))) {
    const indexHtml = path.join(config.webDist, "index.html");
    app.use("/assets", precompressedAssets(path.join(config.webDist, "assets")));
    app.use(
      express.static(config.webDist, {
        index: false,
        maxAge: "1y",
        immutable: true,
        setHeaders(res, file) {
          if (!file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("text/plain").send(`Dogfood API ${VERSION} is running. The web UI is not built (WEB_DIST missing).`);
    });
  }

  app.use(errorHandler);
  return { app, ctx };
}

const ASSET_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Serve the Brotli/gzip twins written at build time (src/web/scripts/compress.mjs)
 * when the client accepts them. Falls through to express.static otherwise.
 */
function precompressedAssets(dir: string): express.RequestHandler {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const type = ASSET_TYPES[path.extname(req.path)];
    if (!type || req.path.includes("..")) return next();
    const accepted = req.get("accept-encoding") ?? "";
    const variant = /\bbr\b/.test(accepted) ? { ext: ".br", enc: "br" } : /\bgzip\b/.test(accepted) ? { ext: ".gz", enc: "gzip" } : null;
    const file = variant && path.join(dir, `${req.path}${variant.ext}`);
    if (!variant || !file || !file.startsWith(dir + path.sep) || !existsSync(file)) return next();
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Encoding", variant.enc);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(file, (err) => err && next(err));
  };
}
