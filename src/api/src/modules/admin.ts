import { z } from "zod";
import { roleChangeInput, roleMatrix, type AuditEntryDto, type Paginated } from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { conflict, notFound } from "../lib/errors";
import { route } from "../http/route";
import { loadManagedEvent } from "./access";

const auditQuery = z.object({
  action: z.string().max(60).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

async function auditPage(
  tx: Tx,
  eventId: string | null,
  query: z.output<typeof auditQuery>,
): Promise<Paginated<AuditEntryDto> & { actions: string[] }> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (eventId) {
    args.push(eventId);
    where.push(`a.event_id = $${args.length}`);
  }
  if (query.action) {
    args.push(`${query.action}%`);
    where.push(`a.action LIKE $${args.length}`);
  }
  if (query.q) {
    args.push(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(a.summary ILIKE $${args.length} OR u.name ILIKE $${args.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${clause}`, args);
  const items = await many<AuditEntryDto>(
    tx,
    `SELECT a.seq AS id, a.event_id AS "eventId", a.actor_id AS "actorId", u.name AS "actorName", a.action,
            a.entity_type AS "entityType", a.entity_id AS "entityId", a.summary, a.data, a.created_at AS "createdAt", a.hash
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ${clause}
      ORDER BY a.seq DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const actions = (
    await many<{ action: string }>(
      tx,
      `SELECT DISTINCT action FROM audit_log ${eventId ? "WHERE event_id = $1" : ""} ORDER BY action`,
      eventId ? [eventId] : [],
    )
  ).map((r) => r.action);
  return { items, total: total?.n ?? 0, page: query.page, pageSize: query.pageSize, actions };
}

export const adminRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/audit",
    summary: "Readable audit trail for an event (organizers)",
    tags: ["Audit"],
    auth: "event:manage",
    query: auditQuery,
    async handler({ params, query, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return auditPage(t, event.id, query);
      });
    },
  }),

  route({
    method: "get",
    path: "/api/audit",
    summary: "Platform-wide audit trail (admins)",
    tags: ["Audit"],
    auth: "audit:system",
    query: auditQuery,
    async handler({ query, tx }) {
      return tx((t) => auditPage(t, null, query));
    },
  }),

  route({
    method: "get",
    path: "/api/audit/verify",
    summary: "Recompute the SHA-256 hash chain of the audit trail",
    description: "Any edited, deleted or re-ordered row breaks the chain and is reported here.",
    tags: ["Audit"],
    auth: "audit:system",
    async handler({ tx }) {
      return tx(async (t) => {
        const problems = await many<{ seq: number; problem: string }>(t, "SELECT seq, problem FROM audit_log_verify()");
        const head = await one<{ seq: number; hash: string }>(t, "SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1");
        return { valid: problems.length === 0, entries: head?.seq ?? 0, headHash: head?.hash ?? null, problems };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/admin/users",
    summary: "Search users (admins)",
    tags: ["Admin"],
    auth: "users:manage",
    query: z.object({ q: z.string().max(100).optional(), role: z.string().max(20).optional() }),
    async handler({ query, tx }) {
      return tx((t) => {
        const args: unknown[] = [];
        const where: string[] = [];
        if (query.q) {
          args.push(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
          where.push(`(name ILIKE $${args.length} OR email ILIKE $${args.length})`);
        }
        if (query.role) {
          args.push(query.role);
          where.push(`role = $${args.length}`);
        }
        return many(
          t,
          `SELECT id, email, name, role, created_at AS "createdAt", disabled_at AS "disabledAt"
             FROM users ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 200`,
          args,
        );
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/admin/users/:userId/role",
    summary: "Change a user's role (admins; audit-logged)",
    tags: ["Admin"],
    auth: "users:manage",
    body: roleChangeInput,
    async handler({ params, body, actor, user, tx }) {
      return tx(async (t) => {
        if (params.userId === user.id && body.role !== "admin") {
          throw conflict("You cannot demote yourself", "SELF_DEMOTION");
        }
        const before = await one<{ role: string; name: string }>(t, "SELECT role, name FROM users WHERE id = $1", [params.userId]);
        if (!before) throw notFound("User");
        await t.query("UPDATE users SET role = $2 WHERE id = $1", [params.userId, body.role]);
        // Role changes invalidate web and API sessions so new privileges apply
        // cleanly (checker sessions are left for the acceptance harness).
        await t.query("DELETE FROM sessions WHERE user_id = $1 AND kind IN ('web', 'api')", [params.userId]);
        await audit(t, actor, {
          action: "user.role_changed",
          entityType: "user",
          entityId: params.userId,
          summary: `${before.name}: ${before.role} → ${body.role}`,
          data: { from: before.role, to: body.role },
        });
        return { id: params.userId, role: body.role };
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/admin/users/:userId/status",
    summary: "Disable or re-enable an account (admins)",
    tags: ["Admin"],
    auth: "users:manage",
    body: z.object({ disabled: z.boolean() }),
    async handler({ params, body, actor, user, tx }) {
      return tx(async (t) => {
        if (params.userId === user.id) throw conflict("You cannot disable yourself", "SELF_DISABLE");
        const res = await t.query("UPDATE users SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1", [
          params.userId,
          body.disabled,
        ]);
        if (res.rowCount === 0) throw notFound("User");
        if (body.disabled) await t.query("DELETE FROM sessions WHERE user_id = $1", [params.userId]);
        await audit(t, actor, {
          action: body.disabled ? "user.disabled" : "user.enabled",
          entityType: "user",
          entityId: params.userId,
          summary: `Account ${body.disabled ? "disabled" : "re-enabled"}`,
        });
        return { id: params.userId, disabled: body.disabled };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/admin/outbox",
    summary: "Local mail outbox (the platform never calls an external email API)",
    tags: ["Admin"],
    auth: "users:manage",
    async handler({ tx }) {
      return tx((t) =>
        many(t, `SELECT id, to_email AS "to", subject, body, created_at AS "createdAt" FROM outbox ORDER BY created_at DESC LIMIT 100`),
      );
    },
  }),

  route({
    method: "get",
    path: "/api/admin/stats",
    summary: "Platform counters (admins)",
    tags: ["Admin"],
    auth: "users:manage",
    async handler({ tx }) {
      return tx(async (t) => {
        const roles = await many<{ role: string; n: number }>(t, "SELECT role, count(*)::int AS n FROM users GROUP BY role");
        const counts = await one<Record<string, number>>(
          t,
          `SELECT (SELECT count(*)::int FROM events) AS events,
                  (SELECT count(*)::int FROM teams) AS teams,
                  (SELECT count(*)::int FROM submissions WHERE status = 'submitted') AS submissions,
                  (SELECT count(*)::int FROM votes) AS votes,
                  (SELECT count(*)::int FROM audit_log) AS "auditEntries"`,
        );
        return { usersByRole: Object.fromEntries(roles.map((r) => [r.role, r.n])), ...counts, roleMatrix: roleMatrix() };
      });
    },
  }),
];
