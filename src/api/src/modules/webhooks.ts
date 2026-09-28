import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { WEBHOOK_EVENTS, webhookInput } from "@dogfood/core";
import { many, one, type Db, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { hmacHex, randomToken } from "../lib/crypto";
import { notFound, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import type { WebhookSink } from "../http/context";
import { route } from "../http/route";
import { loadManagedEvent } from "./access";

const MAX_ATTEMPTS = 6;

/** Enqueue deliveries inside the caller's transaction (outbox pattern). */
export function createWebhookSink(db: Db): WebhookSink {
  const insert = async (tx: Tx, eventId: string, type: string, data: Record<string, unknown>) => {
    const hooks = await many<{ id: string }>(
      tx,
      "SELECT id FROM webhooks WHERE event_id = $1 AND active AND $2 = ANY (events)",
      [eventId, type],
    );
    for (const h of hooks) {
      const id = newId("dlv");
      const payload = { id, type, eventId, createdAt: new Date().toISOString(), data };
      await tx.query(
        "INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload) VALUES ($1, $2, $3, $4)",
        [id, h.id, type, JSON.stringify(payload)],
      );
    }
  };
  return {
    async emit(eventId, type, data, tx) {
      if (tx) await insert(tx, eventId, type, data);
      else await db.system((t) => insert(t, eventId, type, data));
    },
  };
}

/** The IPv4 address behind an IPv4-mapped IPv6 form, dotted or hex. */
function mappedV4(v: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v);
  if (dotted) return dotted[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True for cloud-metadata / link-local addresses, including IPv4-mapped IPv6. */
function isBlockedAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "fd00:ec2::254") return true; // AWS IPv6 IMDS
  const v4 = isIP(ip) === 4 ? ip : mappedV4(v);
  if (v4) return v4.startsWith("169.254.");
  // fe80::/10 link-local
  return isIP(ip) === 6 && /^fe[89ab]/.test(v);
}

/** Block cloud metadata endpoints; organizers are trusted to target their own LAN. */
async function assertSafeTarget(url: string) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "metadata.google.internal") {
    throw unprocessable("That webhook target is not allowed", undefined, "UNSAFE_WEBHOOK_TARGET");
  }
  let addresses: string[];
  try {
    addresses = (await lookup(host, { all: true })).map((r) => r.address);
  } catch {
    addresses = isIP(host) ? [host] : [];
  }
  if (addresses.some(isBlockedAddress)) {
    throw unprocessable("That webhook target is not allowed", undefined, "UNSAFE_WEBHOOK_TARGET");
  }
}

