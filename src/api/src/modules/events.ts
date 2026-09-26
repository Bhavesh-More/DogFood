import { z } from "zod";
import {
  criterionInput,
  criterionPatch,
  email,
  eventInput,
  eventPatch,
  eventPhase,
  isVotingOpen,
  prizeInput,
  prizePatch,
  questionInput,
  questionPatch,
  timeline,
  trackInput,
  trackPatch,
  type CriterionDto,
  type EventDto,
  type EventSummaryDto,
  type EventTimes,
  type PrizeDto,
  type QuestionDto,
  type TrackDto,
} from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { conflict, forbidden, notFound, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../http/context";
import { route } from "../http/route";
import { findEvent, isEventOrganizer, judgeScope, loadManagedEvent, loadVisibleEvent, teamOf, type EventRow } from "./access";

export function eventTimes(e: EventRow): EventTimes {
  return {
    status: e.status,
    startsAt: e.starts_at,
    submissionDeadline: e.submission_deadline,
    judgingEndsAt: e.judging_ends_at,
    votingOpensAt: e.voting_opens_at,
    votingClosesAt: e.voting_closes_at,
    resultsPublishedAt: e.results_published_at,
  };
}

async function eventStats(tx: Tx, eventIds: string[]) {
  const rows = await many<{ event_id: string; registrations: number; teams: number; submissions: number }>(
    tx,
    `SELECT e.id AS event_id,
            (SELECT count(*)::int FROM registrations r WHERE r.event_id = e.id) AS registrations,
            (SELECT count(*)::int FROM teams t WHERE t.event_id = e.id) AS teams,
            (SELECT count(*)::int FROM submissions s WHERE s.event_id = e.id AND s.status = 'submitted') AS submissions
       FROM events e WHERE e.id = ANY($1)`,
    [eventIds],
  );
  return new Map(
    rows.map((r) => [r.event_id, { registrations: r.registrations, teams: r.teams, submissions: r.submissions }]),
  );
}

export function toSummary(e: EventRow, now: number, stats?: { registrations: number; teams: number; submissions: number }): EventSummaryDto {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    tagline: e.tagline,
    location: e.location,
    status: e.status,
    phase: eventPhase(eventTimes(e), now),
    startsAt: e.starts_at,
    submissionDeadline: e.submission_deadline,
    votingOpensAt: e.voting_opens_at,
    votingClosesAt: e.voting_closes_at,
    resultsPublishedAt: e.results_published_at,
    stats: stats ?? { registrations: 0, teams: 0, submissions: 0 },
  };
}

export async function loadTracks(tx: Tx, eventId: string): Promise<TrackDto[]> {
  return many<TrackDto>(
    tx,
    "SELECT id, name, description, position FROM tracks WHERE event_id = $1 ORDER BY position, name",
    [eventId],
  );
}

export async function loadCriteria(tx: Tx, eventId: string): Promise<CriterionDto[]> {
  return many<CriterionDto>(
    tx,
    `SELECT id, name, description, weight, max_score AS "maxScore", track_id AS "trackId", position
       FROM criteria WHERE event_id = $1 ORDER BY position, name`,
    [eventId],
  );
}

/** Criteria that apply to a submission in `trackId`: event-wide + that track's own. */
export function criteriaForTrack(all: CriterionDto[], trackId: string | null): CriterionDto[] {
  const own = all.filter((c) => c.trackId !== null && c.trackId === trackId);
  const shared = all.filter((c) => c.trackId === null);
  return [...shared, ...own];
}

