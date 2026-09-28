import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import type { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { can, type Capability } from "@dogfood/core";
import { forbidden, tooManyRequests, unauthorized, unprocessable } from "../lib/errors";
import { dbActor, type AppContext, type HandlerCtx } from "./context";
import type { BucketSpec } from "./rate-limit";

/**
 * Declarative routes. One definition drives:
 *   - authentication/capability guard (401/403 before any handler code),
 *   - Zod validation of body and query (422 with field details),
 *   - rate limiting,
 *   - the generated OpenAPI 3.1 document (so the spec cannot drift).
 */
export type AuthRequirement = "public" | "user" | Capability;

export interface RouteDef<B extends z.ZodType | undefined = z.ZodType | undefined, Q extends z.ZodType | undefined = z.ZodType | undefined> {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: AuthRequirement;
  body?: B;
  query?: Q;
  status?: number;
  rateLimit?: { bucket: string; spec: BucketSpec };
  /** Response media type for the OpenAPI document. */
  produces?: "application/json" | "text/csv" | "text/calendar" | "image/*" | "text/html";
  /** Raw body (uploads) — skips JSON parsing/validation. */
  rawBody?: boolean;
  handler: (
    ctx: HandlerCtx<B extends z.ZodType ? z.output<B> : undefined, Q extends z.ZodType ? z.output<Q> : undefined>,
  ) => Promise<unknown>;
}

export function route<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined>(
  def: RouteDef<B, Q>,
): RouteDef {
  return def as unknown as RouteDef;
}

function formatZodError(err: z.ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function mountRoutes(router: Router, defs: readonly RouteDef[], app: AppContext): void {
  for (const def of defs) {
    router[def.method](def.path, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actor = req.actor;
        if (def.auth !== "public") {
          if (!actor.user) throw unauthorized();
          if (def.auth !== "user" && !can(actor.user.role, def.auth)) {
            throw forbidden(`Your role (${actor.user.role}) cannot perform this action`, "ROLE_FORBIDDEN");
          }
        }
        if (def.rateLimit) {
          // Public anti-abuse buckets key on the IP so attaching any valid
          // session cannot move an anonymous caller onto a fresh bucket.
          const ipOnly = def.rateLimit.bucket === "auth";
          const key = `${def.rateLimit.bucket}:${ipOnly ? actor.ipHash : actor.user?.id ?? actor.ipHash}`;
          const wait = app.limiter.take(key, def.rateLimit.spec);
          if (wait > 0) {
            res.setHeader("Retry-After", String(wait));
            throw tooManyRequests(wait);
          }
        }
        let body: unknown = undefined;
        if (def.body && !def.rawBody) {
          const parsed = def.body.safeParse(req.body ?? {});
          if (!parsed.success) throw unprocessable("Invalid request body", formatZodError(parsed.error));
          body = parsed.data;
        }
        let query: unknown = undefined;
        if (def.query) {
          const parsed = def.query.safeParse(req.query ?? {});
          if (!parsed.success) throw unprocessable("Invalid query parameters", formatZodError(parsed.error));
          query = parsed.data;
        }
        const ctx: HandlerCtx<unknown, unknown> = {
          req,
          res,
          app,
          actor,
          user: actor.user!,
          params: req.params as Record<string, string>,
          body,
          query,
          tx: (fn) => app.db.tx(dbActor(actor), fn),
        };
        const result = await def.handler(ctx as never);
        if (res.headersSent) return;
        if (result === undefined) {
          res.status(def.status ?? 204).end();
        } else {
          sendJson(req, res, def.status ?? 200, result);
        }
      } catch (err) {
        next(err);
      }
    });
  }
}

/** Bodies smaller than one TCP segment are not worth compressing. */
const COMPRESS_MIN_BYTES = 1400;

/**
 * JSON with transparent Brotli/gzip for larger bodies (exports, OpenAPI,
 * normalization runs). Synchronous and fast at these sizes; no dependency.
 */
