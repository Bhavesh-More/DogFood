import type { Response } from "express";
import { apiTokenInput, capabilitiesOf, loginInput, registerInput, type SessionDto, type UserDto } from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { dummyPasswordHash, hashPassword, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { conflict, notFound, unauthorized } from "../lib/errors";
import { newId } from "../lib/ids";
import type { AppContext, AuthUser } from "../http/context";
import { SESSION_COOKIE, clearCookie, setCookie } from "../http/middleware";
import { LIMITS } from "../http/rate-limit";
import { route } from "../http/route";

const SESSION_DAYS = 14;

export function toUserDto(u: { id: string; email: string; name: string; role: string; created_at?: string; createdAt?: string }): UserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as UserDto["role"],
    createdAt: (u.created_at ?? u.createdAt)!,
  };
}

export async function createSession(
  tx: Tx,
  userId: string,
  kind: "web" | "api" | "checker",
  days: number,
  label: string | null = null,
  token = randomToken(),
): Promise<{ id: string; token: string; expiresAt: string }> {
  const id = newId("ses");
  const row = await one<{ expires_at: string }>(
    tx,
    `INSERT INTO sessions (id, user_id, token_hash, kind, label, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) RETURNING expires_at`,
    [id, userId, sha256Hex(token), kind, label, days],
  );
  return { id, token, expiresAt: row!.expires_at };
}

function setSessionCookie(app: AppContext, res: Response, token: string) {
  setCookie(res, SESSION_COOKIE, token, {
    maxAgeSeconds: SESSION_DAYS * 86_400,
    secure: app.config.cookieSecure,
    sameSite: "Lax",
  });
}

function sessionDto(app: AppContext, user: AuthUser | null): SessionDto {
  return {
    user: user ? toUserDto(user) : null,
    capabilities: capabilitiesOf(user?.role ?? null),
    serverTime: new Date(app.now()).toISOString(),
  };
}

export const authRoutes = [
  route({
    method: "post",
    path: "/api/auth/register",
    summary: "Create a local account (participant or visitor) and start a session",
    tags: ["Auth"],
    auth: "public",
    body: registerInput,
    status: 201,
    rateLimit: { bucket: "auth", spec: LIMITS.auth },
    async handler({ app, body, res, tx, actor }) {
      const passwordHash = await hashPassword(body.password);
      const result = await tx(async (t) => {
        const exists = await one(t, "SELECT 1 FROM users WHERE lower(email) = $1", [body.email]);
        if (exists) throw conflict("An account with that email already exists", "EMAIL_TAKEN");
        const id = newId("usr");
        const user = await one<{ id: string; email: string; name: string; role: string; created_at: string }>(
          t,
          `INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, name, role, created_at`,
          [id, body.email, body.name, passwordHash, body.intent],
        );
        const session = await createSession(t, id, "web", SESSION_DAYS);
        await audit(t, { ...actor, user: toUserDto(user!) as AuthUser }, {
          action: "user.registered",
          entityType: "user",
          entityId: id,
          summary: `${body.name} registered as ${body.intent}`,
        });
        return { user: user!, session };
      });
      setSessionCookie(app, res, result.session.token);
      return sessionDto(app, toUserDto(result.user) as AuthUser);
    },
  }),

  route({
    method: "post",
    path: "/api/auth/login",
    summary: "Log in with email and password",
    description: "Returns 401 with the same message whether the email exists or not.",
    tags: ["Auth"],
    auth: "public",
    body: loginInput,
    rateLimit: { bucket: "auth", spec: LIMITS.auth },
    async handler({ app, body, res, tx, actor }) {
      const user = await tx((t) =>
        one<{ id: string; email: string; name: string; role: string; created_at: string; password_hash: string; disabled_at: string | null }>(
          t,
          "SELECT id, email, name, role, created_at, password_hash, disabled_at FROM users WHERE lower(email) = $1",
          [body.email],
        ),
      );
      const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyPasswordHash()));
      if (!user || !ok || user.disabled_at) throw unauthorized("Invalid email or password");
      const session = await tx(async (t) => {
        const s = await createSession(t, user.id, "web", SESSION_DAYS);
        await audit(t, { ...actor, user: toUserDto(user) as AuthUser }, {
          action: "user.login",
          entityType: "user",
          entityId: user.id,
          summary: `${user.name} logged in`,
        });
        return s;
      });
      setSessionCookie(app, res, session.token);
      return sessionDto(app, toUserDto(user) as AuthUser);
    },
  }),

  route({
    method: "post",
    path: "/api/auth/logout",
    summary: "End the current session",
    tags: ["Auth"],
    auth: "public",
    async handler({ app, res, actor }) {
      if (actor.sessionId && actor.via === "cookie") {
        await app.db.pool.query("DELETE FROM sessions WHERE id = $1", [actor.sessionId]);
      }
      clearCookie(res, SESSION_COOKIE, app.config.cookieSecure);
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/auth/me",
    summary: "Current user, capabilities and server time",
    tags: ["Auth"],
    auth: "public",
    async handler({ app, actor }) {
      return sessionDto(app, actor.user);
    },
  }),

  route({
    method: "get",
    path: "/api/auth/tokens",
    summary: "List your personal API tokens",
    tags: ["Auth"],
    auth: "user",
    async handler({ user, tx }) {
      return tx((t) =>
        many(
          t,
          `SELECT id, label, created_at AS "createdAt", expires_at AS "expiresAt", last_used_at AS "lastUsedAt"
             FROM sessions WHERE user_id = $1 AND kind = 'api' AND expires_at > now() ORDER BY created_at DESC`,
          [user.id],
        ),
      );
    },
  }),

  route({
    method: "post",
    path: "/api/auth/tokens",
    summary: "Create a personal API token (shown once)",
    tags: ["Auth"],
    auth: "user",
    body: apiTokenInput,
    status: 201,
    async handler({ user, body, tx, actor }) {
      return tx(async (t) => {
        const token = `dft_${randomToken(24)}`;
        const s = await createSession(t, user.id, "api", body.expiresInDays, body.label, token);
        await audit(t, actor, {
          action: "api_token.created",
          entityType: "session",
          entityId: s.id,
          summary: `API token "${body.label}" created`,
        });
        return { id: s.id, label: body.label, token, expiresAt: s.expiresAt };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/auth/tokens/:tokenId",
    summary: "Revoke one of your API tokens",
    tags: ["Auth"],
    auth: "user",
    async handler({ user, params, tx, actor }) {
      await tx(async (t) => {
        const res = await t.query("DELETE FROM sessions WHERE id = $1 AND user_id = $2 AND kind = 'api'", [
          params.tokenId,
          user.id,
        ]);
        if (res.rowCount === 0) throw notFound("Token");
        await audit(t, actor, {
          action: "api_token.revoked",
          entityType: "session",
          entityId: params.tokenId,
          summary: "API token revoked",
        });
      });
      return undefined;
    },
  }),
];