export async function buildEventDto(tx: Tx, e: EventRow, actor: Actor, now: number): Promise<EventDto> {
  const tracks = await loadTracks(tx, e.id);
  const prizes = await many<PrizeDto>(
    tx,
    `SELECT id, name, description, value, track_id AS "trackId", position FROM prizes
      WHERE event_id = $1 ORDER BY position, name`,
    [e.id],
  );
  const questions = await many<QuestionDto>(
    tx,
    `SELECT id, label, help, kind, required, options, position FROM questions
      WHERE event_id = $1 ORDER BY position, label`,
    [e.id],
  );
  const stats = await eventStats(tx, [e.id]);
  const user = actor.user;
  const registered = user ? await one(tx, "SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2", [e.id, user.id]) : null;
  const teamId = user ? await teamOf(tx, user.id, e.id) : null;
  const isOrganizer = await isEventOrganizer(tx, user, e.id);
  const scope = user ? await judgeScope(tx, user.id, e.id) : null;
  const times = eventTimes(e);
  return {
    ...toSummary(e, now, stats.get(e.id)),
    description: e.description,
    rules: e.rules,
    judgingEndsAt: e.judging_ends_at,
    minTeamSize: e.min_team_size,
    maxTeamSize: e.max_team_size,
    votingMode: e.voting_mode,
    votingStyle: e.voting_style,
    quadraticCredits: e.vote_budget,
    reviewsPerSubmission: e.reviews_per_submission,
    normalization: {
      targetMean: e.norm_target_mean,
      targetSd: e.norm_target_sd,
      minSampleSize: e.norm_min_sample,
    },
    tracks,
    prizes,
    questions,
    timeline: timeline(times, now),
    votingOpen: isVotingOpen(times, now),
    viewer: {
      registered: registered !== null || teamId !== null,
      teamId,
      isOrganizer,
      isJudge: scope !== null && user?.role === "judge",
    },
  };
}

type EventWrite = z.output<typeof eventInput>;

function eventColumns(input: Partial<EventWrite>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const set = (col: string, v: unknown) => {
    if (v !== undefined) map[col] = v;
  };
  set("slug", input.slug);
  set("name", input.name);
  set("tagline", input.tagline);
  set("description", input.description);
  set("rules", input.rules);
  set("location", input.location);
  set("starts_at", input.startsAt);
  set("submission_deadline", input.submissionDeadline);
  set("judging_ends_at", input.judgingEndsAt);
  set("voting_opens_at", input.votingOpensAt);
  set("voting_closes_at", input.votingClosesAt);
  set("min_team_size", input.minTeamSize);
  set("max_team_size", input.maxTeamSize);
  set("voting_mode", input.votingMode);
  set("voting_style", input.votingStyle);
  set("vote_budget", input.quadraticCredits);
  set("reviews_per_submission", input.reviewsPerSubmission);
  if (input.normalization) {
    set("norm_target_mean", input.normalization.targetMean);
    set("norm_target_sd", input.normalization.targetSd);
    set("norm_min_sample", input.normalization.minSampleSize);
  }
  return map;
}

async function nextPosition(tx: Tx, table: string, eventId: string): Promise<number> {
  const row = await one<{ n: number }>(tx, `SELECT coalesce(max(position), -1)::int + 1 AS n FROM ${table} WHERE event_id = $1`, [
    eventId,
  ]);
  return row?.n ?? 0;
}

async function assertTrackOfEvent(tx: Tx, eventId: string, trackId: string | null) {
  if (trackId === null) return;
  const t = await one(tx, "SELECT 1 FROM tracks WHERE id = $1 AND event_id = $2", [trackId, eventId]);
  if (!t) throw unprocessable("Unknown track for this event", [{ path: "trackId", message: "Unknown track" }]);
}

const eventListQuery = z.object({
  scope: z.enum(["public", "mine"]).default("public"),
});

