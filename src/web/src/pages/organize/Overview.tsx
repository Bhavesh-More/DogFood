import { useMutation, useQuery } from "@tanstack/react-query";
import type { JudgeProgressDto, SubmissionDto } from "@dogfood/core";
import { errorMessage, get, post } from "../../lib/api";
import { pct } from "../../lib/format";
import { formatDateTime } from "../../lib/time";
import { Avatar, Banner, Button, Card, Icon, LinearProgress, LinkButton, SectionHeader, StatTile, useToast } from "../../ui";
import { useOrganize } from "./common";

interface Coverage {
  reviewsPerSubmission: number;
  gaps: { id: string; title: string; reviews: number }[];
}

export function OverviewPage() {
  const { event: e, refresh } = useOrganize();
  const toast = useToast();
  const judges = useQuery({ queryKey: ["org-judges", e.id], queryFn: () => get<JudgeProgressDto[]>(`/api/events/${e.id}/judges`) });
  const subs = useQuery({ queryKey: ["org-subs", e.id], queryFn: () => get<SubmissionDto[]>(`/api/events/${e.id}/submissions`) });
  const coverage = useQuery({ queryKey: ["org-assignments", e.id], queryFn: () => get<Coverage>(`/api/events/${e.id}/assignments`) });
  const flagged = useQuery({
    queryKey: ["org-votes", e.id, "flagged"],
    queryFn: () => get<unknown[]>(`/api/events/${e.id}/votes`, { status: "flagged" }),
    enabled: e.votingMode !== "off",
  });
  const publish = useMutation({
    mutationFn: () => post(`/api/events/${e.id}/publish`),
    onSuccess: () => {
      toast.success("Event published");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submitted = subs.data?.filter((s) => s.status === "submitted") ?? [];
  const drafts = subs.data?.filter((s) => s.status === "draft") ?? [];
  const pendingEligibility = submitted.filter((s) => s.eligibility === "pending");
  const assigned = judges.data?.reduce((a, j) => a + j.assigned, 0) ?? 0;
  const done = judges.data?.reduce((a, j) => a + j.submitted, 0) ?? 0;

  return (
    <div className="flex flex-col gap-8">
      {e.status === "draft" ? (
        <Banner tone="warning" icon="visibility_off" title="This event is a private draft" action={<Button icon="public" onClick={() => publish.mutate()} loading={publish.isPending}>Publish</Button>}>
          Only organizers can see it. Publish when tracks, rubric and schedule are ready.
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 expanded:grid-cols-4">
        <StatTile label="Registered" value={e.stats.registrations} icon="how_to_reg" tone="primary" />
        <StatTile label="Teams" value={e.stats.teams} icon="groups" tone="secondary" />
        <StatTile label="Submitted" value={submitted.length} icon="rocket_launch" tone="tertiary" hint={`${drafts.length} drafts not submitted`} />
        <StatTile label="Ballots" value={`${done}/${assigned}`} icon="rate_review" tone="success" hint={`${pct(done, assigned)}% of routed reviews`} />
      </div>

      <div className="grid grid-cols-1 gap-6 expanded:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <SectionHeader title="Judging progress" action={<LinkButton to="judges" variant="text" trailingIcon="arrow_forward">Manage</LinkButton>} level={3} />
          <Card variant="filled" radius="2xl">
            {judges.data?.length ? (
              <ul className="flex flex-col gap-4">
                {judges.data.map((j) => (
                  <li key={j.judgeId} className="flex items-center gap-3">
                    <Avatar name={j.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="truncate type-title-sm text-on-surface">{j.name}</p>
                        <p className="type-label-md tabular-nums text-on-surface-variant">
                          {j.submitted}/{j.assigned}
                        </p>
                      </div>
                      <LinearProgress value={j.submitted} max={j.assigned || 1} label={`${j.name} progress`} tone={j.assigned && j.submitted === j.assigned ? "success" : "primary"} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body-md text-on-surface-variant">No judges yet. Create an invitation link on the Judges page.</p>
            )}
          </Card>
        </section>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Needs attention" level={3} />
          {pendingEligibility.length ? (
            <Banner tone="warning" icon="rule" title={`${pendingEligibility.length} submissions awaiting eligibility review`} action={<LinkButton to="submissions" size="xs" variant="tonal">Review</LinkButton>} />
          ) : null}
          {coverage.data?.gaps.length ? (
            <Banner tone="warning" icon="hub" title={`${coverage.data.gaps.length} projects below ${coverage.data.reviewsPerSubmission} reviews`} action={<LinkButton to="judges" size="xs" variant="tonal">Route</LinkButton>} />
          ) : null}
          {flagged.data?.length ? (
            <Banner tone="error" icon="gpp_maybe" title={`${flagged.data.length} flagged votes`} action={<LinkButton to="votes" size="xs" variant="tonal">Inspect</LinkButton>} />
          ) : null}
          {!pendingEligibility.length && !coverage.data?.gaps.length && !flagged.data?.length ? (
            <Banner tone="success" icon="task_alt" title="All clear">Nothing needs your attention right now.</Banner>
          ) : null}
          <Card variant="outlined" radius="xl">
            <p className="mb-3 type-title-sm text-on-surface">Schedule (server time)</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-body-sm">
              <dt className="text-on-surface-variant">Starts</dt>
              <dd className="text-on-surface">{formatDateTime(e.startsAt)}</dd>
              <dt className="text-on-surface-variant">Deadline</dt>
              <dd className="font-mono text-on-surface">{e.submissionDeadline.slice(0, 16).replace("T", " ")} UTC</dd>
              {e.votingOpensAt ? (
                <>
                  <dt className="text-on-surface-variant">Voting</dt>
                  <dd className="text-on-surface">
                    {formatDateTime(e.votingOpensAt)} → {formatDateTime(e.votingClosesAt)}
                  </dd>
                </>
              ) : null}
              <dt className="text-on-surface-variant">Results</dt>
              <dd className="text-on-surface">{e.resultsPublishedAt ? formatDateTime(e.resultsPublishedAt) : "Not published"}</dd>
            </dl>
            <LinkButton to="settings" variant="text" size="xs" icon="edit" className="mt-3">
              Edit schedule
            </LinkButton>
          </Card>
          <Card variant="tonal" radius="xl" className="flex items-center gap-3">
            <Icon name="query_stats" size={28} />
            <div className="flex-1">
              <p className="type-title-sm">Results lab</p>
              <p className="type-body-sm opacity-80">Normalize, inspect judge bias, publish.</p>
            </div>
            <LinkButton to="results" size="xs">Open</LinkButton>
          </Card>
        </section>
      </div>
    </div>
  );
}
