import type { EventStatus } from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { forbidden, notFound } from "../lib/errors";
import type { Actor, AuthUser } from "../http/context";

export interface EventRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  rules: string;
  location: string;
  status: EventStatus;
  starts_at: string;
  submission_deadline: string;
  judging_ends_at: string | null;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  results_published_at: string | null;
  min_team_size: number;
  max_team_size: number;
  voting_mode: "off" | "open" | "email" | "authenticated";
  voting_style: "single" | "quadratic";
  vote_budget: number;
  reviews_per_submission: number;
  norm_target_mean: number;
  norm_target_sd: number;
  norm_min_sample: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function findEvent(tx: Tx, idOrSlug: string): Promise<EventRow | null> {
  return one<EventRow>(tx, "SELECT * FROM events WHERE id = $1 OR slug = $1 LIMIT 1", [idOrSlug]);
}

export async function isEventOrganizer(tx: Tx, user: AuthUser | null, eventId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "organizer") return false;
  const row = await one(tx, "SELECT 1 FROM event_organizers WHERE event_id = $1 AND user_id = $2", [eventId, user.id]);
  return row !== null;
}

/** Event visible to the caller: published/archived for everyone, drafts for its organizers. */
export async function loadVisibleEvent(tx: Tx, actor: Actor, idOrSlug: string): Promise<EventRow> {
  const event = await findEvent(tx, idOrSlug);
  if (!event) throw notFound("Event");
  if (event.status === "draft" && !(await isEventOrganizer(tx, actor.user, event.id))) {
    throw notFound("Event");
  }
  return event;
}

/** Organizer of this event (or admin); 404 for drafts you cannot see, 403 otherwise. */
export async function loadManagedEvent(tx: Tx, actor: Actor, idOrSlug: string): Promise<EventRow> {
  const event = await findEvent(tx, idOrSlug);
  if (!event) throw notFound("Event");
  if (!(await isEventOrganizer(tx, actor.user, event.id))) {
    if (event.status === "draft") throw notFound("Event");
    throw forbidden("Only this event's organizers can do that", "NOT_EVENT_ORGANIZER");
  }
  return event;
}

export interface JudgeScope {
  trackIds: string[] | null;
}

export async function judgeScope(tx: Tx, userId: string, eventId: string): Promise<JudgeScope | null> {
  const row = await one<{ track_ids: string[] | null }>(
    tx,
    "SELECT track_ids FROM event_judges WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  return row ? { trackIds: row.track_ids } : null;
}

/** Judge of this event with role `judge`; otherwise 403. */
export async function requireEventJudge(tx: Tx, actor: Actor, eventId: string): Promise<JudgeScope> {
  if (!actor.user || actor.user.role !== "judge") throw forbidden("Only judges can do that", "NOT_A_JUDGE");
  const scope = await judgeScope(tx, actor.user.id, eventId);
  if (!scope) throw forbidden("You are not a judge for this event", "NOT_EVENT_JUDGE");
  return scope;
}

export function inScope(scope: JudgeScope, trackId: string | null): boolean {
  return scope.trackIds === null || (trackId !== null && scope.trackIds.includes(trackId));
}

export async function teamOf(tx: Tx, userId: string, eventId: string): Promise<string | null> {
  const row = await one<{ team_id: string }>(
    tx,
    "SELECT team_id FROM team_members WHERE event_id = $1 AND user_id = $2",
    [eventId, userId],
  );
  return row?.team_id ?? null;
}

export async function teamMemberIds(tx: Tx, teamId: string): Promise<string[]> {
  const rows = await many<{ user_id: string }>(tx, "SELECT user_id FROM team_members WHERE team_id = $1", [teamId]);
  return rows.map((r) => r.user_id);
}
