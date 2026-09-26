import type { Request, Response } from "express";
import type { Role } from "@dogfood/core";
import type { AiClient } from "../ai/client";
import type { Config } from "../config";
import type { Db, DbActor, Tx } from "../db/pool";
import type { SigningKeys } from "../lib/crypto";
import type { RateLimiter } from "./rate-limit";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/** Who is calling. Resolved once per request by the auth middleware. */
export interface Actor {
  user: AuthUser | null;
  sessionId: string | null;
  via: "cookie" | "bearer" | null;
  ip: string;
  ipHash: string;
  uaHash: string;
}

export interface WebhookSink {
  emit(eventId: string, type: string, data: Record<string, unknown>, tx?: Tx): Promise<void>;
}

/** Long-lived dependencies shared by every handler. */
export interface AppContext {
  config: Config;
  db: Db;
  secret: string;
  keys: SigningKeys;
  now: () => number;
  limiter: RateLimiter;
  webhooks: WebhookSink;
  /** Optional AI sidecar client; `enabled` is false unless AI_ENABLED=true. */
  ai: AiClient;
}

export function dbActor(actor: Actor): DbActor {
  return actor.user ? { userId: actor.user.id, role: actor.user.role } : { userId: null, role: "anonymous" };
}

declare global {
  namespace Express {
    interface Request {
      actor: Actor;
    }
  }
}

export interface HandlerCtx<TBody, TQuery> {
  req: Request;
  res: Response;
  app: AppContext;
  actor: Actor;
  /** Authenticated user (guaranteed when the route requires auth). */
  user: AuthUser;
  params: Record<string, string>;
  body: TBody;
  query: TQuery;
  /** Run DB work as the caller: RLS context is applied automatically. */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
