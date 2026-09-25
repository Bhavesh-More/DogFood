import type { Request, Response } from "express";
import { z } from "zod";
import {
  areVoteTalliesVisible,
  commentInput,
  email as emailSchema,
  emailCodeRequest,
  isVotingOpen,
  voteInput,
  type CommentDto,
} from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { hmacHex, numericCode, randomToken, safeEqual } from "../lib/crypto";
import { HttpError, conflict, forbidden, notFound, unauthorized, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor, AppContext } from "../http/context";
import { DEVICE_COOKIE, VOTER_COOKIE, parseCookies, setCookie } from "../http/middleware";
import { LIMITS } from "../http/rate-limit";
import { route } from "../http/route";
import { findEvent, isEventOrganizer, loadManagedEvent, loadVisibleEvent, teamOf, type EventRow } from "./access";
import { eventTimes } from "./events";
import { loadSubmission } from "./submissions";

/** Max distinct open-mode voters per IP before further voters are flagged (NAT/household allowance). */
const OPEN_VOTERS_PER_IP = 3;
const CODE_TTL_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;

/**
 * Canonical email for duplicate detection: lowercase and strip "+tag"
 * sub-addressing, so ada+1@x.org and ada+2@x.org are the same voter.
 */
export function canonicalEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

function signVoterToken(secret: string, eventId: string, emailHash: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ e: eventId, h: emailHash, x: expiresAt })).toString("base64url");
  return `${payload}.${hmacHex(secret, `voter:${payload}`)}`;
}

