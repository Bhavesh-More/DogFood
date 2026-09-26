import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import type { AssignmentDto } from "@dogfood/core";
import { get } from "../../lib/api";
import { cx } from "../../lib/format";
import { useEvent } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { relativeTime } from "../../lib/time";
import { Cover, EmptyState, ErrorState, Icon, LinearProgress, LinkButton, PageLoader, Pill } from "../../ui";

const STATUS = {
  pending: { tone: "neutral" as const, label: "Not started", icon: "hourglass_empty" as const },
  in_progress: { tone: "warning" as const, label: "In progress", icon: "edit" as const },
  submitted: { tone: "success" as const, label: "Submitted", icon: "check_circle" as const },
};

export function JudgeQueuePage() {
  const { slug } = useParams();
  const { user, loading } = useSession();
  const event = useEvent(slug);
  const q = useQuery({
    queryKey: ["judge-queue", event.data?.id],
    queryFn: () => get<AssignmentDto[]>(`/api/judge/events/${event.data!.id}/assignments`),
    enabled: Boolean(event.data),
  });
  if (loading || event.isPending) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=/judge/${slug}`} replace />;
  if (event.error) return <ErrorState error={event.error} />;
  if (q.isPending) return <PageLoader label="Loading your queue" />;
  if (q.error) return <ErrorState error={q.error} />;
  const items = q.data;
  const done = items.filter((a) => a.status === "submitted").length;
  const next = items.find((a) => a.status !== "submitted");
  return (
    <div className="animate-enter">
      <header className="py-6">
        <Link to="/judge" className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
          <Icon name="arrow_back" size={18} /> Judging
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-display-sm type-emphasized text-on-surface">{event.data.name}</h1>
            <p className="mt-1 type-body-lg text-on-surface-variant">Your review queue</p>
          </div>
          <div className="flex gap-2">
            <LinkButton to={`/judge/${slug}/pairwise`} variant="tonal" icon="compare_arrows">
              Pairwise mode
            </LinkButton>
            {next ? (
              <LinkButton to={`/judge/${slug}/a/${next.id}`} icon="play_arrow">
                {done ? "Continue" : "Start judging"}
              </LinkButton>
            ) : null}
          </div>
        </div>
        <div className="mt-6 rounded-xl bg-surface-container-low p-4">
          <div className="mb-2 flex justify-between type-label-lg">
            <span className="text-on-surface">
              {done} of {items.length} evaluated
            </span>
            <span className="text-on-surface-variant">{items.length - done} left</span>
          </div>
          <LinearProgress value={done} max={items.length || 1} label="Queue progress" wavy tone={done === items.length && items.length ? "success" : "primary"} />
        </div>
      </header>
      {items.length === 0 ? (
        <EmptyState icon="rate_review" title="No projects assigned to you yet" body="The organizers haven't routed projects to you. Check back soon." />
      ) : (
        <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 expanded:grid-cols-3">
          {items.map((a) => {
            const s = STATUS[a.status];
            return (
              <li key={a.id}>
                <Link
                  to={`/judge/${slug}/a/${a.id}`}
                  className={cx(
                    "state-layer focus-ring flex h-full items-center gap-4 overflow-hidden rounded-xl p-3 transition-[border-radius] duration-500 ease-[var(--ease-spring-default)] active:rounded-lg",
                    a.status === "submitted" ? "bg-surface-container-low" : "bg-surface-container-high",
                  )}
                >
                  <Cover seed={a.submissionId} label={a.submissionTitle} className="h-20 w-20 shrink-0 rounded-lg" />
                  <div className="relative z-[1] min-w-0 flex-1">
                    <p className="truncate type-title-md text-on-surface">{a.submissionTitle}</p>
                    <p className="truncate type-body-sm text-on-surface-variant">
                      {a.teamName}
                      {a.trackName ? ` · ${a.trackName}` : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Pill tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Pill>
                      <span className="type-body-sm text-on-surface-variant">{relativeTime(a.updatedAt)}</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" size={24} className="relative z-[1] text-on-surface-variant" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
