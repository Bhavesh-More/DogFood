import type { Tx } from "../db/pool";
import type { Actor } from "../http/context";

export interface AuditInput {
  eventId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * Append to the hash-chained audit trail. `seq`, `prev_hash`, `hash` and
 * `created_at` are assigned by the database trigger under an advisory lock,
 * so the chain is correct even with concurrent writers.
 */
export async function audit(tx: Tx, actor: Actor | null, entry: AuditInput): Promise<void> {
  await tx.query(
    `INSERT INTO audit_log (event_id, actor_id, action, entity_type, entity_id, summary, data, ip_hash, seq, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, '', '')`,
    [
      entry.eventId ?? null,
      actor?.user?.id ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.summary,
      JSON.stringify(entry.data ?? {}),
      actor?.ipHash ?? null,
    ],
  );
}
