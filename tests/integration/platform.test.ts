import { createHmac, createPublicKey, verify } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allRoutes } from "../../src/api/src/app";
import { deliverDue } from "../../src/api/src/modules/webhooks";
import { startStack, TOKENS, type TestResponse, type TestStack } from "./helpers";

/** T4 — platform surface: webhooks, signed records, OpenAPI, bundles, uploads, embed; plus audit tamper detection. */
let s: TestStack;
let receiver: http.Server;
let receiverUrl: string;
const received: { headers: http.IncomingHttpHeaders; body: string; path: string }[] = [];

beforeAll(async () => {
  s = await startStack();
  receiver = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body, path: req.url ?? "" });
      res.statusCode = req.url === "/fail" ? 500 : 204;
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", () => r()));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => receiver?.close(() => r()));
  await s?.close();
});

/** Independent canonical JSON (sorted keys, no whitespace) — deliberately not the server's implementation. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

describe("webhooks", () => {
  let hook: { id: string; secret: string };

  it("registers a webhook and reveals the signing secret exactly once", async () => {
    const r = await s.as(TOKENS.organizer).post("/api/events/evt_02/webhooks", { url: `${receiverUrl}/ok`, events: ["submission.submitted", "vote.cast"] });
    expect(r.status).toBe(201);
    hook = r.body;
    expect(hook.secret).toMatch(/^whsec_/);
    const list = await s.as(TOKENS.organizer).get("/api/events/evt_02/webhooks");
    expect(list.text).not.toContain(hook.secret);
  });

  it("refuses cloud-metadata targets, including mapped and dotted forms", async () => {
    for (const url of ["http://169.254.169.254/latest", "http://[::ffff:169.254.169.254]/latest", "http://metadata.google.internal./latest"]) {
      const r = await s.as(TOKENS.organizer).post("/api/events/evt_02/webhooks", { url, events: ["vote.cast"] });
      expect(r.body.code, url).toBe("UNSAFE_WEBHOOK_TARGET");
    }
  });

  it("delivers domain events with a verifiable HMAC-SHA256 signature", async () => {
    const p = s.as(TOKENS.participant);
    await p.put("/api/teams/team_02_01/submission", { answers: { qst_02_license: "MIT" } });
    expect((await p.post("/api/submissions/sub_02_01/submit")).status).toBe(200);
    expect(await deliverDue(s.db)).toBeGreaterThanOrEqual(1);
    const d = received.find((x) => x.headers["x-dogfood-event"] === "submission.submitted")!;
    expect(d).toBeDefined();
    const ts = d.headers["x-dogfood-timestamp"] as string;
    const expected = `sha256=${createHmac("sha256", hook.secret).update(`${ts}.${d.body}`).digest("hex")}`;
    expect(d.headers["x-dogfood-signature"]).toBe(expected);
    expect(JSON.parse(d.body)).toMatchObject({ type: "submission.submitted", eventId: "evt_02", data: { submissionId: "sub_02_01" } });
    const deliveries = await s.as(TOKENS.organizer).get(`/api/events/evt_02/webhooks/${hook.id}/deliveries`);
    expect(deliveries.body[0]).toMatchObject({ status: "delivered", attempts: 1, lastStatus: 204 });
  });

  it("retries failed deliveries with exponential backoff instead of dropping them", async () => {
    const bad = (await s.as(TOKENS.organizer).post("/api/events/evt_02/webhooks", { url: `${receiverUrl}/fail`, events: ["vote.cast"] })).body;
    await s.as(TOKENS.organizer).post(`/api/events/evt_02/webhooks/${bad.id}/test`);
    await deliverDue(s.db);
    const [row] = await s.sql("SELECT status, attempts, last_status, next_attempt_at > now() AS later FROM webhook_deliveries WHERE webhook_id = $1", [bad.id]);
    expect(row).toMatchObject({ status: "pending", attempts: 1, last_status: 500, later: true });
    // Not due yet, so a second pass does not hammer the receiver.
    const before = received.filter((x) => x.path === "/fail").length;
    await deliverDue(s.db);
    expect(received.filter((x) => x.path === "/fail").length).toBe(before);
  });
});

describe("Ed25519-signed records", () => {
  let recordId: string;

  it("publishes the verification key", async () => {
    const r = await s.anon.get("/.well-known/dogfood-signing-key.json");
    expect(r.body).toMatchObject({ algorithm: "Ed25519" });
    expect(r.body.publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
  });

  it("issued records verify independently with the published key", async () => {
    const list = await s.as(TOKENS.organizer).get("/api/events/evt_03/records");
    expect(list.body.length).toBeGreaterThan(0);
    const kinds = new Set(list.body.map((r: { kind: string }) => r.kind));
    for (const k of ["judge_participation", "participant", "winner"]) expect(kinds).toContain(k);
    recordId = list.body.find((r: { kind: string }) => r.kind === "winner").id;
    const rec = await s.anon.get(`/api/records/${recordId}`);
    expect(rec.body.valid).toBe(true);
    const ok = verify(null, Buffer.from(canonical(rec.body.payload)), createPublicKey(rec.body.publicKeyPem), Buffer.from(rec.body.signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("detects a tampered record", async () => {
    await s.sql(`UPDATE records SET payload = jsonb_set(payload, '{subject,name}', '"Mallory"') WHERE id = $1`, [recordId]);
    const rec = await s.anon.get(`/api/records/${recordId}`);
    expect(rec.body.valid).toBe(false);
  });

  it("participants see their own records", async () => {
    const r = await s.as(await s.tokenFor("usr_p01")).get("/api/me/records");
    expect(r.body.some((x: { kind: string; payload: { event: { id: string } } }) => x.kind === "participant" && x.payload.event.id === "evt_03")).toBe(true);
  });
});

describe("API-first", () => {
  it("serves an OpenAPI 3.1 document covering every mounted route", async () => {
    const r = await s.anon.get("/api/openapi.json");
    expect(r.body.openapi).toMatch(/^3\.1/);
    for (const def of allRoutes()) {
      const p = def.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      const op = r.body.paths[p]?.[def.method];
      expect(op, `${def.method.toUpperCase()} ${def.path}`).toBeDefined();
      expect(op.summary).toBeTruthy();
    }
    expect(Object.keys(r.body.paths).length).toBeGreaterThan(80);
  });

  it("exports public events as an iCalendar file; drafts stay private", async () => {
    const r = await s.anon.get("/api/events/evt_01/calendar.ics");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/calendar/);
    expect(r.headers.get("content-disposition")).toContain("sample-hack-2026.ics");
    expect(r.text).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(r.text).toContain("UID:evt_01-deadline@localhost:8000");
    expect(r.text).toContain("TRIGGER:-PT60M");
    expect(r.text).toContain("URL:http://localhost:8000/e/sample-hack-2026");
    expect((await s.anon.get("/api/events/evt_04/calendar.ics")).status).toBe(404);
  });

  it("round-trips an event through export → import", async () => {
    const exp = await s.as(TOKENS.organizer).get("/api/events/evt_01/export.json");
    expect(exp.status).toBe(200);
    expect(exp.headers.get("content-disposition")).toMatch(/attachment/);
    expect(exp.body.format).toBe("dogfood.event.v1");
    const bundle = { ...exp.body, event: { ...exp.body.event, slug: "sample-hack-clone", name: "Sample Hack Clone" } };
    const imp = await s.as(TOKENS.organizer).post("/api/events/import", bundle);
    expect(imp.status).toBe(201);
    const ev = await s.as(TOKENS.organizer).get(`/api/events/${imp.body.id}`);
    expect(ev.body.status).toBe("draft");
    expect(ev.body.tracks.map((t: { name: string }) => t.name)).toEqual(exp.body.tracks.map((t: { name: string }) => t.name));
    const crit = (await s.as(TOKENS.organizer).get(`/api/events/${imp.body.id}/criteria`)).body.criteria;
    expect(crit).toHaveLength(exp.body.criteria.length);
    const scoped = crit.find((c: { trackId: string | null }) => c.trackId !== null);
    expect(ev.body.tracks.find((t: { id: string }) => t.id === scoped.trackId).name).toBe("Applied AI");
  });

  it("bulk-registers participants from CSV and rejects bad rows as a whole", async () => {
    const bad = await s.as(TOKENS.organizer).post("/api/events/evt_02/registrations/import", { csv: "email,name\nnot-an-email,X\n" });
    expect(bad.body.code).toBe("CSV_INVALID");
    const ok = await s.as(TOKENS.organizer).post("/api/events/evt_02/registrations/import", {
      csv: "email,name,team\nnew.one@example.org,New One,Import Crew\nnew.two@example.org,New Two,Import Crew\n",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.created).toHaveLength(2);
    const [{ n }] = await s.sql("SELECT count(*)::int AS n FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.name = 'Import Crew'");
    expect(n).toBe(2);
  });

  it("the embeddable gallery feed is CORS-enabled and frameable; the app is not", async () => {
    const r = await s.anon.get("/api/embed/events/evt_01/gallery.json");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect((await s.anon.get("/api/embed/events/evt_04/gallery.json")).status).toBe(404);
    expect((await s.anon.get("/api/events")).headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("uploads", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082", "hex");
  const up = (body: Buffer, type: string, token: string | null = TOKENS.participant) =>
    s.anon.raw("/api/uploads", { method: "POST", headers: { "content-type": type, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: new Uint8Array(body) });

  it("stores real images and serves them with nosniff", async () => {
    const r = await up(PNG, "image/png");
    expect(r.status).toBe(201);
    const body = await r.json();
    const file = await s.anon.raw(body.url, {});
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects SVG and content that lies about its type", async () => {
    expect((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml")).status).toBe(415);
    expect((await up(Buffer.from("<html><script>alert(1)</script></html>"), "image/png")).status).toBe(415);
    expect((await up(PNG, "image/png", null)).status).toBe(401);
  });
});

describe("abuse controls & audit integrity", () => {
  it("rate-limits password guessing with Retry-After", async () => {
    let last: TestResponse<any> | null = null;
    for (let i = 0; i < 11; i++) last = await s.anon.post("/api/auth/login", { email: "admin@dogfood.local", password: `guess-${i}` });
    expect(last!.status).toBe(429);
    expect(last!.body.code).toBe("RATE_LIMITED");
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("the audit chain verifies, and editing any row breaks it at that row", async () => {
    const ok = await s.as(TOKENS.admin).get("/api/audit/verify");
    expect(ok.body.valid).toBe(true);
    const [{ seq }] = await s.sql("SELECT seq FROM audit_log ORDER BY seq OFFSET 5 LIMIT 1");
    // Even an attacker with owner access who switches off the append-only
    // trigger cannot edit history without the hash chain noticing.
    await s.sql(`BEGIN; SET LOCAL session_replication_role = replica;
                 UPDATE audit_log SET summary = summary || ' (edited)' WHERE seq = ${Number(seq)}; COMMIT;`);
    const bad = await s.as(TOKENS.admin).get("/api/audit/verify");
    expect(bad.body.valid).toBe(false);
    expect(bad.body.problems[0]).toEqual({ seq, problem: "hash mismatch" });
  });
});
