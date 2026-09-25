import { z } from "zod";
import {
  assignmentRunInput,
  conflictInput,
  judgeInviteInput,
  manualAssignmentInput,
  pairwiseInput,
  planAssignments,
  scoreInput,
  selectNextPair,
  weightedTotal,
  type AssignmentDto,
  type BallotDto,
  type Comparison,
  type JudgeProgressDto,
} from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { randomToken, sha256Hex } from "../lib/crypto";
import { HttpError, conflict, forbidden, notFound, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor, AppContext } from "../http/context";
import { route } from "../http/route";
import {
  findEvent,
  inScope,
  judgeScope,
  loadManagedEvent,
  requireEventJudge,
  type EventRow,
  type JudgeScope,
} from "./access";
import { criteriaForTrack, loadCriteria } from "./events";
import { loadSubmission, toSubmissionDto } from "./submissions";

const JUDGE_INVITE_PATH = "/judge-invite/";

function assertJudgingOpen(app: AppContext, event: EventRow) {
  if (event.results_published_at && Date.parse(event.results_published_at) <= app.now()) {
    throw forbidden("Results are published; ballots are locked", "JUDGING_CLOSED");
  }
  if (event.judging_ends_at && Date.parse(event.judging_ends_at) <= app.now()) {
    throw forbidden("The judging window has closed", "JUDGING_CLOSED");
  }
}

/**
 * Loads an assignment through RLS. The explicit `judge_id = $2` predicate and
 * the database policy both restrict the row to the caller; a foreign id
 * therefore yields nothing, which we report as 403 without revealing content.
 */
async function loadOwnAssignment(tx: Tx, actor: Actor, assignmentId: string) {
  const row = await one<{
    id: string;
    event_id: string;
    judge_id: string;
    submission_id: string;
    status: "pending" | "in_progress" | "submitted";
  }>(
    tx,
    "SELECT id, event_id, judge_id, submission_id, status FROM assignments WHERE id = $1 AND judge_id = $2",
    [assignmentId, actor.user!.id],
  );
  if (!row) throw forbidden("This assignment is not yours", "NOT_YOUR_ASSIGNMENT");
  return row;
}

async function loadBallot(tx: Tx, judgeId: string, assignmentId: string): Promise<BallotDto> {
  const ballot = await one<{ comment: string; submitted_at: string | null; raw_total: number | null }>(
    tx,
    "SELECT comment, submitted_at, raw_total FROM ballots WHERE assignment_id = $1 AND judge_id = $2",
    [assignmentId, judgeId],
  );
  const scores = await many<{ criterion_id: string; value: number }>(
    tx,
    "SELECT criterion_id, value FROM scores WHERE assignment_id = $1 AND judge_id = $2",
    [assignmentId, judgeId],
  );
  return {
    assignmentId,
    scores: Object.fromEntries(scores.map((s) => [s.criterion_id, s.value])),
    comment: ballot?.comment ?? "",
    submittedAt: ballot?.submitted_at ?? null,
    rawTotal: ballot?.raw_total ?? null,
  };
}

/** Submissions a judge may see: submitted, not ineligible, inside scope, no conflict. */
async function eligibleForJudge(tx: Tx, eventId: string, judgeId: string, scope: JudgeScope) {
  const rows = await many<{ id: string; track_id: string | null }>(
    tx,
    `SELECT s.id, s.track_id FROM submissions s
      WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'
        AND NOT EXISTS (SELECT 1 FROM conflicts c WHERE c.submission_id = s.id AND c.judge_id = $2)
        AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = s.team_id AND m.user_id = $2)`,
    [eventId, judgeId],
  );
  return rows.filter((r) => inScope(scope, r.track_id));
}

async function judgeProgress(tx: Tx, eventId: string): Promise<JudgeProgressDto[]> {
  return many<JudgeProgressDto>(
    tx,
    `SELECT j.user_id AS "judgeId", u.name, u.email, j.track_ids AS "trackIds",
            count(a.id)::int AS assigned,
            count(a.id) FILTER (WHERE a.status = 'submitted')::int AS submitted,
            count(a.id) FILTER (WHERE a.status = 'in_progress')::int AS "inProgress"
       FROM event_judges j
       JOIN users u ON u.id = j.user_id
       LEFT JOIN assignments a ON a.event_id = j.event_id AND a.judge_id = j.user_id
      WHERE j.event_id = $1
      GROUP BY j.user_id, u.name, u.email, j.track_ids
      ORDER BY u.name`,
    [eventId],
  );
}

