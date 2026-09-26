import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { sha256Hex, signPayload, verifyPayload, type SigningKeys } from "../lib/crypto";
import { conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor, AppContext } from "../http/context";
import { route } from "../http/route";
import { loadManagedEvent, type EventRow } from "./access";

export type RecordKind = "judge_participation" | "participant" | "winner";

export interface RecordPayload {
  v: 1;
  id: string;
  kind: RecordKind;
  issuer: { name: string; url: string; keyId: string };
  event: { id: string; slug: string; name: string };
  subject: { userId: string; name: string };
  details: Record<string, string | number | null>;
  issuedAt: string;
}

function publicKeyInfo(app: AppContext) {
  return { keyId: app.keys.keyId, algorithm: "Ed25519", publicKeyPem: app.keys.publicKeyPem };
}

export interface IssueContext {
  keys: SigningKeys;
  publicUrl: string;
  now: number;
}

/** Sign (or refresh) judge-participation, participant and winner records for an event. */
export async function issueRecords(t: Tx, ctx: IssueContext, event: EventRow, actor: Actor | null = null) {
  const judges = await many<{ id: string; name: string; reviews: number; tracks: string | null }>(
    t,
    `SELECT u.id, u.name, count(a.id)::int AS reviews,
            (SELECT string_agg(tr.name, ', ') FROM tracks tr WHERE tr.id = ANY (j.track_ids)) AS tracks
       FROM event_judges j JOIN users u ON u.id = j.user_id
       JOIN assignments a ON a.event_id = j.event_id AND a.judge_id = j.user_id AND a.status = 'submitted'
      WHERE j.event_id = $1 GROUP BY u.id, j.track_ids`,
    [event.id],
  );
  const participants = await many<{ id: string; name: string; team: string; title: string; submission_id: string; rank: number | null }>(
    t,
    `SELECT u.id, u.name, tm.name AS team, s.title, s.id AS submission_id, pr.rank
       FROM submissions s JOIN teams tm ON tm.id = s.team_id
       JOIN team_members m ON m.team_id = s.team_id JOIN users u ON u.id = m.user_id
       LEFT JOIN published_results pr ON pr.submission_id = s.id
      WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'`,
    [event.id],
  );
  if (judges.length === 0 && participants.length === 0) throw conflict("Nothing to certify yet", "NOTHING_TO_ISSUE");
  const issuedAt = new Date(ctx.now).toISOString();
  const keyId = sha256Hex(ctx.keys.publicKeyPem).slice(0, 16);
  const base = {
    v: 1 as const,
    issuer: { name: "Dogfood Portal", url: ctx.publicUrl, keyId },
    event: { id: event.id, slug: event.slug, name: event.name },
    issuedAt,
  };
  const drafts: { userId: string; kind: RecordKind; payload: Omit<RecordPayload, "id"> }[] = [];
  for (const j of judges) {
    drafts.push({
      userId: j.id,
      kind: "judge_participation",
      payload: { ...base, kind: "judge_participation", subject: { userId: j.id, name: j.name }, details: { reviewsCompleted: j.reviews, tracks: j.tracks ?? "All tracks" } },
    });
  }
  for (const p of participants) {
    drafts.push({
      userId: p.id,
      kind: "participant",
      payload: { ...base, kind: "participant", subject: { userId: p.id, name: p.name }, details: { team: p.team, project: p.title, submissionId: p.submission_id } },
    });
    if (p.rank !== null && p.rank <= 3) {
      drafts.push({
        userId: p.id,
        kind: "winner",
        payload: { ...base, kind: "winner", subject: { userId: p.id, name: p.name }, details: { team: p.team, project: p.title, rank: p.rank } },
      });
    }
  }
  let issued = 0;
  for (const d of drafts) {
    const existing = await one<{ id: string }>(t, "SELECT id FROM records WHERE event_id = $1 AND user_id = $2 AND kind = $3", [event.id, d.userId, d.kind]);
    const id = existing?.id ?? newId("rec");
    const payload: RecordPayload = { ...d.payload, id };
    const signature = signPayload(ctx.keys, payload);
    await t.query(
      `INSERT INTO records (id, event_id, user_id, kind, payload, signature) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, user_id, kind) DO UPDATE SET payload = EXCLUDED.payload, signature = EXCLUDED.signature, revoked_at = NULL`,
      [id, event.id, d.userId, d.kind, JSON.stringify(payload), signature],
    );
    issued += 1;
  }
  await audit(t, actor, {
    eventId: event.id,
    action: "records.issued",
    entityType: "event",
    entityId: event.id,
    summary: `${issued} signed records issued (${judges.length} judges, ${participants.length} participants)`,
  });
  return { issued, judges: judges.length, participants: participants.length };
}

export const recordRoutes = [
  route({
    method: "post",
    path: "/api/events/:eventId/records/issue",
    summary: "Issue signed judge-participation records and participant/winner certificates",
    description:
      "Each record is canonical JSON signed with the platform's Ed25519 key. Anyone can verify it offline with the " +
      "public key from /.well-known/dogfood-signing-key.json. Re-issuing refreshes existing records.",
    tags: ["Records"],
    auth: "event:manage",
    status: 201,
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return issueRecords(t, { keys: app.keys, publicUrl: app.config.publicUrl, now: app.now() }, event, actor);
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/records",
    summary: "Records issued for an event (organizers)",
    tags: ["Records"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT r.id, r.kind, u.name, r.created_at AS "createdAt", r.revoked_at AS "revokedAt"
             FROM records r LEFT JOIN users u ON u.id = r.user_id WHERE r.event_id = $1 ORDER BY r.kind, u.name`,
          [event.id],
        );
      });
    },
  }),

  route({
    method: "get",
    path: "/api/me/records",
    summary: "Your signed records and certificates",
    tags: ["Records"],
    auth: "user",
    async handler({ user, tx }) {
      return tx((t) =>
        many(
          t,
          `SELECT r.id, r.kind, r.payload, r.created_at AS "createdAt" FROM records r
            WHERE r.user_id = $1 AND r.revoked_at IS NULL ORDER BY r.created_at DESC`,
          [user.id],
        ),
      );
    },
  }),

  route({
    method: "get",
    path: "/api/records/:recordId",
    summary: "Public verification of a signed record",
    description: "Returns the payload, its signature, the public key and the server-side verification result.",
    tags: ["Records"],
    auth: "public",
    async handler({ app, params, tx }) {
      const rec = await tx((t) =>
        one<{ payload: RecordPayload; signature: string; revoked_at: string | null }>(
          t,
          "SELECT payload, signature, revoked_at FROM records WHERE id = $1",
          [params.recordId],
        ),
      );
      if (!rec) throw notFound("Record");
      return {
        payload: rec.payload,
        signature: rec.signature,
        ...publicKeyInfo(app),
        valid: verifyPayload(app.keys.publicKey, rec.payload, rec.signature),
        revoked: rec.revoked_at !== null,
        howToVerify:
          "Canonicalise `payload` as JSON with lexicographically sorted keys and no whitespace, then verify the base64url `signature` with the Ed25519 public key.",
      };
    },
  }),

  route({
    method: "get",
    path: "/.well-known/dogfood-signing-key.json",
    summary: "Public Ed25519 key used to sign records",
    tags: ["Records"],
    auth: "public",
    async handler({ app }) {
      return publicKeyInfo(app);
    },
  }),
];
