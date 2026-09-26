import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { weightedTotal, type AssignmentDto, type BallotDto, type CriterionDto, type EventDto, type SubmissionDto } from "@dogfood/core";
import { ApiError, errorMessage, get, post, put } from "../../lib/api";
import { fmt } from "../../lib/format";
import { useEvent } from "../../lib/queries";
import { formatUtc, useServerNow } from "../../lib/time";
import { Banner, Button, Card, Cover, Dialog, ErrorState, Icon, LinkButton, PageLoader, Pill, ScoreSlider, TextArea, TextField, useToast } from "../../ui";

interface AssignmentView {
  assignment: { id: string; status: "pending" | "in_progress" | "submitted"; eventId: string };
  submission: SubmissionDto;
  criteria: CriterionDto[];
  ballot: BallotDto;
}

export function ScorePage() {
  const { slug, assignmentId } = useParams();
  const event = useEvent(slug);
  const view = useQuery({ queryKey: ["assignment", assignmentId], queryFn: () => get<AssignmentView>(`/api/judge/assignments/${assignmentId}`) });
  if (view.isPending || event.isPending) return <PageLoader label="Loading project" />;
  if (view.error) return <ErrorState error={view.error} />;
  if (event.error) return <ErrorState error={event.error} />;
  return <ScoreForm key={assignmentId} slug={slug!} assignmentId={assignmentId!} event={event.data} view={view.data} />;
}

