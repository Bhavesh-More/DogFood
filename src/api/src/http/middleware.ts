import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isRole } from "@dogfood/core";
import { hmacHex, sha256Hex } from "../lib/crypto";
import { HttpError, forbidden, tooManyRequests } from "../lib/errors";
import { pgErrorCode } from "../db/pool";
import type { Actor, AppContext } from "./context";
import { LIMITS } from "./rate-limit";

export const SESSION_COOKIE = "dogfood_session";
export const VOTER_COOKIE = "dogfood_voter";
export const DEVICE_COOKIE = "dogfood_vid";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key || key in out) continue;
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  secure: boolean;
  sameSite?: "Lax" | "Strict";
}

export function setCookie(res: Response, name: string, value: string, opts: CookieOptions): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", `SameSite=${opts.sameSite ?? "Lax"}`];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  res.append("Set-Cookie", parts.join("; "));
}

export function clearCookie(res: Response, name: string, secure: boolean): void {
  setCookie(res, name, "", { maxAgeSeconds: 0, secure });
}

/** Strict security headers. The embed route relaxes framing only. */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const embeddable = req.path.startsWith("/embed/") || req.path.startsWith("/api/embed/");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${embeddable ? "*" : "'none'"}`,
    ].join("; "),
  );
  if (!embeddable) res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
}

function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
}

/** Resolve the caller from the session cookie or a Bearer API token. */
export function authenticate(app: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ip = clientIp(req);
      const actor: Actor = {
        user: null,
        sessionId: null,
        via: null,
        ip,
        ipHash: hmacHex(app.secret, `ip:${ip}`).slice(0, 32),
        uaHash: sha256Hex(req.get("user-agent") ?? "").slice(0, 16),
      };
      const authz = req.get("authorization");
      const bearer = authz?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      const cookieToken = parseCookies(req.get("cookie"))[SESSION_COOKIE];
      const token = bearer ?? cookieToken;
      if (token && token.length <= 512) {
        const { rows } = await app.db.pool.query<{
          session_id: string;
          last_used_at: string | null;
          id: string;
          email: string;
          name: string;
          role: string;
          created_at: string;
        }>(
          `SELECT s.id AS session_id, s.last_used_at, u.id, u.email, u.name, u.role, u.created_at
             FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
          [sha256Hex(token)],
        );
        const row = rows[0];
        if (row && isRole(row.role)) {
          actor.user = { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
          actor.sessionId = row.session_id;
          actor.via = bearer ? "bearer" : "cookie";
          if (!row.last_used_at || Date.parse(row.last_used_at) < app.now() - 5 * 60_000) {
            app.db.pool
              .query("UPDATE sessions SET last_used_at = now() WHERE id = $1", [row.session_id])
              .catch(() => undefined);
          }
        }
      }
      req.actor = actor;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * CSRF defence for cookie-authenticated writes: browsers always send Origin
 * on cross-origin state-changing requests, so a mismatching Origin is refused.
 * (SameSite=Lax cookies already block the classic cross-site POST.)
 */
export function csrfGuard(app: AppContext) {
  const allowed = new Set([new URL(app.config.publicUrl).origin]);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.actor?.via !== "cookie") return next();
    const origin = req.get("origin");
    if (!origin) return next();
    const host = req.get("host");
    const sameHost = host && (origin === `http://${host}` || origin === `https://${host}`);
    if (sameHost || allowed.has(origin)) return next();
    next(forbidden("Cross-site request blocked", "CSRF_BLOCKED"));
  };
}

export function globalRateLimit(app: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    const key = `global:${req.actor?.user?.id ?? req.actor?.ipHash ?? "?"}`;
    const wait = app.limiter.take(key, LIMITS.global);
    if (wait > 0) {
      res.setHeader("Retry-After", String(wait));
      return next(tooManyRequests(wait));
    }
    next();
  };
}

export function requestLogger(enabled: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled || !req.path.startsWith("/api/")) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const who = req.actor?.user ? `${req.actor.user.role}:${req.actor.user.id}` : "anon";
      console.log(`[http] ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms ${who}`);
    });
    next();
  };
}

/** Maps every error to the `{ error, code, details? }` contract. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let body: { error: string; code: string; details?: unknown } = {
    error: "Internal server error",
    code: "INTERNAL",
  };
  if (err instanceof HttpError) {
    status = err.status;
    body = { error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) };
  } else if (err instanceof ZodError) {
    status = 422;
    body = {
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  } else if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    status = 400;
    body = { error: "Malformed JSON body", code: "BAD_JSON" };
  } else if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.too.large") {
    status = 413;
    body = { error: "Request body too large", code: "PAYLOAD_TOO_LARGE" };
  } else {
    const pg = pgErrorCode(err);
    if (pg?.hint === "DEADLINE_PASSED") {
      status = 403;
      body = { error: "Submission locked: the hard deadline has passed", code: "DEADLINE_PASSED" };
    } else if (pg?.code === "23505") {
      status = 409;
      body = { error: "That already exists", code: "CONFLICT" };
    } else if (pg?.code === "42501") {
      status = 403;
      body = { error: "You do not have access to this resource", code: "FORBIDDEN" };
    } else if (pg?.code === "23514" || pg?.code === "23503" || pg?.code === "22P02") {
      status = 422;
      body = { error: "The request violates a data constraint", code: "CONSTRAINT_VIOLATION" };
    } else {
      console.error("[error]", err);
    }
  }
  res.status(status).json(body);
}