export function sendJson(req: Request, res: Response, status: number, body: unknown): void {
  const json = Buffer.from(JSON.stringify(body));
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Accept-Encoding");
  const accepted = req.get("accept-encoding") ?? "";
  if (json.length >= COMPRESS_MIN_BYTES && /\bbr\b/.test(accepted)) {
    res.setHeader("Content-Encoding", "br");
    res.send(brotliCompressSync(json, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }));
  } else if (json.length >= COMPRESS_MIN_BYTES && /\bgzip\b/.test(accepted)) {
    res.setHeader("Content-Encoding", "gzip");
    res.send(gzipSync(json, { level: 6 }));
  } else {
    res.send(json);
  }
}

// ---------------------------------------------------------------------------
// OpenAPI 3.1 generation
// ---------------------------------------------------------------------------
function toJsonSchema(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any", target: "draft-2020-12" });
  } catch {
    return { type: "object" };
  }
}

export function openApiDocument(defs: readonly RouteDef[], info: { version: string; serverUrl: string }) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const def of defs) {
    const oaPath = def.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const params = [...def.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    const queryParams: unknown[] = [];
    if (def.query) {
      const js = toJsonSchema(def.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(js.properties ?? {})) {
        queryParams.push({ name, in: "query", required: js.required?.includes(name) ?? false, schema });
      }
    }
    const status = String(def.status ?? 200);
    const responses: Record<string, unknown> = {
      [status]: {
        description: "Success",
        ...(status === "204"
          ? {}
          : { content: { [def.produces ?? "application/json"]: { schema: {} } } }),
      },
      "422": { $ref: "#/components/responses/ValidationFailed" },
    };
    if (def.auth !== "public") {
      responses["401"] = { $ref: "#/components/responses/Unauthorized" };
      responses["403"] = { $ref: "#/components/responses/Forbidden" };
    }
    if (def.rateLimit) responses["429"] = { $ref: "#/components/responses/RateLimited" };
    if (params.length) responses["404"] = { $ref: "#/components/responses/NotFound" };

    const op: Record<string, unknown> = {
      operationId: `${def.method}_${def.path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      summary: def.summary,
      description: def.description,
      tags: def.tags,
      parameters: [...params, ...queryParams],
      responses,
      "x-required-capability": def.auth,
    };
    if (def.auth !== "public") op.security = [{ sessionCookie: [] }, { bearerToken: [] }];
    if (def.body) {
      op.requestBody = {
        required: true,
        content: def.rawBody
          ? { "image/png": {}, "image/jpeg": {}, "image/webp": {}, "image/gif": {} }
          : { "application/json": { schema: toJsonSchema(def.body) } },
      };
    }
    paths[oaPath] ??= {};
    paths[oaPath][def.method] = op;
  }

  const errorSchema = {
    type: "object",
    required: ["error", "code"],
    properties: { error: { type: "string" }, code: { type: "string" }, details: {} },
  };
  const errorResponse = (description: string) => ({
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Dogfood Portal API",
      version: info.version,
      description:
        "Every action available in the UI is available here. Authenticate with the `dogfood_session` cookie " +
        "or an API token (`Authorization: Bearer …`) created under Settings → API tokens. " +
        "Errors are always `{ error, code, details? }`.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: info.serverUrl }],
    tags: [...new Set(defs.flatMap((d) => d.tags))].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "dogfood_session" },
        bearerToken: { type: "http", scheme: "bearer" },
      },
      schemas: { Error: errorSchema },
      responses: {
        Unauthorized: errorResponse("Authentication required"),
        Forbidden: errorResponse("Authenticated but not allowed (role, ownership, scope or deadline)"),
        NotFound: errorResponse("Resource not found"),
        ValidationFailed: errorResponse("Request failed validation"),
        RateLimited: errorResponse("Rate limit exceeded; see Retry-After"),
      },
    },
  };
}