export function signBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${hmacHex(secret, `${timestamp}.${body}`)}`;
}

const LEASE_SECONDS = 60;

/**
 * One pass of the delivery worker: POST due deliveries with retries.
 * Rows are claimed by pushing `next_attempt_at` forward in the same statement
 * that selects them (a lease), so concurrent workers never double-send; a
 * worker that dies mid-flight simply lets the lease expire.
 */
export async function deliverDue(db: Db, fetchImpl: typeof fetch = fetch, limit = 20): Promise<number> {
  const due = await db.system((t) =>
    many<{ id: string; webhook_id: string; event_type: string; payload: unknown; attempts: number; url: string; secret: string }>(
      t,
      `WITH claimed AS (
         UPDATE webhook_deliveries SET next_attempt_at = now() + make_interval(secs => $2)
          WHERE id IN (
            SELECT id FROM webhook_deliveries
             WHERE status = 'pending' AND next_attempt_at <= now()
             ORDER BY next_attempt_at LIMIT $1
             FOR UPDATE SKIP LOCKED)
         RETURNING id, webhook_id, event_type, payload, attempts)
       SELECT c.id, c.webhook_id, c.event_type, c.payload, c.attempts, w.url, w.secret
         FROM claimed c JOIN webhooks w ON w.id = c.webhook_id`,
      [limit, LEASE_SECONDS],
    ),
  );
  // Deliver concurrently: one slow or unreachable receiver must not delay the others.
  await Promise.allSettled(
    due.map(async (d) => {
      const body = JSON.stringify(d.payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      let status: number | null = null;
      let error: string | null = null;
      try {
        const res = await fetchImpl(d.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "dogfood-webhooks/1",
            "x-dogfood-event": d.event_type,
            "x-dogfood-delivery": d.id,
            "x-dogfood-timestamp": timestamp,
            "x-dogfood-signature": signBody(d.secret, timestamp, body),
          },
          body,
          // Never follow redirects: a 3xx to a metadata address would bypass the target check.
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
        });
        status = res.status;
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (err) {
        error = (err as Error).message.slice(0, 300);
      }
      const attempts = d.attempts + 1;
      await db.system((t) =>
        error === null
          ? t.query(
              "UPDATE webhook_deliveries SET status = 'delivered', attempts = $2, last_status = $3, last_error = NULL, delivered_at = now() WHERE id = $1",
              [d.id, attempts, status],
            )
          : t.query(
              `UPDATE webhook_deliveries
                  SET attempts = $2::int, last_status = $3::int, last_error = $4::text,
                      status = CASE WHEN $2::int >= $5::int THEN 'failed' ELSE 'pending' END,
                      next_attempt_at = now() + make_interval(secs => power(2, $2::int) * 5)
                WHERE id = $1`,
              [d.id, attempts, status, error, MAX_ATTEMPTS],
            ),
      );
    }),
  );
  return due.length;
}

export function startWebhookWorker(db: Db, intervalMs = 2000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    deliverDue(db)
      .catch((err) => console.error("[webhooks] worker error:", (err as Error).message))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export const webhookRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/webhooks",
    summary: "List webhooks (secrets are never returned)",
    tags: ["Webhooks"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT w.id, w.url, w.events, w.active, w.created_at AS "createdAt",
                  (SELECT count(*)::int FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'delivered') AS delivered,
                  (SELECT count(*)::int FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed,
                  (SELECT count(*)::int FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending') AS pending
             FROM webhooks w WHERE w.event_id = $1 ORDER BY w.created_at`,
          [event.id],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/webhooks",
    summary: "Register a webhook; the signing secret is returned once",
    description:
      "Deliveries carry X-Dogfood-Signature: sha256=HMAC_SHA256(secret, `${X-Dogfood-Timestamp}.${body}`). " +
      `Events: ${WEBHOOK_EVENTS.join(", ")}.`,
    tags: ["Webhooks"],
    auth: "event:manage",
    body: webhookInput,
    status: 201,
    async handler({ params, body, actor, tx }) {
      await assertSafeTarget(body.url);
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const id = newId("hook");
        const secret = `whsec_${randomToken(24)}`;
        await t.query("INSERT INTO webhooks (id, event_id, url, secret, events, active, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
          id,
          event.id,
          body.url,
          secret,
          body.events,
          body.active,
          actor.user!.id,
        ]);
        await audit(t, actor, { eventId: event.id, action: "webhook.created", entityType: "webhook", entityId: id, summary: `Webhook → ${body.url}`, data: { events: body.events } });
        return { id, url: body.url, events: body.events, active: body.active, secret };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/webhooks/:webhookId",
    summary: "Delete a webhook",
    tags: ["Webhooks"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const res = await t.query("DELETE FROM webhooks WHERE id = $1 AND event_id = $2", [params.webhookId, event.id]);
        if (res.rowCount === 0) throw notFound("Webhook");
        await audit(t, actor, { eventId: event.id, action: "webhook.deleted", entityType: "webhook", entityId: params.webhookId, summary: "Webhook deleted" });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/webhooks/:webhookId/deliveries",
    summary: "Recent deliveries for a webhook",
    tags: ["Webhooks"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const hook = await one(t, "SELECT 1 FROM webhooks WHERE id = $1 AND event_id = $2", [params.webhookId, event.id]);
        if (!hook) throw notFound("Webhook");
        return many(
          t,
          `SELECT id, event_type AS "eventType", status, attempts, last_status AS "lastStatus", last_error AS "lastError",
                  created_at AS "createdAt", delivered_at AS "deliveredAt", next_attempt_at AS "nextAttemptAt"
             FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 50`,
          [params.webhookId],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/webhooks/:webhookId/test",
    summary: "Queue a `ping` delivery",
    tags: ["Webhooks"],
    auth: "event:manage",
    status: 202,
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const hook = await one(t, "SELECT 1 FROM webhooks WHERE id = $1 AND event_id = $2", [params.webhookId, event.id]);
        if (!hook) throw notFound("Webhook");
        const id = newId("dlv");
        const payload = { id, type: "ping", eventId: event.id, createdAt: new Date().toISOString(), data: {} };
        await t.query("INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload) VALUES ($1, $2, 'ping', $3)", [
          id,
          params.webhookId,
          JSON.stringify(payload),
        ]);
        return { deliveryId: id };
      });
    },
  }),
];