async function assertTracks(tx: Tx, eventId: string, trackIds: string[]) {
  if (trackIds.length === 0) return;
  const found = await many<{ id: string }>(tx, "SELECT id FROM tracks WHERE event_id = $1 AND id = ANY($2)", [eventId, trackIds]);
  if (found.length !== new Set(trackIds).size) throw unprocessable("Unknown track in scope", undefined, "UNKNOWN_TRACK");
}

export const judgingRoutes = [
  // ------------------------------------------------------------------ judge
  route({
    method: "get",
    path: "/api/judge/events",
    summary: "Events you judge, with your progress",
    tags: ["Judging"],
    auth: "judging:score",
    async handler({ user, tx }) {
      return tx((t) =>
        many(
          t,
          `SELECT e.id, e.slug, e.name, e.submission_deadline AS "submissionDeadline",
                  e.judging_ends_at AS "judgingEndsAt", e.results_published_at AS "resultsPublishedAt",
                  j.track_ids AS "trackIds",
                  count(a.id)::int AS assigned,
                  count(a.id) FILTER (WHERE a.status = 'submitted')::int AS submitted
             FROM event_judges j
             JOIN events e ON e.id = j.event_id
             LEFT JOIN assignments a ON a.event_id = e.id AND a.judge_id = $1
            WHERE j.user_id = $1
            GROUP BY e.id, j.track_ids
            ORDER BY e.submission_deadline DESC`,
          [user.id],
        ),
      );
    },
  }),

  route({
    method: "get",
    path: "/api/judge/events/:eventId/assignments",
    summary: "Your review queue (WHERE judge_id = you)",
    tags: ["Judging"],
    auth: "judging:score",
    async handler({ params, actor, tx }) {
      return tx(async (t): Promise<AssignmentDto[]> => {
        const event = await findEvent(t, params.eventId!);
        if (!event) throw notFound("Event");
        await requireEventJudge(t, actor, event.id);
        return many<AssignmentDto>(
          t,
          `SELECT a.id, a.submission_id AS "submissionId", s.title AS "submissionTitle", tm.name AS "teamName",
                  s.track_id AS "trackId", tr.name AS "trackName", a.status, a.updated_at AS "updatedAt"
             FROM assignments a
             JOIN submissions s ON s.id = a.submission_id
             JOIN teams tm ON tm.id = s.team_id
             LEFT JOIN tracks tr ON tr.id = s.track_id
            WHERE a.event_id = $1 AND a.judge_id = $2
            ORDER BY (a.status = 'submitted'), s.title`,
          [event.id, actor.user!.id],
        );
      });
    },
  }),

  route({
    method: "get",
    path: "/api/judge/assignments/:assignmentId",
    summary: "One assignment: the project, its rubric and your ballot",
    tags: ["Judging"],
    auth: "judging:score",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const a = await loadOwnAssignment(t, actor, params.assignmentId!);
        const scope = await requireEventJudge(t, actor, a.event_id);
        const sub = await loadSubmission(t, a.submission_id);
        if (!sub) throw notFound("Submission");
        if (!inScope(scope, sub.track_id)) throw forbidden("Outside your track scope", "OUT_OF_SCOPE");
        const criteria = criteriaForTrack(await loadCriteria(t, a.event_id), sub.track_id);
        return {
          assignment: { id: a.id, status: a.status, eventId: a.event_id },
          submission: await toSubmissionDto(t, sub, true),
          criteria,
          ballot: await loadBallot(t, actor.user!.id, a.id),
        };
      });
    },
  }),

  route({
    method: "put",
    path: "/api/judge/assignments/:assignmentId/ballot",
    summary: "Save or submit your rubric scores for an assignment",
    description:
      "Scores are validated against the weighted rubric of the project's track. `submit: true` requires every criterion. " +
      "Every change after submission is audit-logged with the before/after weighted total.",
    tags: ["Judging"],
    auth: "judging:score",
    body: scoreInput,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const a = await loadOwnAssignment(t, actor, params.assignmentId!);
        const event = (await findEvent(t, a.event_id))!;
        const scope = await requireEventJudge(t, actor, event.id);
        assertJudgingOpen(app, event);
        const sub = await loadSubmission(t, a.submission_id);
        if (!sub || !inScope(scope, sub.track_id)) throw forbidden("Outside your track scope", "OUT_OF_SCOPE");
        if (sub.eligibility === "ineligible") throw conflict("This project was ruled ineligible", "INELIGIBLE");

        const criteria = criteriaForTrack(await loadCriteria(t, event.id), sub.track_id);
        if (criteria.length === 0) throw conflict("The organizers have not defined a rubric yet", "NO_RUBRIC");
        const byId = new Map(criteria.map((c) => [c.id, c]));
        const issues: { path: string; message: string }[] = [];
        for (const [cid, value] of Object.entries(body.scores)) {
          const c = byId.get(cid);
          if (!c) issues.push({ path: `scores.${cid}`, message: "Not a criterion for this project's track" });
          else if (value > c.maxScore) issues.push({ path: `scores.${cid}`, message: `Max is ${c.maxScore}` });
        }
        if (body.submit) {
          for (const c of criteria) if (body.scores[c.id] === undefined) issues.push({ path: `scores.${c.id}`, message: `Score "${c.name}"` });
        }
        if (issues.length) throw unprocessable("Invalid ballot", issues, "INVALID_BALLOT");

        const before = await loadBallot(t, actor.user!.id, a.id);
        const merged = { ...before.scores, ...body.scores };
        const complete = criteria.every((c) => merged[c.id] !== undefined);
        const rawTotal = complete
          ? weightedTotal(merged, criteria.map((c) => ({ id: c.id, weight: c.weight, maxScore: c.maxScore })))
          : null;

        for (const [cid, value] of Object.entries(body.scores)) {
          await t.query(
            `INSERT INTO scores (assignment_id, criterion_id, judge_id, event_id, value)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (assignment_id, criterion_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [a.id, cid, actor.user!.id, event.id, value],
          );
        }
        const submittedAt = body.submit ? new Date(app.now()).toISOString() : before.submittedAt;
        await t.query(
          `INSERT INTO ballots (assignment_id, event_id, judge_id, submission_id, comment, raw_total, submitted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (assignment_id) DO UPDATE
             SET comment = EXCLUDED.comment, raw_total = EXCLUDED.raw_total,
                 submitted_at = EXCLUDED.submitted_at, updated_at = now()`,
          [a.id, event.id, actor.user!.id, a.submission_id, body.comment, rawTotal, submittedAt],
        );
        const status = submittedAt ? "submitted" : "in_progress";
        await t.query("UPDATE assignments SET status = $2, updated_at = now() WHERE id = $1", [a.id, status]);

        if (body.submit || before.submittedAt) {
          await audit(t, actor, {
            eventId: event.id,
            action: before.submittedAt ? "ballot.updated" : "ballot.submitted",
            entityType: "assignment",
            entityId: a.id,
            summary: before.submittedAt
              ? `Ballot for "${sub.title}" changed (${before.rawTotal?.toFixed(2) ?? "–"} → ${rawTotal?.toFixed(2) ?? "–"})`
              : `Ballot for "${sub.title}" submitted`,
            // Isolation: the audit trail records that a ballot changed, not the other judges' values.
            data: { submissionId: a.submission_id, rawTotalBefore: before.rawTotal, rawTotalAfter: rawTotal },
          });
        }
        if (body.submit && !before.submittedAt) {
          await app.webhooks.emit(event.id, "judging.ballot_submitted", { assignmentId: a.id, submissionId: a.submission_id }, t);
        }
        return loadBallot(t, actor.user!.id, a.id);
      });
    },
  }),

  route({
    method: "post",
    path: "/api/judge/assignments/:assignmentId/recuse",
    summary: "Declare a conflict of interest and hand the assignment back",
    tags: ["Judging"],
    auth: "judging:score",
    body: z.object({ reason: z.string().trim().min(3).max(300) }),
    async handler({ app, params, body, actor }) {
      const a = await app.db.tx({ userId: actor.user!.id, role: actor.user!.role }, (t) =>
        loadOwnAssignment(t, actor, params.assignmentId!),
      );
      // Judges cannot delete assignments under RLS; the verified hand-back runs as system.
      await app.db.system(async (t) => {
        await t.query("DELETE FROM assignments WHERE id = $1", [a.id]);
        await t.query(
          `INSERT INTO conflicts (event_id, judge_id, submission_id, reason, created_by)
           VALUES ($1, $2, $3, $4, $2) ON CONFLICT DO NOTHING`,
          [a.event_id, actor.user!.id, a.submission_id, body.reason],
        );
        await audit(t, actor, {
          eventId: a.event_id,
          action: "judge.recused",
          entityType: "assignment",
          entityId: a.id,
          summary: `${actor.user!.name} recused: ${body.reason}`,
          data: { submissionId: a.submission_id },
        });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/judge/events/:eventId/pairwise/next",
    summary: "Next pair to compare in pairwise (Bradley-Terry) mode",
    tags: ["Judging"],
    auth: "judging:score",
    async handler({ app, params, actor, tx }) {
      const ctx = await tx(async (t) => {
        const event = await findEvent(t, params.eventId!);
        if (!event) throw notFound("Event");
        const scope = await requireEventJudge(t, actor, event.id);
        const candidates = await eligibleForJudge(t, event.id, actor.user!.id, scope);
        const mine = await many<{ winner_id: string; loser_id: string }>(
          t,
          "SELECT winner_id, loser_id FROM pairwise_votes WHERE event_id = $1 AND judge_id = $2",
          [event.id, actor.user!.id],
        );
        return { event, candidates, mine };
      });
      // Global comparison counts steer pair selection; only aggregate counts leave
      // the system context, never another judge's individual choices.
      const counts = await app.db.system((t) =>
        many<{ winner_id: string; loser_id: string }>(t, "SELECT winner_id, loser_id FROM pairwise_votes WHERE event_id = $1", [
          ctx.event.id,
        ]),
      );
      const toCmp = (r: { winner_id: string; loser_id: string }): Comparison => ({ winnerId: r.winner_id, loserId: r.loser_id });
      const pair = selectNextPair(
        ctx.candidates.map((c) => c.id),
        counts.map(toCmp),
        ctx.mine.map(toCmp),
        actor.user!.id,
      );
      const done = ctx.mine.length;
      const possible = (ctx.candidates.length * (ctx.candidates.length - 1)) / 2;
      if (!pair) return { pair: null, done, possible };
      return tx(async (t) => {
        const left = await loadSubmission(t, pair[0]);
        const right = await loadSubmission(t, pair[1]);
        return {
          pair: [await toSubmissionDto(t, left!, true), await toSubmissionDto(t, right!, true)],
          done,
          possible,
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/judge/events/:eventId/pairwise",
    summary: "Record which of two projects is better",
    tags: ["Judging"],
    auth: "judging:score",
    body: pairwiseInput,
    status: 201,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await findEvent(t, params.eventId!);
        if (!event) throw notFound("Event");
        const scope = await requireEventJudge(t, actor, event.id);
        assertJudgingOpen(app, event);
        if (body.winnerId === body.loserId) throw unprocessable("Pick two different projects");
        const allowed = new Set((await eligibleForJudge(t, event.id, actor.user!.id, scope)).map((r) => r.id));
        if (!allowed.has(body.winnerId) || !allowed.has(body.loserId)) {
          throw forbidden("You cannot compare these projects", "OUT_OF_SCOPE");
        }
        const dup = await one(
          t,
          `SELECT 1 FROM pairwise_votes WHERE event_id = $1 AND judge_id = $2
             AND ((winner_id = $3 AND loser_id = $4) OR (winner_id = $4 AND loser_id = $3))`,
          [event.id, actor.user!.id, body.winnerId, body.loserId],
        );
        if (dup) throw conflict("You already compared this pair", "DUPLICATE_COMPARISON");
        const id = newId("pw");
        await t.query("INSERT INTO pairwise_votes (id, event_id, judge_id, winner_id, loser_id) VALUES ($1, $2, $3, $4, $5)", [
          id,
          event.id,
          actor.user!.id,
          body.winnerId,
          body.loserId,
        ]);
        await audit(t, actor, {
          eventId: event.id,
          action: "pairwise.recorded",
          entityType: "pairwise_vote",
          entityId: id,
          summary: `${actor.user!.name} recorded a pairwise comparison`,
        });
        return { id };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/judge-invites/:token",
    summary: "Preview a judge invitation",
    tags: ["Judging"],
    auth: "public",
    async handler({ app, params, tx }) {
      return tx(async (t) => {
        const inv = await one<{ event_id: string; expires_at: string; used_at: string | null; revoked_at: string | null; track_ids: string[] | null; note: string }>(
          t,
          "SELECT event_id, expires_at, used_at, revoked_at, track_ids, note FROM judge_invites WHERE token_hash = $1",
          [sha256Hex(params.token!)],
        );
        if (!inv) throw notFound("Invite");
        const event = (await findEvent(t, inv.event_id))!;
        const tracks = inv.track_ids
          ? await many<{ name: string }>(t, "SELECT name FROM tracks WHERE id = ANY($1) ORDER BY position", [inv.track_ids])
          : [];
        return {
          status: inv.revoked_at ? "revoked" : inv.used_at ? "used" : Date.parse(inv.expires_at) <= app.now() ? "expired" : "valid",
          expiresAt: inv.expires_at,
          note: inv.note,
          event: { id: event.id, slug: event.slug, name: event.name },
          tracks: tracks.map((x) => x.name),
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/judge-invites/:token/accept",
    summary: "Accept a judge invitation (participants/visitors become judges)",
    description: "Organizers and admins must use a separate judge account so their oversight role stays separate.",
    tags: ["Judging"],
    auth: "user",
    async handler({ app, params, actor, user }) {
      return app.db.system(async (t) => {
        const inv = await one<{ id: string; event_id: string; expires_at: string; used_at: string | null; revoked_at: string | null; track_ids: string[] | null }>(
          t,
          "SELECT id, event_id, expires_at, used_at, revoked_at, track_ids FROM judge_invites WHERE token_hash = $1 FOR UPDATE",
          [sha256Hex(params.token!)],
        );
        if (!inv) throw notFound("Invite");
        if (inv.revoked_at) throw new HttpError(410, "INVITE_REVOKED", "This invitation was revoked");
        if (inv.used_at) throw conflict("This invitation has already been used", "INVITE_USED");
        if (Date.parse(inv.expires_at) <= app.now()) throw new HttpError(410, "INVITE_EXPIRED", "This invitation has expired");
        if (user.role === "organizer" || user.role === "admin") {
          throw conflict("Organizers cannot judge; accept with a separate judge account", "ORGANIZER_CANNOT_JUDGE");
        }
        const onTeam = await one(t, "SELECT 1 FROM team_members WHERE event_id = $1 AND user_id = $2", [inv.event_id, user.id]);
        if (onTeam) throw conflict("You are on a team in this event and cannot judge it", "PARTICIPANT_CONFLICT");
        if (user.role !== "judge") {
          await t.query("UPDATE users SET role = 'judge' WHERE id = $1", [user.id]);
        }
        await t.query(
          `INSERT INTO event_judges (event_id, user_id, track_ids) VALUES ($1, $2, $3)
           ON CONFLICT (event_id, user_id) DO UPDATE SET track_ids = EXCLUDED.track_ids`,
          [inv.event_id, user.id, inv.track_ids],
        );
        await t.query("UPDATE judge_invites SET used_at = now(), used_by = $2 WHERE id = $1", [inv.id, user.id]);
        await audit(t, actor, {
          eventId: inv.event_id,
          action: "judge.joined",
          entityType: "user",
          entityId: user.id,
          summary: `${user.name} accepted a judge invitation${user.role !== "judge" ? ` (role ${user.role} → judge)` : ""}`,
          data: { trackIds: inv.track_ids },
        });
        const event = (await findEvent(t, inv.event_id))!;
        return { eventId: event.id, slug: event.slug, trackIds: inv.track_ids };
      });
    },
  }),

  // -------------------------------------------------------------- organizer
  route({
    method: "get",
    path: "/api/events/:eventId/judges",
    summary: "Judges, their scopes and progress",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return judgeProgress(t, event.id);
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/judge-invites",
    summary: "Create a single-use judge invitation link (optionally scoped to tracks)",
    tags: ["Judge management"],
    auth: "event:manage",
    body: judgeInviteInput,
    status: 201,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        await assertTracks(t, event.id, body.trackIds);
        const token = randomToken(24);
        const id = newId("jinv");
        const row = await one<{ expires_at: string }>(
          t,
          `INSERT INTO judge_invites (id, event_id, token_hash, track_ids, note, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING expires_at`,
          [id, event.id, sha256Hex(token), body.trackIds.length ? body.trackIds : null, body.note, actor.user!.id, new Date(app.now() + body.expiresInHours * 3_600_000).toISOString()],
        );
        await audit(t, actor, {
          eventId: event.id,
          action: "judge.invited",
          entityType: "judge_invite",
          entityId: id,
          summary: `Judge invitation created${body.note ? ` (${body.note})` : ""}`,
          data: { trackIds: body.trackIds },
        });
        return { id, token, url: `${app.config.publicUrl}${JUDGE_INVITE_PATH}${token}`, expiresAt: row!.expires_at, usedAt: null };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/judge-invites",
    summary: "Judge invitations and their status",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT i.id, i.note, i.track_ids AS "trackIds", i.created_at AS "createdAt", i.expires_at AS "expiresAt",
                  i.used_at AS "usedAt", i.revoked_at AS "revokedAt", u.name AS "usedBy"
             FROM judge_invites i LEFT JOIN users u ON u.id = i.used_by
            WHERE i.event_id = $1 ORDER BY i.created_at DESC`,
          [event.id],
        );
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/judge-invites/:inviteId",
    summary: "Revoke an unused judge invitation",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const res = await t.query(
          "UPDATE judge_invites SET revoked_at = now() WHERE id = $1 AND event_id = $2 AND used_at IS NULL AND revoked_at IS NULL",
          [params.inviteId, event.id],
        );
        if (res.rowCount === 0) throw notFound("Invite");
        await audit(t, actor, { eventId: event.id, action: "judge.invite_revoked", entityType: "judge_invite", entityId: params.inviteId, summary: "Judge invitation revoked" });
      });
      return undefined;
    },
  }),

  route({
    method: "patch",
    path: "/api/events/:eventId/judges/:userId",
    summary: "Change a judge's track scope (empty = all tracks)",
    tags: ["Judge management"],
    auth: "event:manage",
    body: z.object({ trackIds: z.array(z.string()).max(50) }),
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        await assertTracks(t, event.id, body.trackIds);
        const res = await t.query("UPDATE event_judges SET track_ids = $3 WHERE event_id = $1 AND user_id = $2", [
          event.id,
          params.userId,
          body.trackIds.length ? body.trackIds : null,
        ]);
        if (res.rowCount === 0) throw notFound("Judge");
        await audit(t, actor, { eventId: event.id, action: "judge.scope_changed", entityType: "user", entityId: params.userId, summary: "Judge track scope changed", data: body });
        return (await judgeProgress(t, event.id)).find((j) => j.judgeId === params.userId);
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/judges/:userId",
    summary: "Remove a judge (and their unsubmitted assignments)",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const submitted = await one<{ n: number }>(
          t,
          "SELECT count(*)::int AS n FROM assignments WHERE event_id = $1 AND judge_id = $2 AND status = 'submitted'",
          [event.id, params.userId],
        );
        if ((submitted?.n ?? 0) > 0) throw conflict("This judge has submitted ballots; keep them for the record", "HAS_BALLOTS");
        const res = await t.query("DELETE FROM event_judges WHERE event_id = $1 AND user_id = $2", [event.id, params.userId]);
        if (res.rowCount === 0) throw notFound("Judge");
        await audit(t, actor, { eventId: event.id, action: "judge.removed", entityType: "user", entityId: params.userId, summary: "Judge removed" });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/conflicts",
    summary: "Declared conflicts of interest",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT c.judge_id AS "judgeId", u.name AS "judgeName", c.submission_id AS "submissionId", s.title AS "submissionTitle",
                  c.reason, c.created_at AS "createdAt"
             FROM conflicts c JOIN users u ON u.id = c.judge_id JOIN submissions s ON s.id = c.submission_id
            WHERE c.event_id = $1 ORDER BY c.created_at DESC`,
          [event.id],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/conflicts",
    summary: "Declare a conflict (removes any unsubmitted assignment for that pair)",
    tags: ["Judge management"],
    auth: "event:manage",
    body: conflictInput,
    status: 201,
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        if (!(await judgeScope(t, body.judgeId, event.id))) throw notFound("Judge");
        const sub = await one(t, "SELECT 1 FROM submissions WHERE id = $1 AND event_id = $2", [body.submissionId, event.id]);
        if (!sub) throw notFound("Submission");
        await t.query(
          `INSERT INTO conflicts (event_id, judge_id, submission_id, reason, created_by) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (judge_id, submission_id) DO UPDATE SET reason = EXCLUDED.reason`,
          [event.id, body.judgeId, body.submissionId, body.reason, actor.user!.id],
        );
        await t.query("DELETE FROM assignments WHERE judge_id = $1 AND submission_id = $2 AND status <> 'submitted'", [
          body.judgeId,
          body.submissionId,
        ]);
        await audit(t, actor, { eventId: event.id, action: "conflict.declared", entityType: "conflict", entityId: `${body.judgeId}:${body.submissionId}`, summary: `Conflict declared: ${body.reason}`, data: body });
        return { ok: true };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/conflicts/:judgeId/:submissionId",
    summary: "Remove a declared conflict",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const res = await t.query("DELETE FROM conflicts WHERE event_id = $1 AND judge_id = $2 AND submission_id = $3", [
          event.id,
          params.judgeId,
          params.submissionId,
        ]);
        if (res.rowCount === 0) throw notFound("Conflict");
        await audit(t, actor, { eventId: event.id, action: "conflict.removed", entityType: "conflict", entityId: `${params.judgeId}:${params.submissionId}`, summary: "Conflict removed" });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/assignments",
    summary: "Assignment matrix with coverage gaps",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const assignments = await many(
          t,
          `SELECT a.id, a.judge_id AS "judgeId", u.name AS "judgeName", a.submission_id AS "submissionId",
                  s.title AS "submissionTitle", s.track_id AS "trackId", a.status, a.created_at AS "createdAt"
             FROM assignments a JOIN users u ON u.id = a.judge_id JOIN submissions s ON s.id = a.submission_id
            WHERE a.event_id = $1 ORDER BY s.title, u.name`,
          [event.id],
        );
        const coverage = await many<{ id: string; title: string; trackId: string | null; reviews: number }>(
          t,
          `SELECT s.id, s.title, s.track_id AS "trackId", count(a.id)::int AS reviews
             FROM submissions s LEFT JOIN assignments a ON a.submission_id = s.id
            WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'
            GROUP BY s.id ORDER BY reviews, s.title`,
          [event.id],
        );
        return {
          reviewsPerSubmission: event.reviews_per_submission,
          assignments,
          coverage,
          gaps: coverage.filter((c) => c.reviews < event.reviews_per_submission),
          judges: await judgeProgress(t, event.id),
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/assignments/auto",
    summary: "Run balanced algorithmic assignment (dryRun previews without writing)",
    description:
      "Most-constrained-first, least-loaded-judge greedy with track scopes and conflict exclusion; deterministic. " +
      "Only submitted, non-ineligible projects are routed. Existing assignments are kept (top-up).",
    tags: ["Judge management"],
    auth: "event:manage",
    body: assignmentRunInput,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const k = body.reviewsPerSubmission ?? event.reviews_per_submission;
        const submissions = await many<{ id: string; track_id: string | null; member_ids: string[] }>(
          t,
          `SELECT s.id, s.track_id, coalesce(array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL), '{}') AS member_ids
             FROM submissions s LEFT JOIN team_members m ON m.team_id = s.team_id
            WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'
            GROUP BY s.id`,
          [event.id],
        );
        const judges = await many<{ user_id: string; track_ids: string[] | null }>(
          t,
          "SELECT j.user_id, j.track_ids FROM event_judges j JOIN users u ON u.id = j.user_id WHERE j.event_id = $1 AND u.role = 'judge'",
          [event.id],
        );
        const existing = await many<{ judge_id: string; submission_id: string }>(
          t,
          "SELECT judge_id, submission_id FROM assignments WHERE event_id = $1",
          [event.id],
        );
        const conflicts = await many<{ judge_id: string; submission_id: string }>(
          t,
          "SELECT judge_id, submission_id FROM conflicts WHERE event_id = $1",
          [event.id],
        );
        const plan = planAssignments({
          submissions: submissions.map((s) => ({ id: s.id, trackId: s.track_id, memberIds: s.member_ids })),
          judges: judges.map((j) => ({ id: j.user_id, trackIds: j.track_ids })),
          existing: existing.map((e) => ({ judgeId: e.judge_id, submissionId: e.submission_id })),
          conflicts: conflicts.map((c) => ({ judgeId: c.judge_id, submissionId: c.submission_id })),
          reviewsPerSubmission: k,
          maxPerJudge: body.maxPerJudge,
        });
        if (!body.dryRun) {
          for (const p of plan.created) {
            await t.query(
              "INSERT INTO assignments (id, event_id, judge_id, submission_id, created_by) VALUES ($1, $2, $3, $4, $5)",
              [newId("asg"), event.id, p.judgeId, p.submissionId, actor.user!.id],
            );
          }
          if (body.reviewsPerSubmission && body.reviewsPerSubmission !== event.reviews_per_submission) {
            await t.query("UPDATE events SET reviews_per_submission = $2 WHERE id = $1", [event.id, body.reviewsPerSubmission]);
          }
          await audit(t, actor, {
            eventId: event.id,
            action: "assignments.generated",
            entityType: "event",
            entityId: event.id,
            summary: `Algorithmic routing created ${plan.created.length} assignments (k=${k}, load ${plan.stats.minLoad}–${plan.stats.maxLoad})`,
            data: { created: plan.created.length, stats: plan.stats, shortfalls: plan.shortfalls.length },
          });
          if (plan.created.length) {
            await app.webhooks.emit(event.id, "judging.assignments_created", { count: plan.created.length }, t);
          }
        }
        return { dryRun: body.dryRun, reviewsPerSubmission: k, ...plan };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/assignments",
    summary: "Assign one judge to one project manually",
    tags: ["Judge management"],
    auth: "event:manage",
    body: manualAssignmentInput,
    status: 201,
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const scope = await judgeScope(t, body.judgeId, event.id);
        if (!scope) throw notFound("Judge");
        const sub = await loadSubmission(t, body.submissionId);
        if (!sub || sub.event_id !== event.id) throw notFound("Submission");
        if (sub.status !== "submitted" || sub.eligibility === "ineligible") throw conflict("Only submitted, eligible projects can be judged", "NOT_JUDGEABLE");
        if (!inScope(scope, sub.track_id)) throw conflict("That project is outside the judge's track scope", "OUT_OF_SCOPE");
        const blocked = await one(
          t,
          `SELECT 1 FROM conflicts WHERE judge_id = $1 AND submission_id = $2
           UNION ALL SELECT 1 FROM team_members WHERE team_id = $3 AND user_id = $1`,
          [body.judgeId, sub.id, sub.team_id],
        );
        if (blocked) throw conflict("Conflict of interest", "CONFLICT_OF_INTEREST");
        const id = newId("asg");
        await t.query("INSERT INTO assignments (id, event_id, judge_id, submission_id, created_by) VALUES ($1, $2, $3, $4, $5)", [
          id,
          event.id,
          body.judgeId,
          sub.id,
          actor.user!.id,
        ]);
        await audit(t, actor, { eventId: event.id, action: "assignment.created", entityType: "assignment", entityId: id, summary: `Manual assignment for "${sub.title}"`, data: body });
        return { id };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/assignments/:assignmentId",
    summary: "Remove an assignment (its ballot is deleted too)",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const res = await t.query("DELETE FROM assignments WHERE id = $1 AND event_id = $2 RETURNING status", [params.assignmentId, event.id]);
        if (res.rowCount === 0) throw notFound("Assignment");
        await audit(t, actor, {
          eventId: event.id,
          action: "assignment.removed",
          entityType: "assignment",
          entityId: params.assignmentId,
          summary: `Assignment removed (was ${(res.rows[0] as { status: string }).status})`,
        });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/ballots",
    summary: "All raw ballots with per-criterion scores (organizers only)",
    tags: ["Judge management"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const ballots = await many<{ assignmentId: string; judgeId: string; judgeName: string; submissionId: string; title: string; rawTotal: number | null; submittedAt: string | null; comment: string }>(
          t,
          `SELECT b.assignment_id AS "assignmentId", b.judge_id AS "judgeId", u.name AS "judgeName",
                  b.submission_id AS "submissionId", s.title, b.raw_total AS "rawTotal",
                  b.submitted_at AS "submittedAt", b.comment
             FROM ballots b JOIN users u ON u.id = b.judge_id JOIN submissions s ON s.id = b.submission_id
            WHERE b.event_id = $1 ORDER BY s.title, u.name`,
          [event.id],
        );
        const scores = await many<{ assignment_id: string; criterion_id: string; value: number }>(
          t,
          "SELECT assignment_id, criterion_id, value FROM scores WHERE event_id = $1",
          [event.id],
        );
        const byAssignment = new Map<string, Record<string, number>>();
        for (const s of scores) {
          const m = byAssignment.get(s.assignment_id) ?? {};
          m[s.criterion_id] = s.value;
          byAssignment.set(s.assignment_id, m);
        }
        return ballots.map((b) => ({ ...b, scores: byAssignment.get(b.assignmentId) ?? {} }));
      });
    },
  }),
];