function readVoterToken(secret: string, token: string | undefined, eventId: string, now: number): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, hmacHex(secret, `voter:${payload}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; h: string; x: number };
    return data.e === eventId && data.x > now ? data.h : null;
  } catch {
    return null;
  }
}

interface VoterIdentity {
  key: string;
  userId: string | null;
  emailHash: string | null;
}

/** Resolve who is voting under the event's access mode; may set the device cookie. */
function resolveVoter(app: AppContext, event: EventRow, actor: Actor, req: Request, res: Response, create: boolean): VoterIdentity | null {
  const cookies = parseCookies(req.get("cookie"));
  switch (event.voting_mode) {
    case "authenticated":
      if (!actor.user) return null;
      return { key: `u:${actor.user.id}`, userId: actor.user.id, emailHash: null };
    case "email": {
      const h = readVoterToken(app.secret, cookies[VOTER_COOKIE], event.id, app.now());
      return h ? { key: `e:${h}`, userId: actor.user?.id ?? null, emailHash: h } : null;
    }
    case "open": {
      let device = cookies[DEVICE_COOKIE];
      if (!device || !/^[A-Za-z0-9_-]{16,64}$/.test(device)) {
        if (!create) return null;
        device = randomToken(18);
        setCookie(res, DEVICE_COOKIE, device, { maxAgeSeconds: 365 * 86_400, secure: app.config.cookieSecure });
      }
      return { key: `d:${hmacHex(app.secret, `device:${device}`).slice(0, 32)}`, userId: actor.user?.id ?? null, emailHash: null };
    }
    default:
      return null;
  }
}

async function allocation(tx: Tx, eventId: string, voterKey: string) {
  const rows = await many<{ submission_id: string; votes: number; status: string }>(
    tx,
    "SELECT submission_id, votes, status FROM votes WHERE event_id = $1 AND voter_key = $2",
    [eventId, voterKey],
  );
  return rows;
}

function budgetState(event: EventRow, rows: { votes: number }[]) {
  const spent =
    event.voting_style === "quadratic" ? rows.reduce((a, r) => a + r.votes * r.votes, 0) : rows.length;
  return { budget: event.vote_budget, spent, remaining: event.vote_budget - spent };
}

async function loadCommentable(tx: Tx, actor: Actor, submissionId: string) {
  const sub = await loadSubmission(tx, submissionId);
  if (!sub) throw notFound("Submission");
  const event = (await findEvent(tx, sub.event_id))!;
  const visible = sub.status === "submitted" && event.status !== "draft" && sub.eligibility !== "ineligible";
  if (!visible && !(await isEventOrganizer(tx, actor.user, event.id))) throw notFound("Submission");
  return { sub, event };
}

export const votingRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/votes/me",
    summary: "Your voting state: access mode, budget and allocation",
    tags: ["Voting"],
    auth: "public",
    async handler({ app, params, actor, req, res, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const voter = resolveVoter(app, event, actor, req, res, false);
        const rows = voter ? await allocation(t, event.id, voter.key) : [];
        return {
          mode: event.voting_mode,
          style: event.voting_style,
          votingOpen: isVotingOpen(eventTimes(event), app.now()),
          opensAt: event.voting_opens_at,
          closesAt: event.voting_closes_at,
          identified: voter !== null,
          ...budgetState(event, rows),
          allocation: Object.fromEntries(rows.map((r) => [r.submission_id, r.votes])),
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/votes/email-code",
    summary: "Email-gated voting: send a one-time code (delivered to the local outbox)",
    tags: ["Voting"],
    auth: "public",
    body: emailCodeRequest,
    status: 202,
    rateLimit: { bucket: "email-code", spec: LIMITS.emailCode },
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        if (event.voting_mode !== "email") throw conflict("This event does not use email-gated voting", "WRONG_VOTING_MODE");
        if (!isVotingOpen(eventTimes(event), app.now())) throw forbidden("Voting is not open", "VOTING_CLOSED");
        const canonical = canonicalEmail(body.email);
        const emailHash = hmacHex(app.secret, `email:${canonical}`).slice(0, 32);
        const code = numericCode(6);
        await t.query("DELETE FROM vote_email_codes WHERE event_id = $1 AND email_hash = $2 AND verified_at IS NULL", [event.id, emailHash]);
        await t.query(
          `INSERT INTO vote_email_codes (id, event_id, email_hash, code_hash, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
          [newId("vcode"), event.id, emailHash, hmacHex(app.secret, `code:${emailHash}:${code}`), CODE_TTL_MINUTES],
        );
        await t.query("INSERT INTO outbox (id, to_email, subject, body) VALUES ($1, $2, $3, $4)", [
          newId("mail"),
          body.email,
          `Your voting code for ${event.name}`,
          `Your one-time code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
        ]);
        await audit(t, actor, { eventId: event.id, action: "vote.code_requested", entityType: "voter", entityId: emailHash.slice(0, 12), summary: "Voting code requested" });
        return { sent: true, expiresInMinutes: CODE_TTL_MINUTES, delivery: "local-outbox" };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/votes/verify",
    summary: "Email-gated voting: verify the code and receive a voter cookie",
    tags: ["Voting"],
    auth: "public",
    body: z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, "6 digits") }),
    rateLimit: { bucket: "vote", spec: LIMITS.vote },
    async handler({ app, params, body, actor, res, tx }) {
      const result = await tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const emailHash = hmacHex(app.secret, `email:${canonicalEmail(body.email)}`).slice(0, 32);
        const row = await one<{ id: string; code_hash: string; attempts: number; expires_at: string }>(
          t,
          `SELECT id, code_hash, attempts, expires_at FROM vote_email_codes
            WHERE event_id = $1 AND email_hash = $2 AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [event.id, emailHash],
        );
        if (!row || Date.parse(row.expires_at) <= app.now()) throw new HttpError(410, "CODE_EXPIRED", "Request a new code");
        if (row.attempts >= CODE_MAX_ATTEMPTS) throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes; request a new one");
        if (!safeEqual(row.code_hash, hmacHex(app.secret, `code:${emailHash}:${body.code}`))) {
          await t.query("UPDATE vote_email_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
          return { ok: false as const };
        }
        await t.query("UPDATE vote_email_codes SET verified_at = now() WHERE id = $1", [row.id]);
        return { ok: true as const, event, emailHash };
      });
      if (!result.ok) throw unauthorized("Wrong code");
      const expires = Date.parse(result.event.voting_closes_at ?? new Date(app.now() + 86_400_000).toISOString());
      setCookie(res, VOTER_COOKIE, signVoterToken(app.secret, result.event.id, result.emailHash, expires), {
        maxAgeSeconds: Math.max(60, Math.floor((expires - app.now()) / 1000)),
        secure: app.config.cookieSecure,
      });
      return { verified: true };
    },
  }),

  route({
    method: "put",
    path: "/api/submissions/:submissionId/vote",
    summary: "Cast or change your community vote (votes = 0 withdraws)",
    description:
      "Single style: one vote per project, up to the event budget of projects. Quadratic: v votes cost v² credits. " +
      "Duplicate detection is per voter identity; open-link voters beyond 3 per IP are recorded as flagged and not counted.",
    tags: ["Voting"],
    auth: "public",
    body: voteInput,
    rateLimit: { bucket: "vote", spec: LIMITS.vote },
    async handler({ app, params, body, actor, req, res, tx }) {
      return tx(async (t) => {
        const sub = await loadSubmission(t, params.submissionId!);
        if (!sub || sub.status !== "submitted" || sub.eligibility === "ineligible") throw notFound("Submission");
        const event = (await findEvent(t, sub.event_id))!;
        if (event.voting_mode === "off") throw forbidden("Community voting is disabled for this event", "VOTING_DISABLED");
        if (!isVotingOpen(eventTimes(event), app.now())) throw forbidden("The voting window is closed", "VOTING_CLOSED");
        if (actor.user && (actor.user.role === "organizer" || actor.user.role === "admin")) {
          throw forbidden("Organizers cannot vote", "ORGANIZER_CANNOT_VOTE");
        }
        const voter = resolveVoter(app, event, actor, req, res, true);
        if (!voter) {
          throw event.voting_mode === "email"
            ? new HttpError(401, "EMAIL_VERIFICATION_REQUIRED", "Verify your email to vote")
            : unauthorized("Log in to vote");
        }
        if (actor.user && (await teamOf(t, actor.user.id, event.id)) === sub.team_id) {
          throw forbidden("You cannot vote for your own team", "OWN_TEAM");
        }
        const votes = event.voting_style === "single" ? Math.min(body.votes, 1) : body.votes;
        // Serialise this voter's requests so budget checks cannot race.
        await t.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${event.id}:${voter.key}`]);
        const rows = await allocation(t, event.id, voter.key);
        const others = rows.filter((r) => r.submission_id !== sub.id);
        const next = votes > 0 ? [...others, { submission_id: sub.id, votes, status: "counted" }] : others;
        const state = budgetState(event, next);
        if (state.spent > state.budget) {
          throw unprocessable(
            event.voting_style === "quadratic"
              ? `That costs ${state.spent} credits; you have ${state.budget}`
              : `You can back at most ${state.budget} projects`,
            { ...state },
            "BUDGET_EXCEEDED",
          );
        }
        if (votes === 0) {
          await t.query("DELETE FROM votes WHERE event_id = $1 AND voter_key = $2 AND submission_id = $3", [event.id, voter.key, sub.id]);
        } else {
          // Sybil heuristic for open-link voting: too many distinct voters behind one IP.
          let status = "counted";
          let reason: string | null = null;
          if (event.voting_mode === "open") {
            const distinct = await one<{ n: number; mine: boolean }>(
              t,
              `SELECT count(DISTINCT voter_key)::int AS n, bool_or(voter_key = $3) AS mine
                 FROM votes WHERE event_id = $1 AND ip_hash = $2`,
              [event.id, actor.ipHash, voter.key],
            );
            if (!distinct?.mine && (distinct?.n ?? 0) >= OPEN_VOTERS_PER_IP) {
              status = "flagged";
              reason = `more than ${OPEN_VOTERS_PER_IP} voters from one IP`;
            }
          }
          const existing = rows.find((r) => r.submission_id === sub.id);
          await t.query(
            `INSERT INTO votes (id, event_id, submission_id, voter_key, user_id, email_hash, ip_hash, ua_hash, votes, status, flag_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (event_id, voter_key, submission_id)
             DO UPDATE SET votes = EXCLUDED.votes, updated_at = now()`,
            [newId("vote"), event.id, sub.id, voter.key, voter.userId, voter.emailHash, actor.ipHash, actor.uaHash, votes, existing?.status ?? status, existing ? null : reason],
          );
          if (!existing && status === "flagged") {
            await audit(t, actor, { eventId: event.id, action: "vote.flagged", entityType: "vote", entityId: sub.id, summary: `Vote flagged: ${reason}`, data: { voter: voter.key.slice(0, 10) } });
          }
        }
        await audit(t, actor, {
          eventId: event.id,
          action: votes === 0 ? "vote.withdrawn" : "vote.cast",
          entityType: "vote",
          entityId: sub.id,
          summary: votes === 0 ? "Vote withdrawn" : `Vote cast (${votes})`,
          data: { voter: voter.key.slice(0, 10), votes, mode: event.voting_mode },
        });
        if (votes > 0) await app.webhooks.emit(event.id, "vote.cast", { submissionId: sub.id }, t);
        const after = await allocation(t, event.id, voter.key);
        return { ...budgetState(event, after), allocation: Object.fromEntries(after.map((r) => [r.submission_id, r.votes])) };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/votes/summary",
    summary: "Vote tallies — organizers always; everyone else only after the window closes",
    tags: ["Voting"],
    auth: "public",
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const organizer = await isEventOrganizer(t, actor.user, event.id);
        if (!organizer && !areVoteTalliesVisible(eventTimes(event), app.now())) {
          throw forbidden("Tallies are hidden until voting closes", "RESULTS_HIDDEN");
        }
        const tallies = await many<{ submissionId: string; title: string; counted: number; flagged: number; voters: number }>(
          t,
          `SELECT s.id AS "submissionId", s.title,
                  coalesce(sum(v.votes) FILTER (WHERE v.status = 'counted'), 0)::int AS counted,
                  coalesce(sum(v.votes) FILTER (WHERE v.status = 'flagged'), 0)::int AS flagged,
                  count(DISTINCT v.voter_key)::int AS voters
             FROM submissions s LEFT JOIN votes v ON v.submission_id = s.id
            WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'
            GROUP BY s.id ORDER BY counted DESC, s.title`,
          [event.id],
        );
        return {
          mode: event.voting_mode,
          style: event.voting_style,
          tallies: organizer ? tallies : tallies.map(({ flagged: _f, ...rest }) => rest),
        };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/votes",
    summary: "Individual votes with anti-abuse signals (organizers)",
    tags: ["Voting"],
    auth: "event:manage",
    query: z.object({ status: z.enum(["counted", "flagged", "rejected"]).optional() }),
    async handler({ params, query, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT v.id, v.submission_id AS "submissionId", s.title, left(v.voter_key, 12) AS voter,
                  left(v.ip_hash, 10) AS "ipHash", v.votes, v.status, v.flag_reason AS "flagReason",
                  v.created_at AS "createdAt",
                  (SELECT count(DISTINCT v2.voter_key)::int FROM votes v2 WHERE v2.event_id = v.event_id AND v2.ip_hash = v.ip_hash) AS "votersOnIp"
             FROM votes v JOIN submissions s ON s.id = v.submission_id
            WHERE v.event_id = $1 ${query.status ? "AND v.status = $2" : ""}
            ORDER BY v.created_at DESC LIMIT 500`,
          query.status ? [event.id, query.status] : [event.id],
        );
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/votes/:voteId",
    summary: "Organizer override of a vote's status (audit-logged)",
    tags: ["Voting"],
    auth: "event:manage",
    body: z.object({ status: z.enum(["counted", "flagged", "rejected"]), reason: z.string().trim().min(3).max(300) }),
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const vote = await one<{ event_id: string; status: string }>(t, "SELECT event_id, status FROM votes WHERE id = $1", [params.voteId]);
        if (!vote) throw notFound("Vote");
        await loadManagedEvent(t, actor, vote.event_id);
        await t.query("UPDATE votes SET status = $2, flag_reason = $3, updated_at = now() WHERE id = $1", [params.voteId, body.status, body.reason]);
        await audit(t, actor, {
          eventId: vote.event_id,
          action: "vote.override",
          entityType: "vote",
          entityId: params.voteId,
          summary: `Vote ${vote.status} → ${body.status}: ${body.reason}`,
          data: { from: vote.status, to: body.status, reason: body.reason },
        });
        return { id: params.voteId, status: body.status };
      });
    },
  }),

  // ------------------------------------------------------------- comments
  route({
    method: "get",
    path: "/api/submissions/:submissionId/comments",
    summary: "Comments on a project",
    tags: ["Comments"],
    auth: "public",
    async handler({ params, actor, tx }) {
      return tx(async (t): Promise<CommentDto[]> => {
        const { event } = await loadCommentable(t, actor, params.submissionId!);
        const organizer = await isEventOrganizer(t, actor.user, event.id);
        return many<CommentDto>(
          t,
          `SELECT c.id, c.submission_id AS "submissionId", u.name AS "authorName",
                  CASE WHEN c.hidden_at IS NULL OR $2 THEN c.body ELSE '' END AS body,
                  c.created_at AS "createdAt", (c.hidden_at IS NOT NULL) AS hidden
             FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.submission_id = $1 AND (c.hidden_at IS NULL OR $2)
            ORDER BY c.created_at`,
          [params.submissionId, organizer],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/submissions/:submissionId/comments",
    summary: "Comment on a project",
    tags: ["Comments"],
    auth: "comment:write",
    body: commentInput,
    status: 201,
    rateLimit: { bucket: "comment", spec: LIMITS.comment },
    async handler({ params, body, actor, user, tx }) {
      return tx(async (t) => {
        const { sub, event } = await loadCommentable(t, actor, params.submissionId!);
        const id = newId("cmt");
        await t.query("INSERT INTO comments (id, submission_id, event_id, user_id, body) VALUES ($1, $2, $3, $4, $5)", [
          id,
          sub.id,
          event.id,
          user.id,
          body.body,
        ]);
        await audit(t, actor, { eventId: event.id, action: "comment.created", entityType: "comment", entityId: id, summary: `${user.name} commented on "${sub.title}"` });
        return { id, submissionId: sub.id, authorName: user.name, body: body.body, createdAt: new Date().toISOString(), hidden: false };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/comments/:commentId",
    summary: "Delete your comment, or hide any comment as an organizer (moderation)",
    tags: ["Comments"],
    auth: "user",
    async handler({ params, actor, user, tx }) {
      await tx(async (t) => {
        const c = await one<{ id: string; user_id: string; event_id: string }>(t, "SELECT id, user_id, event_id FROM comments WHERE id = $1", [
          params.commentId,
        ]);
        if (!c) throw notFound("Comment");
        if (c.user_id === user.id) {
          await t.query("DELETE FROM comments WHERE id = $1", [c.id]);
        } else if (await isEventOrganizer(t, user, c.event_id)) {
          await t.query("UPDATE comments SET hidden_at = now(), hidden_by = $2 WHERE id = $1", [c.id, user.id]);
          await audit(t, actor, { eventId: c.event_id, action: "comment.hidden", entityType: "comment", entityId: c.id, summary: "Comment hidden by moderator" });
        } else {
          throw forbidden("You can only delete your own comments", "NOT_COMMENT_AUTHOR");
        }
      });
      return undefined;
    },
  }),
];
