import type { EventPhase, EventSummaryDto } from "@dogfood/core";
import { PHASE_LABEL, PHASE_TONE } from "../lib/format";
import { formatDate } from "../lib/time";
import { Card, GeneratedArt, Icon, Pill } from "../ui";
import { Countdown } from "./Countdown";

export function PhasePill({ phase }: { phase: EventPhase }) {
  const icon = phase === "submissions_open" ? "bolt" : phase === "judging" ? "gavel" : phase === "results" ? "trophy" : phase === "archived" ? "history" : "schedule";
  return (
    <Pill tone={PHASE_TONE[phase]} icon={icon}>
      {PHASE_LABEL[phase]}
    </Pill>
  );
}

export function EventCard({ event, featured }: { event: EventSummaryDto; featured?: boolean }) {
  return (
    <Card to={`/e/${event.slug}`} variant="elevated" padded={false} radius="xl" className="group flex h-full flex-col">
      <div className="relative">
        <GeneratedArt seed={event.id} label={event.name} className={featured ? "h-44" : "h-32"} />
        <div className="absolute left-3 top-3">
          <PhasePill phase={event.phase} />
        </div>
      </div>
      <div className="relative z-[1] flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="type-title-lg text-on-surface group-hover:text-primary">{event.name}</h3>
          <p className="mt-1 line-clamp-2 type-body-md text-on-surface-variant">{event.tagline}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 type-body-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar_month" size={16} /> {formatDate(event.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="groups" size={16} /> {event.stats.teams} teams
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="rocket_launch" size={16} /> {event.stats.submissions} projects
          </span>
        </div>
        {event.phase === "submissions_open" ? (
          <div className="flex items-center justify-between rounded-md bg-primary-container px-3 py-2 type-label-lg text-on-primary-container">
            <span className="inline-flex items-center gap-1">
              <Icon name="timer" size={18} /> Deadline in
            </span>
            <Countdown target={event.submissionDeadline} label="Deadline" compact />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
