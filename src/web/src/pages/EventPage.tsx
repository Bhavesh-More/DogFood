import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import type { CriterionDto, EventDto } from "@dogfood/core";
import { Countdown } from "../components/Countdown";
import { PhasePill } from "../components/EventCard";
import { get, post, errorMessage } from "../lib/api";
import { plural } from "../lib/format";
import { keys, useEvent } from "../lib/queries";
import { useSession } from "../lib/session";
import { formatDateTime, formatUtc } from "../lib/time";
import { Banner, Button, Card, ErrorState, GeneratedArt, Icon, LinkButton, PageLoader, Pill, Shape, Tabs, useToast, type IconName } from "../ui";

type Tab = "overview" | "timeline" | "prizes" | "rubric" | "rules";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 type-body-lg text-on-surface">
      {text.split(/\n{1,}/).filter(Boolean).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-surface-container-highest text-on-surface-variant">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="type-label-md text-on-surface-variant">{label}</p>
        <p className="type-title-sm text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function ActionCard({ event }: { event: EventDto }) {
  const { user, role } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const register = useMutation({
    mutationFn: () => post(`/api/events/${event.id}/register`),
    onSuccess: () => {
      toast.success("You're registered — now form a team.");
      qc.invalidateQueries({ queryKey: keys.event(event.slug) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = event.phase === "submissions_open" || event.phase === "upcoming";
  const v = event.viewer;
  let primary: React.ReactNode = null;
  if (v.isOrganizer) {
    primary = <LinkButton to={`/organize/${event.slug}`} size="md" icon="dashboard" fullWidth>Manage event</LinkButton>;
  } else if (v.isJudge) {
    primary = <LinkButton to={`/judge/${event.slug}`} size="md" icon="gavel" fullWidth>Open judging queue</LinkButton>;
  } else if (open && !user) {
    primary = <LinkButton to={`/login?next=/e/${event.slug}`} size="md" icon="login" fullWidth>Sign in to participate</LinkButton>;
  } else if (open && role === "participant") {
    primary = v.teamId ? (
      <div className="flex flex-col gap-2">
        <LinkButton to={`/e/${event.slug}/submit`} size="md" icon="edit" fullWidth>Edit submission</LinkButton>
        <LinkButton to={`/e/${event.slug}/team`} variant="tonal" icon="groups" fullWidth>My team</LinkButton>
      </div>
    ) : v.registered ? (
      <LinkButton to={`/e/${event.slug}/team`} size="md" icon="group_add" fullWidth>Create or join a team</LinkButton>
    ) : (
      <Button size="md" icon="how_to_reg" fullWidth loading={register.isPending} onClick={() => register.mutate()}>Register now</Button>
    );
  } else if (event.votingOpen) {
    primary = <LinkButton to={`/e/${event.slug}/gallery`} size="md" icon="how_to_vote" fullWidth variant="tertiary">Vote in the gallery</LinkButton>;
  } else if (event.phase === "results" || event.resultsPublishedAt) {
    primary = <LinkButton to={`/e/${event.slug}/results`} size="md" icon="trophy" fullWidth>See results</LinkButton>;
  } else if (v.teamId) {
    primary = <LinkButton to={`/e/${event.slug}/submit`} size="md" icon="visibility" fullWidth variant="tonal">View my submission</LinkButton>;
  }
  return (
    <Card variant="elevated" radius="2xl" className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <PhasePill phase={event.phase} />
        {v.registered ? <Pill tone="success" icon="how_to_reg">Registered</Pill> : null}
      </div>
      {event.phase === "submissions_open" || event.phase === "upcoming" ? (
        <Countdown target={event.phase === "upcoming" ? event.startsAt : event.submissionDeadline} label={event.phase === "upcoming" ? "Starts in" : "Submissions close in"} />
      ) : event.votingOpen && event.votingClosesAt ? (
        <Countdown target={event.votingClosesAt} label="Community voting closes in" tone="tertiary" />
      ) : (
        <div className="rounded-lg bg-surface-container-high p-4">
          <p className="type-label-md text-on-surface-variant">Submissions closed</p>
          <p className="font-mono type-body-md text-on-surface">{formatUtc(event.submissionDeadline)}</p>
        </div>
      )}
      {primary}
      <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-5">
        <Fact icon="groups" label="Team size" value={event.minTeamSize === event.maxTeamSize ? `${event.maxTeamSize}` : `${event.minTeamSize}–${event.maxTeamSize}`} />
        <Fact icon="how_to_reg" label="Registered" value={String(event.stats.registrations)} />
        <Fact icon="diversity_3" label="Teams" value={String(event.stats.teams)} />
        <Fact icon="rocket_launch" label="Projects" value={String(event.stats.submissions)} />
      </div>
      {event.votingMode !== "off" ? (
        <div className="flex items-center gap-2 rounded-md bg-tertiary-container px-3 py-2 type-body-sm text-on-tertiary-container">
          <Icon name="how_to_vote" size={18} />
          {event.votingStyle === "quadratic" ? `Quadratic voting · ${event.quadraticCredits} credits` : `Community vote · back up to ${event.quadraticCredits}`} ·{" "}
          {event.votingMode === "open" ? "open link" : event.votingMode === "email" ? "email-verified" : "sign-in required"}
        </div>
      ) : null}
    </Card>
  );
}

function RubricTab({ eventId }: { eventId: string }) {
  const q = useQuery({
    queryKey: ["criteria", eventId],
    queryFn: () => get<{ byTrack: { trackId: string | null; trackName: string; criteria: (CriterionDto & { weightPercent: number })[] }[] }>(`/api/events/${eventId}/criteria`),
  });
  if (q.isPending) return <PageLoader label="Loading rubric" />;
  if (q.error) return <ErrorState error={q.error} />;
  const groups = q.data.byTrack.filter((g, i) => i === 0 || g.criteria.some((c) => c.trackId === g.trackId));
  return (
    <div className="flex flex-col gap-6">
      <Banner tone="primary" icon="balance" title="How scores are made fair">
        Each judge's weighted total is normalized against their own scoring habits before projects are ranked, so it doesn't matter
        which judges you were assigned.
      </Banner>
      {groups.map((g) => (
        <div key={g.trackId ?? "all"}>
          <h3 className="mb-3 type-title-md text-on-surface">{g.trackId ? `${g.trackName} track` : "All tracks"}</h3>
          <ul className="flex flex-col gap-3">
            {g.criteria.map((c) => (
              <li key={c.id} className="rounded-lg bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="type-title-sm text-on-surface">{c.name}</p>
                  <span className="type-label-lg text-on-surface">{c.weightPercent.toFixed(0)}%</span>
                </div>
                {c.description ? <p className="type-body-sm text-on-surface-variant">{c.description}</p> : null}
                <div className="mt-2 h-2 rounded-r-[4px] bg-primary" style={{ width: `${c.weightPercent}%` }} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function EventPage() {
  const { slug } = useParams();
  const event = useEvent(slug);
  const [tab, setTab] = useState<Tab>("overview");
  if (event.isPending) return <PageLoader label="Loading event" />;
  if (event.error) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;
  const e = event.data;
  return (
    <div className="animate-enter">
      {/* Banner */}
      <section className="relative mt-2 overflow-hidden rounded-2xl">
        <GeneratedArt seed={e.id} className="h-48 w-full medium:h-64" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white medium:p-8">
          <p className="inline-flex items-center gap-1.5 type-label-lg opacity-90">
            <Icon name="public" size={18} /> {e.location}
          </p>
          <h1 className="mt-1 font-rounded text-4xl font-bold leading-tight [font-variation-settings:'ROND'_100] medium:text-5xl">{e.name}</h1>
          <p className="mt-1 max-w-2xl type-body-lg opacity-90">{e.tagline}</p>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton to={`/e/${e.slug}/gallery`} variant="tonal" icon="grid_view">Project gallery</LinkButton>
        {e.resultsPublishedAt ? <LinkButton to={`/e/${e.slug}/results`} variant="tonal" icon="leaderboard">Results</LinkButton> : null}
        {e.tracks.map((t) => (
          <Pill key={t.id} tone="secondary" icon="category">{t.name}</Pill>
        ))}
      </div>

      <div className="mt-6 grid gap-6 expanded:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Tabs
            label="Event sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "overview", label: "Overview", icon: "article" },
              { value: "timeline", label: "Timeline", icon: "schedule" },
              { value: "prizes", label: `Tracks & prizes`, icon: "trophy" },
              { value: "rubric", label: "Judging", icon: "balance" },
              { value: "rules", label: "Rules", icon: "rule" },
            ]}
          />
          <div className="py-6" role="tabpanel">
            {tab === "overview" ? (
              <div className="flex flex-col gap-6">
                <Paragraphs text={e.description || "No description yet."} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card variant="primary" className="flex flex-col gap-1">
                    <Icon name="timer" size={24} />
                    <p className="type-label-md opacity-80">Hard deadline</p>
                    <p className="font-mono type-body-md">{formatUtc(e.submissionDeadline)}</p>
                  </Card>
                  <Card variant="tertiary" className="flex flex-col gap-1">
                    <Icon name="balance" size={24} />
                    <p className="type-label-md opacity-80">Normalization</p>
                    <p className="type-body-md">
                      Z-score · target {e.normalization.targetMean}±{e.normalization.targetSd}
                    </p>
                  </Card>
                  <Card variant="tonal" className="flex flex-col gap-1">
                    <Icon name="rate_review" size={24} />
                    <p className="type-label-md opacity-80">Reviews per project</p>
                    <p className="type-body-md">{plural(e.reviewsPerSubmission, "judge")}</p>
                  </Card>
                </div>
                {e.questions.length ? (
                  <div>
                    <h3 className="mb-2 type-title-md text-on-surface">You'll be asked</h3>
                    <ul className="flex flex-col gap-2">
                      {e.questions.map((q) => (
                        <li key={q.id} className="flex items-start gap-2 type-body-md text-on-surface-variant">
                          <Icon name="chat_bubble" size={18} className="mt-0.5 text-primary" /> {q.label}
                          {q.required ? <span className="text-error">*</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : tab === "timeline" ? (
              <ol className="relative flex flex-col gap-4 pl-2">
                {e.timeline.map((step) => (
                  <li key={step.key} className="flex gap-4">
                    <Shape name={step.state === "active" ? "sunny" : "circle"} className={step.state === "done" ? "h-10 w-10 text-success-container" : step.state === "active" ? "h-10 w-10 text-primary" : "h-10 w-10 text-surface-container-highest"}>
                      <Icon name={step.state === "done" ? "check" : step.state === "active" ? "bolt" : "schedule"} size={20} className={step.state === "active" ? "text-on-primary" : step.state === "done" ? "text-on-success-container" : "text-on-surface-variant"} />
                    </Shape>
                    <div className="pb-2">
                      <p className="type-title-md text-on-surface">{step.label}</p>
                      <p className="type-body-sm text-on-surface-variant">
                        {step.at ? formatDateTime(step.at) : "From publication"}
                        {step.until && step.until !== step.at ? ` → ${formatDateTime(step.until)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : tab === "prizes" ? (
              <div className="flex flex-col gap-6">
                {e.tracks.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {e.tracks.map((t) => (
                      <Card key={t.id} variant="outlined">
                        <p className="type-title-md text-on-surface">{t.name}</p>
                        <p className="mt-1 type-body-md text-on-surface-variant">{t.description}</p>
                      </Card>
                    ))}
                  </div>
                ) : null}
                <ul className="grid gap-3 sm:grid-cols-2">
                  {e.prizes.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-4 rounded-xl bg-surface-container-low p-4">
                      <Shape name={i === 0 ? "burst" : "cookie9"} className={i === 0 ? "h-14 w-14 text-tertiary-container" : "h-14 w-14 text-secondary-container"}>
                        <Icon name={i === 0 ? "trophy" : "workspace_premium"} size={24} className={i === 0 ? "text-on-tertiary-container" : "text-on-secondary-container"} />
                      </Shape>
                      <div className="min-w-0">
                        <p className="type-title-md text-on-surface">{p.name}</p>
                        <p className="type-body-sm text-on-surface-variant">{p.description}</p>
                        {p.value ? <p className="mt-1 type-title-sm text-primary">{p.value}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : tab === "rubric" ? (
              <RubricTab eventId={e.id} />
            ) : (
              <Paragraphs text={e.rules || "No additional rules."} />
            )}
          </div>
        </div>
        <aside className="expanded:sticky expanded:top-20 expanded:self-start">
          <ActionCard event={e} />
        </aside>
      </div>
    </div>
  );
}