function ScoreForm({ slug, assignmentId, event: e, view }: { slug: string; assignmentId: string; event: EventDto; view: AssignmentView }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(30_000);
  const queue = useQuery({
    queryKey: ["judge-queue", e.id],
    queryFn: () => get<AssignmentDto[]>(`/api/judge/events/${e.id}/assignments`),
  });
  const [scores, setScores] = useState<Record<string, number>>(view.ballot.scores);
  const [comment, setComment] = useState(view.ballot.comment);
  const [recuseOpen, setRecuseOpen] = useState(false);
  const [reason, setReason] = useState("");

  const criteria = view.criteria;
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0);
  const complete = criteria.length > 0 && criteria.every((c) => scores[c.id] !== undefined);
  const preview = useMemo(() => {
    if (!complete) return null;
    try {
      return weightedTotal(scores, criteria.map((c) => ({ id: c.id, weight: c.weight, maxScore: c.maxScore })));
    } catch {
      return null;
    }
  }, [scores, criteria, complete]);

  const next = queue.data?.find((a) => a.id !== assignmentId && a.status !== "submitted");
  const save = useMutation({
    mutationFn: (submit: boolean) => put<BallotDto>(`/api/judge/assignments/${assignmentId}/ballot`, { scores, comment, submit }),
    onSuccess: (_b, submit) => {
      qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      qc.invalidateQueries({ queryKey: ["judge-queue"] });
      qc.invalidateQueries({ queryKey: ["judge-events"] });
      if (submit) {
        toast.success("Ballot submitted");
        navigate(next ? `/judge/${slug}/a/${next.id}` : `/judge/${slug}`);
      } else toast.show("Progress saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const recuse = useMutation({
    mutationFn: () => post(`/api/judge/assignments/${assignmentId}/recuse`, { reason }),
    onSuccess: () => {
      toast.show("Recused — the organizers will reassign this project.");
      qc.invalidateQueries({ queryKey: ["judge-queue"] });
      navigate(`/judge/${slug}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const { submission: s, ballot, assignment } = view;
  const locked = Boolean(e.resultsPublishedAt) || (e.judgingEndsAt ? Date.parse(e.judgingEndsAt) <= now : false);
  const questions = e.questions.filter((q) => s.answers[q.id] !== undefined && s.answers[q.id] !== "");

  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Link to={`/judge/${slug}`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
          <Icon name="arrow_back" size={18} /> Queue
        </Link>
        <div className="flex items-center gap-2">
          <Pill tone={assignment.status === "submitted" ? "success" : assignment.status === "in_progress" ? "warning" : "neutral"}>
            {assignment.status === "submitted" ? "Submitted" : assignment.status === "in_progress" ? "In progress" : "Not started"}
          </Pill>
          {next ? <LinkButton to={`/judge/${slug}/a/${next.id}`} variant="text" trailingIcon="arrow_forward">Next</LinkButton> : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 expanded:grid-cols-[minmax(0,1fr)_440px]">
        <article className="flex min-w-0 flex-col gap-5">
          <div className="overflow-hidden rounded-2xl">
            <Cover src={s.thumbnailUrl} seed={s.id} label={s.title} big className="h-48 w-full medium:h-64" />
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              {s.trackName ? <Pill tone="secondary" icon="category">{s.trackName}</Pill> : null}
              <Pill tone="neutral" icon="schedule">Submitted {formatUtc(s.submittedAt)}</Pill>
            </div>
            <h1 className="mt-3 font-rounded text-4xl font-bold text-on-surface [font-variation-settings:'ROND'_100]">{s.title}</h1>
            <p className="mt-1 type-title-md font-normal text-on-surface-variant">{s.tagline}</p>
            <p className="mt-2 type-body-md text-on-surface-variant">by {s.teamName} · {s.members.map((m) => m.name).join(", ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.repoUrl ? <LinkButton to={s.repoUrl} external icon="code">Repository</LinkButton> : null}
            {s.demoVideoUrl ? <LinkButton to={s.demoVideoUrl} external variant="tonal" icon="play_arrow">Demo</LinkButton> : null}
            {s.liveUrl ? <LinkButton to={s.liveUrl} external variant="outlined" icon="open_in_new">Live</LinkButton> : null}
          </div>
          <div className="flex flex-col gap-3 type-body-lg text-on-surface">
            {s.description.split(/\n+/).filter(Boolean).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {s.techTags.length ? (
            <div className="flex flex-wrap gap-2">
              {s.techTags.map((t) => (
                <span key={t} className="rounded-sm bg-surface-container-highest px-2 py-1 font-mono type-label-md text-on-surface">{t}</span>
              ))}
            </div>
          ) : null}
          {questions.length ? (
            <Card variant="outlined">
              <h2 className="mb-3 type-title-md text-on-surface">Team's answers</h2>
              <dl className="flex flex-col gap-3">
                {questions.map((q) => (
                  <div key={q.id}>
                    <dt className="type-label-lg text-on-surface-variant">{q.label}</dt>
                    <dd className="type-body-md text-on-surface">{typeof s.answers[q.id] === "boolean" ? (s.answers[q.id] ? "Yes" : "No") : String(s.answers[q.id])}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
          <div>
            <Button variant="text" icon="report" onClick={() => setRecuseOpen(true)}>
              I have a conflict of interest
            </Button>
          </div>
        </article>

        <aside className="expanded:sticky expanded:top-20 expanded:self-start">
          <Card variant="elevated" radius="2xl" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="type-title-lg text-on-surface">Your ballot</h2>
              <div className="text-right">
                <p className="type-label-sm text-on-surface-variant">Weighted total</p>
                <p className="font-rounded text-3xl font-bold text-primary">{preview === null ? "–" : fmt(preview, 1)}</p>
              </div>
            </div>
            <Banner tone="info" icon="visibility_off">Only you and the organizers can see this ballot.</Banner>
            {locked ? <Banner tone="warning" icon="lock">Judging is closed; ballots are locked.</Banner> : null}
            {criteria.length === 0 ? <Banner tone="warning">The organizers haven't published a rubric yet.</Banner> : null}
            {criteria.map((c) => (
              <ScoreSlider
                key={c.id}
                label={c.name}
                description={c.description}
                value={scores[c.id]}
                max={c.maxScore}
                weightPercent={totalWeight ? (100 * c.weight) / totalWeight : undefined}
                disabled={locked}
                onChange={(v) => setScores((sc) => ({ ...sc, [c.id]: v }))}
              />
            ))}
            <TextArea label="Private notes for organizers (optional)" rows={3} value={comment} onChange={(ev) => setComment(ev.target.value)} disabled={locked} maxLength={5000} />
            {save.error instanceof ApiError && save.error.code === "INVALID_BALLOT" ? <Banner tone="error">{save.error.message}</Banner> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="tonal" icon="sync" onClick={() => save.mutate(false)} loading={save.isPending && !save.variables} disabled={locked}>
                Save progress
              </Button>
              <Button className="flex-1" icon="send" onClick={() => save.mutate(true)} loading={save.isPending && save.variables} disabled={locked || !complete}>
                {ballot.submittedAt ? "Update ballot" : next ? "Submit & next" : "Submit ballot"}
              </Button>
            </div>
            {ballot.submittedAt ? <p className="type-body-sm text-on-surface-variant">Submitted {formatUtc(ballot.submittedAt)}. Changes are audit-logged.</p> : null}
          </Card>
        </aside>
      </div>

      <Dialog
        open={recuseOpen}
        onClose={() => setRecuseOpen(false)}
        title="Declare a conflict of interest"
        icon="report"
        actions={
          <>
            <Button variant="text" onClick={() => setRecuseOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={recuse.isPending} onClick={() => recuse.mutate()}>
              Recuse
            </Button>
          </>
        }
      >
        <p className="mb-4">You'll be removed from this project and never routed to it again. The declaration is recorded in the audit trail.</p>
        <TextField label="Reason" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} />
      </Dialog>
    </div>
  );
}
