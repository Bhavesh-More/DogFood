import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createApp } from "../../src/api/src/app";
import { prepareDatabase } from "../../src/api/src/boot";
import { loadConfig } from "../../src/api/src/config";
import { Db } from "../../src/api/src/db/pool";

/**
 * Integration harness: a throw-away Postgres database per test file, migrated
 * and seeded from the real fixtures.json, with the real Express app listening
 * on an ephemeral port. Tests talk HTTP to it exactly like a client would.
 *
 * Requires a reachable Postgres superuser; set TEST_DATABASE_URL to override
 * (default postgres://postgres@127.0.0.1:5432/postgres). `docker compose` users
 * can point it at the compose `db` service.
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/postgres";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const TOKENS = {
  admin: "dfc_admin_4f9c2e7a1b8d60536e21",
  organizer: "dfc_organizer_8b1d3f5a7c9e20461a",
  judgeA: "dfc_judge_a_2c4e6a8b0d1f39571b",
  judgeB: "dfc_judge_b_9e7c5a3b1d2f40682c",
  judgeF: "dfc_judge_f_5a1c9e3b7d2f60843d",
  participant: "dfc_participant_7d3b1f9e5c2a48064e",
  participant2: "dfc_participant2_3e9a7c1d5b2f86024f",
  visitor: "dfc_visitor_1b5d9f3a7e2c64080a",
} as const;

export interface TestResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export interface Client {
  get<T = any>(p: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  post<T = any>(p: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse<T>>;
  put<T = any>(p: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse<T>>;
  patch<T = any>(p: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse<T>>;
  del<T = any>(p: string, headers?: Record<string, string>): Promise<TestResponse<T>>;
  raw(p: string, init: RequestInit): Promise<Response>;
}

export interface TestStack {
  base: string;
  db: Db;
  dbName: string;
  anon: Client;
  as(token: string): Client;
  cookieJar(): Client;
  sql<T extends pg.QueryResultRow = any>(text: string, params?: unknown[]): Promise<T[]>;
  /**
   * Run raw SQL exactly as the API's request transactions do (non-owner role,
   * RLS context set) and roll back afterwards: proves the database itself
   * enforces isolation, independent of any application WHERE clause.
   */
  asDbUser<T>(userId: string | null, role: string, fn: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function makeClient(base: string, auth?: { bearer?: string; cookies?: Map<string, string> }): Client {
  const request = async <T>(method: string, p: string, body?: unknown, extra: Record<string, string> = {}): Promise<TestResponse<T>> => {
    const headers: Record<string, string> = { accept: "application/json", ...extra };
    if (auth?.bearer) headers.authorization = `Bearer ${auth.bearer}`;
    if (auth?.cookies?.size) headers.cookie = [...auth.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (auth?.cookies) {
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const idx = pair!.indexOf("=");
        const name = pair!.slice(0, idx);
        const value = decodeURIComponent(pair!.slice(idx + 1));
        if (/Max-Age=0/.test(c)) auth.cookies.delete(name);
        else auth.cookies.set(name, value);
      }
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON (CSV etc.) */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  };
  return {
    get: (p, h) => request("GET", p, undefined, h),
    post: (p, b, h) => request("POST", p, b ?? {}, h),
    put: (p, b, h) => request("PUT", p, b ?? {}, h),
    patch: (p, b, h) => request("PATCH", p, b ?? {}, h),
    del: (p, h) => request("DELETE", p, undefined, h),
    raw: (p, init) => fetch(base + p, init),
  };
}

export async function startStack(opts: { now?: () => number } = {}): Promise<TestStack> {
  const dbName = `dogfood_test_${process.pid}_${Math.floor(Math.random() * 1e9)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const config = loadConfig({
    DATABASE_URL: url.toString(),
    WEB_DIST: "",
    FIXTURES_PATH: path.join(ROOT, "fixtures.json"),
    LOG_REQUESTS: "false",
    WEBHOOK_WORKER: "false",
    UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), "dogfood-uploads-")),
    PUBLIC_URL: "http://localhost:8000",
  });
  const db = new Db(config.databaseUrl, 5);
  await prepareDatabase(db, config, () => undefined);
  const { app } = await createApp({ config, db, now: opts.now });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    db,
    dbName,
    anon: makeClient(base),
    as: (token) => makeClient(base, { bearer: token }),
    cookieJar: () => makeClient(base, { cookies: new Map() }),
    sql: async (text, params) => (await db.pool.query(text, params)).rows,
    async asDbUser(userId, role, fn) {
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE dogfood_app");
        await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)", [userId ?? "", role]);
        return await fn(async (text, params) => (await client.query(text, params)).rows);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    },
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
      await db.close();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}
