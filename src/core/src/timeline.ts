/**
 * Event timeline and the server-side deadline rule.
 *
 * All instants are UTC epoch milliseconds or ISO-8601 strings. The API always
 * passes its own clock (`Date.now()`); nothing a client sends is consulted.
 */

export type EventStatus = "draft" | "published" | "archived";

export type EventPhase =
  | "draft"
  | "upcoming"
  | "submissions_open"
  | "judging"
  | "results"
  | "archived";

export interface EventTimes {
  status: EventStatus;
  startsAt: string;
  submissionDeadline: string;
  judgingEndsAt: string | null;
  votingOpensAt: string | null;
  votingClosesAt: string | null;
  resultsPublishedAt: string | null;
}

export function toMillis(value: string | number | Date): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${value}`);
  return ms;
}

/**
 * The hard deadline rule. A per-team extension granted by an organizer (and
 * audit-logged) moves the cut-off for that team only.
 */
export function isBeforeDeadline(
  deadline: string | number | Date,
  now: number,
  extensionUntil?: string | number | Date | null,
): boolean {
  const cutoff = Math.max(
    toMillis(deadline),
    extensionUntil ? toMillis(extensionUntil) : Number.NEGATIVE_INFINITY,
  );
  return now < cutoff;
}

export function eventPhase(e: EventTimes, now: number): EventPhase {
  if (e.status === "draft") return "draft";
  if (e.status === "archived") return "archived";
  if (e.resultsPublishedAt && now >= toMillis(e.resultsPublishedAt)) return "results";
  if (now < toMillis(e.startsAt)) return "upcoming";
  if (now < toMillis(e.submissionDeadline)) return "submissions_open";
  return "judging";
}

export function isVotingOpen(e: EventTimes, now: number): boolean {
  if (e.status !== "published" || !e.votingOpensAt || !e.votingClosesAt) return false;
  return now >= toMillis(e.votingOpensAt) && now < toMillis(e.votingClosesAt);
}

/** Community tallies stay hidden until the voting window has closed. */
export function areVoteTalliesVisible(e: EventTimes, now: number): boolean {
  if (!e.votingClosesAt) return false;
  return now >= toMillis(e.votingClosesAt);
}

export function areResultsPublic(e: EventTimes, now: number): boolean {
  return Boolean(e.resultsPublishedAt && now >= toMillis(e.resultsPublishedAt));
}

export interface TimelineStep {
  key: "registration" | "hacking" | "deadline" | "judging" | "voting" | "results";
  label: string;
  at: string | null;
  until: string | null;
  state: "done" | "active" | "upcoming";
}

export function timeline(e: EventTimes, now: number): TimelineStep[] {
  const state = (from: string | null, to: string | null): TimelineStep["state"] => {
    const start = from ? toMillis(from) : Number.NEGATIVE_INFINITY;
    const end = to ? toMillis(to) : Number.POSITIVE_INFINITY;
    if (now >= end) return "done";
    if (now >= start) return "active";
    return "upcoming";
  };
  const steps: TimelineStep[] = [
    {
      key: "registration",
      label: "Registration & team formation",
      at: null,
      until: e.submissionDeadline,
      state: state(null, e.submissionDeadline),
    },
    {
      key: "hacking",
      label: "Hacking window",
      at: e.startsAt,
      until: e.submissionDeadline,
      state: state(e.startsAt, e.submissionDeadline),
    },
    {
      key: "deadline",
      label: "Submission deadline (hard, UTC)",
      at: e.submissionDeadline,
      until: e.submissionDeadline,
      state: now >= toMillis(e.submissionDeadline) ? "done" : "upcoming",
    },
    {
      key: "judging",
      label: "Judging",
      at: e.submissionDeadline,
      until: e.judgingEndsAt,
      state: state(e.submissionDeadline, e.judgingEndsAt ?? e.resultsPublishedAt),
    },
  ];
  if (e.votingOpensAt && e.votingClosesAt) {
    steps.push({
      key: "voting",
      label: "Community voting",
      at: e.votingOpensAt,
      until: e.votingClosesAt,
      state: state(e.votingOpensAt, e.votingClosesAt),
    });
  }
  steps.push({
    key: "results",
    label: "Results",
    at: e.resultsPublishedAt,
    until: null,
    state: e.resultsPublishedAt && now >= toMillis(e.resultsPublishedAt) ? "done" : "upcoming",
  });
  return steps;
}

/** Human countdown parts for the deadline banner. */
export function countdown(target: string | number, now: number) {
  const diff = Math.max(0, toMillis(target) - now);
  const seconds = Math.floor(diff / 1000);
  return {
    totalMs: diff,
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}
