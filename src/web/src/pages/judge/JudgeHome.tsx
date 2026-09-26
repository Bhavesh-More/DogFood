import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { get } from "../../lib/api";
import { useSession } from "../../lib/session";
import { formatDate } from "../../lib/time";
import { Card, EmptyState, ErrorState, Icon, LinkButton, PageLoader, Pill, ProgressRing } from "../../ui";

export interface JudgeEventRow {
  id: string;
  slug: string;
  name: string;
  submissionDeadline: string;
  judgingEndsAt: string | null;
  resultsPublishedAt: string | null;
  trackIds: string[] | null;
  assigned: number;
  submitted: number;
}

export function JudgeHomePage() {
  const { user, loading } = useSession();
  const q = useQuery({ queryKey: ["judge-events"], queryFn: () => get<JudgeEventRow[]>("/api/judge/events"), enabled: user?.role === "judge" });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/judge" replace />;
  if (user.role !== "judge") return <EmptyState icon="gavel" title="Judging is for judge accounts" body="Ask an organizer for a judge invitation link." />;
  if (q.isPending) return <PageLoader label="Loading your events" />;
  if (q.error) return <ErrorState error={q.error} />;
  const totalAssigned = q.data.reduce((a, e) => a + e.assigned, 0);
  const totalDone = q.data.reduce((a, e) => a + e.submitted, 0);
  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-center justify-between gap-6 py-6">
        <div>
          <h1 className="type-display-sm type-emphasized text-on-surface">Judging</h1>
          <p className="mt-2 max-w-xl type-body-lg text-on-surface-variant">
            You only ever see projects assigned to you and your own ballots. Score honestly on your own scale — normalization takes care of the rest.
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-surface-container-low p-4">
          <ProgressRing value={totalDone} max={totalAssigned || 1} size={72} label="Overall progress">
            <span className="type-title-md text-on-surface">{totalAssigned ? Math.round((100 * totalDone) / totalAssigned) : 0}%</span>
          </ProgressRing>
          <div>
            <p className="type-label-md text-on-surface-variant">Ballots submitted</p>
            <p className="type-headline-sm text-on-surface">
              {totalDone} / {totalAssigned}
            </p>
          </div>
        </div>
      </header>
      {q.data.length === 0 ? (
        <EmptyState icon="rate_review" title="No judging assignments yet" body="Once an organizer invites you and routes projects, they appear here." />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
          {q.data.map((e) => {
            const done = e.assigned > 0 && e.submitted === e.assigned;
            return (
              <Card key={e.id} variant="elevated" radius="2xl" className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="type-title-lg text-on-surface">{e.name}</p>
                    <p className="type-body-sm text-on-surface-variant">Submissions closed {formatDate(e.submissionDeadline)}</p>
                  </div>
                  <ProgressRing value={e.submitted} max={e.assigned || 1} size={56} label={`${e.name} progress`} tone={done ? "success" : "primary"}>
                    <Icon name={done ? "done_all" : "rate_review"} size={20} className={done ? "text-success" : "text-primary"} />
                  </ProgressRing>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone={done ? "success" : "tertiary"}>
                    {e.submitted}/{e.assigned} scored
                  </Pill>
                  <Pill tone="neutral" icon="category">
                    {e.trackIds ? `${e.trackIds.length} track scope` : "All tracks"}
                  </Pill>
                  {e.resultsPublishedAt ? <Pill tone="neutral" icon="lock">Results published</Pill> : null}
                </div>
                <div className="mt-auto flex gap-2">
                  <LinkButton to={`/judge/${e.slug}`} icon="view_list">
                    Queue
                  </LinkButton>
                  <LinkButton to={`/judge/${e.slug}/pairwise`} variant="tonal" icon="compare_arrows">
                    Pairwise
                  </LinkButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
