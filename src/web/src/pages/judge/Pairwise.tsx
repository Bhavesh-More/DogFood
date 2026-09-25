import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import type { SubmissionDto } from "@dogfood/core";
import { errorMessage, get, post } from "../../lib/api";
import { useEvent } from "../../lib/queries";
import { Banner, Button, Cover, EmptyState, ErrorState, Icon, LinearProgress, PageLoader, Pill, Shape, useToast } from "../../ui";

interface NextPair {
  pair: [SubmissionDto, SubmissionDto] | null;
  done: number;
  possible: number;
}

function Contender({ s, onPick, disabled, side }: { s: SubmissionDto; onPick: () => void; disabled: boolean; side: "A" | "B" }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-surface-container-low">
      <Cover src={s.thumbnailUrl} seed={s.id} label={s.title} className="h-40 w-full" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <Pill tone="neutral">{side}</Pill>
          {s.trackName ? <Pill tone="secondary">{s.trackName}</Pill> : null}
        </div>
        <h2 className="type-headline-sm text-on-surface">{s.title}</h2>
        <p className="type-body-md text-on-surface-variant">{s.tagline}</p>
        <p className="line-clamp-5 type-body-md text-on-surface">{s.description}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {s.repoUrl ? (
            <a href={s.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
              <Icon name="code" size={18} /> Repo
            </a>
          ) : null}
          {s.demoVideoUrl ? (
            <a href={s.demoVideoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
              <Icon name="play_arrow" size={18} /> Demo
            </a>
          ) : null}
        </div>
        <Button size="md" icon="thumb_up" onClick={onPick} disabled={disabled} fullWidth>
          {side} is stronger
        </Button>
      </div>
    </article>
  );
}

export function PairwisePage() {
  const { slug } = useParams();
  const event = useEvent(slug);
  const qc = useQueryClient();
  const toast = useToast();
  const next = useQuery({
    queryKey: ["pairwise-next", event.data?.id],
    queryFn: () => get<NextPair>(`/api/judge/events/${event.data!.id}/pairwise/next`),
    enabled: Boolean(event.data),
  });
  const pick = useMutation({
    mutationFn: (v: { winnerId: string; loserId: string }) => post(`/api/judge/events/${event.data!.id}/pairwise`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pairwise-next", event.data!.id] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (event.isPending || next.isPending) return <PageLoader label="Finding a pair" />;
  if (event.error) return <ErrorState error={event.error} />;
  if (next.error) return <ErrorState error={next.error} />;
  const n = next.data;
  return (
    <div className="animate-enter">
      <header className="py-6">
        <Link to={`/judge/${slug}`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
          <Icon name="arrow_back" size={18} /> Queue
        </Link>
        <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">Which is stronger?</h1>
        <p className="mt-2 max-w-2xl type-body-lg text-on-surface-variant">
          Pairwise mode asks for relative judgements instead of absolute scores. Comparisons from all judges are combined with the Bradley–Terry model into
          a ranking that is immune to how generous each judge is.
        </p>
        <div className="mt-4 max-w-md">
          <div className="mb-1 flex justify-between type-label-md text-on-surface-variant">
            <span>{n.done} comparisons made</span>
            <span>{n.possible} possible pairs</span>
          </div>
          <LinearProgress value={n.done} max={n.possible || 1} label="Pairwise progress" tone="tertiary" />
        </div>
      </header>
      {!n.pair ? (
        <EmptyState icon="done_all" shape="burst" title="You've compared every pair in your scope" body="Thank you! The organizers can now see the pairwise ranking." />
      ) : (
        <div className="relative grid gap-4 medium:grid-cols-2">
          <Contender s={n.pair[0]} side="A" disabled={pick.isPending} onPick={() => pick.mutate({ winnerId: n.pair![0].id, loserId: n.pair![1].id })} />
          <Shape name="sunny" className="absolute left-1/2 top-24 z-10 hidden h-16 w-16 -translate-x-1/2 text-tertiary medium:grid">
            <span className="font-rounded font-bold text-on-tertiary">VS</span>
          </Shape>
          <Contender s={n.pair[1]} side="B" disabled={pick.isPending} onPick={() => pick.mutate({ winnerId: n.pair![1].id, loserId: n.pair![0].id })} />
        </div>
      )}
      <Banner tone="info" className="mt-6" icon="shuffle">
        Pairs are chosen where information is scarcest (fewest comparisons, closest strengths) and presented in a randomised order.
      </Banner>
    </div>
  );
}