/** Generic CRUD for the small per-event child collections. */
function childRoutes<S extends z.ZodType, P extends z.ZodType>(opts: {
  name: string;
  plural: string;
  table: string;
  prefix: string;
  schema: S;
  patch: P;
  columns: (input: Partial<z.output<S>>) => Record<string, unknown>;
  validate?: (tx: Tx, eventId: string, input: Partial<z.output<S>>) => Promise<void>;
}) {
  const { name, plural, table, prefix, schema, patch } = opts;
  return [
    route({
      method: "post",
      path: `/api/events/:eventId/${plural}`,
      summary: `Add a ${name}`,
      tags: ["Event setup"],
      auth: "event:manage",
      body: schema,
      status: 201,
      async handler({ params, body, tx, actor }) {
        return tx(async (t) => {
          const event = await loadManagedEvent(t, actor, params.eventId!);
          const input = body as Partial<z.output<S>>;
          await opts.validate?.(t, event.id, input);
          const cols = { id: newId(prefix), event_id: event.id, position: await nextPosition(t, table, event.id), ...opts.columns(input) };
          const keys = Object.keys(cols);
          const row = await one(
            t,
            `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
            Object.values(cols).map((v) => (Array.isArray(v) ? JSON.stringify(v) : v)),
          );
          await audit(t, actor, {
            eventId: event.id,
            action: `${name}.created`,
            entityType: name,
            entityId: cols.id as string,
            summary: `${name} added to ${event.name}`,
            data: body as Record<string, unknown>,
          });
          return row;
        });
      },
    }),
    route({
      method: "patch",
      path: `/api/events/:eventId/${plural}/:itemId`,
      summary: `Update a ${name}`,
      tags: ["Event setup"],
      auth: "event:manage",
      body: patch,
      async handler({ params, body, tx, actor }) {
        return tx(async (t) => {
          const event = await loadManagedEvent(t, actor, params.eventId!);
          const input = body as Partial<z.output<S>>;
          const cols = Object.fromEntries(Object.entries(opts.columns(input)).filter(([, v]) => v !== undefined));
          if (opts.validate) await opts.validate(t, event.id, input);
          const keys = Object.keys(cols);
          if (keys.length === 0) return { id: params.itemId };
          const res = await t.query(
            `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")} WHERE id = $1 AND event_id = $2`,
            [params.itemId, event.id, ...Object.values(cols).map((v) => (Array.isArray(v) ? JSON.stringify(v) : v))],
          );
          if (res.rowCount === 0) throw notFound(name);
          await audit(t, actor, {
            eventId: event.id,
            action: `${name}.updated`,
            entityType: name,
            entityId: params.itemId,
            summary: `${name} updated`,
            data: body as Record<string, unknown>,
          });
          return { id: params.itemId };
        });
      },
    }),
    route({
      method: "delete",
      path: `/api/events/:eventId/${plural}/:itemId`,
      summary: `Remove a ${name}`,
      tags: ["Event setup"],
      auth: "event:manage",
      async handler({ params, tx, actor }) {
        await tx(async (t) => {
          const event = await loadManagedEvent(t, actor, params.eventId!);
          const res = await t.query(`DELETE FROM ${table} WHERE id = $1 AND event_id = $2`, [params.itemId, event.id]);
          if (res.rowCount === 0) throw notFound(name);
          await audit(t, actor, {
            eventId: event.id,
            action: `${name}.deleted`,
            entityType: name,
            entityId: params.itemId,
            summary: `${name} removed`,
          });
        });
        return undefined;
      },
    }),
  ];
}

export const eventRoutes = [
  route({
    method: "get",
    path: "/api/events",
    summary: "List events (published for everyone; your drafts with scope=mine)",
    tags: ["Events"],
    auth: "public",
    query: eventListQuery,
    async handler({ app, actor, query, tx }) {
      return tx(async (t) => {
        const user = actor.user;
        let rows: EventRow[];
        if (query.scope === "mine" && user) {
          rows = await many<EventRow>(
            t,
            user.role === "admin"
              ? "SELECT * FROM events ORDER BY starts_at DESC"
              : `SELECT e.* FROM events e
                  WHERE EXISTS (SELECT 1 FROM event_organizers o WHERE o.event_id = e.id AND o.user_id = $1)
                     OR EXISTS (SELECT 1 FROM event_judges j WHERE j.event_id = e.id AND j.user_id = $1)
                     OR EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = e.id AND r.user_id = $1)
                     OR EXISTS (SELECT 1 FROM team_members m WHERE m.event_id = e.id AND m.user_id = $1)
                  ORDER BY e.starts_at DESC`,
            user.role === "admin" ? [] : [user.id],
          );
        } else {
          rows = await many<EventRow>(
            t,
            "SELECT * FROM events WHERE status IN ('published', 'archived') ORDER BY starts_at DESC",
          );
        }
        const stats = await eventStats(t, rows.map((r) => r.id));
        return rows.map((r) => toSummary(r, app.now(), stats.get(r.id)));
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events",
    summary: "Create an event (starts as a draft; you become its organizer)",
    tags: ["Events"],
    auth: "event:create",
    body: eventInput,
    status: 201,
    async handler({ app, body, tx, actor, user }) {
      return tx(async (t) => {
        if (await findEvent(t, body.slug)) throw conflict("That slug is taken", "SLUG_TAKEN");
        const id = newId("evt");
        const cols = { id, created_by: user.id, ...eventColumns(body) };
        const keys = Object.keys(cols);
        await t.query(
          `INSERT INTO events (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
          Object.values(cols),
        );
        await t.query("INSERT INTO event_organizers (event_id, user_id) VALUES ($1, $2)", [id, user.id]);
        await audit(t, actor, {
          eventId: id,
          action: "event.created",
          entityType: "event",
          entityId: id,
          summary: `Event "${body.name}" created`,
        });
        const row = (await findEvent(t, id))!;
        return buildEventDto(t, row, actor, app.now());
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId",
    summary: "Event details by id or slug",
    tags: ["Events"],
    auth: "public",
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        return buildEventDto(t, event, actor, app.now());
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/events/:eventId",
    summary: "Edit event details, schedule and configuration",
    tags: ["Events"],
    auth: "event:manage",
    body: eventPatch,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const cols = eventColumns(body);
        if (body.slug && body.slug !== event.slug && (await findEvent(t, body.slug))) {
          throw conflict("That slug is taken", "SLUG_TAKEN");
        }
        // Validate the merged windows (the patch alone may not contain both ends).
        const merged = eventPatch.safeParse({
          startsAt: body.startsAt ?? event.starts_at,
          submissionDeadline: body.submissionDeadline ?? event.submission_deadline,
          votingOpensAt: body.votingOpensAt !== undefined ? body.votingOpensAt : event.voting_opens_at,
          votingClosesAt: body.votingClosesAt !== undefined ? body.votingClosesAt : event.voting_closes_at,
          minTeamSize: body.minTeamSize ?? event.min_team_size,
          maxTeamSize: body.maxTeamSize ?? event.max_team_size,
        });
        if (!merged.success) {
          throw unprocessable(
            "Invalid schedule",
            merged.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          );
        }
        const keys = Object.keys(cols);
        if (keys.length) {
          await t.query(
            `UPDATE events SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
            [event.id, ...Object.values(cols)],
          );
          const deadlineChanged = body.submissionDeadline && body.submissionDeadline !== event.submission_deadline;
          await audit(t, actor, {
            eventId: event.id,
            action: deadlineChanged ? "event.deadline_changed" : "event.updated",
            entityType: "event",
            entityId: event.id,
            summary: deadlineChanged
              ? `Deadline moved from ${event.submission_deadline} to ${body.submissionDeadline}`
              : `Event settings updated (${keys.join(", ")})`,
            data: { changed: keys, before: deadlineChanged ? event.submission_deadline : undefined },
          });
        }
        return buildEventDto(t, (await findEvent(t, event.id))!, actor, app.now());
      });
    },
  }),

  ...(["publish", "archive", "unpublish"] as const).map((action) =>
    route({
      method: "post",
      path: `/api/events/:eventId/${action}`,
      summary:
        action === "publish"
          ? "Publish the event (visible to everyone)"
          : action === "archive"
            ? "Archive the event (read-only history)"
            : "Return the event to draft",
      tags: ["Events"],
      auth: "event:manage",
      async handler({ app, params, actor, tx }) {
        return tx(async (t) => {
          const event = await loadManagedEvent(t, actor, params.eventId!);
          const status = action === "publish" ? "published" : action === "archive" ? "archived" : "draft";
          if (action === "unpublish") {
            const regs = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM registrations WHERE event_id = $1", [
              event.id,
            ]);
            if ((regs?.n ?? 0) > 0) throw conflict("Participants have registered; archive instead", "HAS_REGISTRATIONS");
          }
          await t.query("UPDATE events SET status = $2, updated_at = now() WHERE id = $1", [event.id, status]);
          await audit(t, actor, {
            eventId: event.id,
            action: { publish: "event.published", archive: "event.archived", unpublish: "event.unpublished" }[action],
            entityType: "event",
            entityId: event.id,
            summary: `Event ${status}`,
          });
          return buildEventDto(t, (await findEvent(t, event.id))!, actor, app.now());
        });
      },
    }),
  ),

  ...childRoutes({
    name: "track",
    plural: "tracks",
    table: "tracks",
    prefix: "trk",
    schema: trackInput,
    patch: trackPatch,
    columns: (b) => ({ name: b.name, description: b.description }),
  }),
  ...childRoutes({
    name: "prize",
    plural: "prizes",
    table: "prizes",
    prefix: "prz",
    schema: prizeInput,
    patch: prizePatch,
    columns: (b) => ({ name: b.name, description: b.description, value: b.value, track_id: b.trackId }),
    validate: (t, eventId, b) => assertTrackOfEvent(t, eventId, b.trackId ?? null),
  }),
  ...childRoutes({
    name: "question",
    plural: "questions",
    table: "questions",
    prefix: "qst",
    schema: questionInput,
    patch: questionPatch,
    columns: (b) => ({ label: b.label, help: b.help, kind: b.kind, required: b.required, options: b.options }),
  }),
  ...childRoutes({
    name: "criterion",
    plural: "criteria",
    table: "criteria",
    prefix: "crt",
    schema: criterionInput,
    patch: criterionPatch,
    columns: (b) => ({
      name: b.name,
      description: b.description,
      weight: b.weight,
      max_score: b.maxScore,
      track_id: b.trackId,
    }),
    validate: (t, eventId, b) => assertTrackOfEvent(t, eventId, b.trackId ?? null),
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/criteria",
    summary: "Weighted judging rubric (public so participants know how they are judged)",
    tags: ["Event setup"],
    auth: "public",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const criteria = await loadCriteria(t, event.id);
        const tracks = await loadTracks(t, event.id);
        const rubricFor = (trackId: string | null) => {
          const list = criteriaForTrack(criteria, trackId);
          const total = list.reduce((a, c) => a + c.weight, 0);
          return list.map((c) => ({ ...c, weightPercent: total > 0 ? (100 * c.weight) / total : 0 }));
        };
        return {
          criteria,
          byTrack: [
            { trackId: null, trackName: "All tracks", criteria: rubricFor(null) },
            ...tracks.map((tr) => ({ trackId: tr.id, trackName: tr.name, criteria: rubricFor(tr.id) })),
          ],
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/register",
    summary: "Register for an event",
    tags: ["Teams"],
    auth: "event:register",
    status: 201,
    async handler({ app, params, actor, user, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        if (event.status !== "published") throw forbidden("Registration is closed for this event", "REGISTRATION_CLOSED");
        if (app.now() >= Date.parse(event.submission_deadline)) {
          throw forbidden("Registration closed at the submission deadline", "DEADLINE_PASSED");
        }
        if (await judgeScope(t, user.id, event.id)) throw conflict("Judges cannot register as participants", "JUDGE_CONFLICT");
        await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
          event.id,
          user.id,
        ]);
        await audit(t, actor, {
          eventId: event.id,
          action: "registration.created",
          entityType: "registration",
          entityId: user.id,
          summary: `${user.name} registered`,
        });
        return { registered: true };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/register",
    summary: "Withdraw your registration (leave your team first)",
    tags: ["Teams"],
    auth: "event:register",
    async handler({ params, actor, user, tx }) {
      await tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        if (await teamOf(t, user.id, event.id)) throw conflict("Leave your team before withdrawing", "ON_A_TEAM");
        await t.query("DELETE FROM registrations WHERE event_id = $1 AND user_id = $2", [event.id, user.id]);
        await audit(t, actor, {
          eventId: event.id,
          action: "registration.withdrawn",
          entityType: "registration",
          entityId: user.id,
          summary: `${user.name} withdrew`,
        });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/organizers",
    summary: "List co-organizers",
    tags: ["Events"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        return many(
          t,
          `SELECT u.id, u.name, u.email FROM event_organizers o JOIN users u ON u.id = o.user_id
            WHERE o.event_id = $1 ORDER BY o.created_at`,
          [event.id],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/organizers",
    summary: "Add a co-organizer by email (must already have the organizer role)",
    tags: ["Events"],
    auth: "event:manage",
    body: z.object({ email }),
    status: 201,
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const u = await one<{ id: string; role: string; name: string }>(
          t,
          "SELECT id, role, name FROM users WHERE lower(email) = $1",
          [body.email],
        );
        if (!u) throw notFound("User");
        if (u.role !== "organizer" && u.role !== "admin") {
          throw unprocessable("That user is not an organizer", undefined, "NOT_AN_ORGANIZER");
        }
        await t.query("INSERT INTO event_organizers (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
          event.id,
          u.id,
        ]);
        await audit(t, actor, {
          eventId: event.id,
          action: "organizer.added",
          entityType: "user",
          entityId: u.id,
          summary: `${u.name} added as organizer`,
        });
        return { id: u.id };
      });
    },
  }),
];
