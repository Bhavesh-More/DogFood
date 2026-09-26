import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import type { CommentDto, SubmissionDto } from "@dogfood/core";
import { VoteControl, VotingBar, useVoteState } from "../components/Voting";
import { errorMessage, get, post, del } from "../lib/api";
import { useEvent } from "../lib/queries";
import { useSession } from "../lib/session";
import { formatUtc, relativeTime } from "../lib/time";
import { Avatar, Banner, Button, Card, Cover, EmptyState, ErrorState, Icon, IconButton, LinkButton, PageLoader, Pill, TextArea, useToast } from "../ui";

function Comments({ submissionId, eventSlug }: { submissionId: string; eventSlug: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const comments = useQuery({ queryKey: ["comments", submissionId], queryFn: () => get<CommentDto[]>(`/api/submissions/${submissionId}/comments`) });
  const add = useMutation({
    mutationFn: () => post(`/api/submissions/${submissionId}/comments`, { body }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", submissionId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", submissionId] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) add.mutate();
  };
  return (
    <section aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="mb-4 type-title-lg text-on-surface">
        Comments {comments.data ? <span className="text-on-surface-variant">({comments.data.length})</span> : null}
      </h2>
      {user ? (
        <form onSubmit={submit} className="mb-6 flex flex-col gap-2">
          <TextArea label="Add a comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} counter={`${body.length}/2000`} />
          <div className="flex justify-end">
            <Button type="submit" icon="send" loading={add.isPending} disabled={!body.trim()}>
              Post
            </Button>
          </div>
        </form>
      ) : (
        <Banner className="mb-6" action={<LinkButton to={`/login?next=/e/${eventSlug}/p/${submissionId}`} size="xs">Sign in</LinkButton>}>
          Sign in to join the conversation.
        </Banner>
      )}
      {comments.data?.length === 0 ? (
        <EmptyState icon="forum" title="No comments yet" body="Be the first to say something nice." />
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.data?.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.authorName} size={40} />
              <div className="min-w-0 flex-1 rounded-lg bg-surface-container-low p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-title-sm text-on-surface">
                    {c.authorName} {c.hidden ? <Pill tone="warning">hidden</Pill> : null}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="type-body-sm text-on-surface-variant">{relativeTime(c.createdAt)}</span>
                    {user ? <IconButton icon="delete" label="Delete or hide comment" size="sm" onClick={() => remove.mutate(c.id)} /> : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words type-body-md text-on-surface">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectPage() {
  const { slug, id } = useParams();
  const event = useEvent(slug);
  const vote = useVoteState(event.data);
  const sub = useQuery({ queryKey: ["submission", id], queryFn: () => get<SubmissionDto>(`/api/submissions/${id}`) });
  if (sub.isPending || event.isPending) return <PageLoader label="Loading project" />;
  if (sub.error) return <ErrorState error={sub.error} />;
  if (event.error) return <ErrorState error={event.error} />;
  const s = sub.data;
  const e = event.data;
  const questions = e.questions.filter((q) => s.answers[q.id] !== undefined && s.answers[q.id] !== "");
  return (
    <div className="animate-enter">
      <Link to={`/e/${e.slug}/gallery`} className="mt-4 inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
        <Icon name="arrow_back" size={18} /> Gallery
      </Link>
      <div className="mt-4 grid grid-cols-1 gap-6 expanded:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="overflow-hidden rounded-2xl">
            <Cover src={s.thumbnailUrl} seed={s.id} label={s.title} big className="h-56 w-full medium:h-80" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {s.trackName ? <Pill tone="secondary" icon="category">{s.trackName}</Pill> : null}
              {s.status === "draft" ? <Pill tone="warning" icon="edit">Draft (visible to your team and organizers)</Pill> : <Pill tone="success" icon="check_circle">Submitted {formatUtc(s.submittedAt)}</Pill>}
              {s.eligibility === "ineligible" ? <Pill tone="error" icon="block">Ineligible</Pill> : null}
            </div>
            <h1 className="mt-3 font-rounded text-4xl font-bold leading-tight text-on-surface [font-variation-settings:'ROND'_100] medium:text-5xl">{s.title || "Untitled project"}</h1>
            <p className="mt-2 type-title-lg font-normal text-on-surface-variant">{s.tagline}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.repoUrl ? <LinkButton to={s.repoUrl} external icon="code" variant="filled">Repository</LinkButton> : null}
            {s.demoVideoUrl ? <LinkButton to={s.demoVideoUrl} external icon="play_arrow" variant="tonal">Demo video</LinkButton> : null}
            {s.liveUrl ? <LinkButton to={s.liveUrl} external icon="open_in_new" variant="outlined">Live</LinkButton> : null}
          </div>
          <div className="flex flex-col gap-3 type-body-lg text-on-surface">
            {s.description.split(/\n+/).filter(Boolean).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {s.gallery.length ? (
            <div className="grid grid-cols-2 gap-3 medium:grid-cols-3">
              {s.gallery.map((src) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="focus-ring overflow-hidden rounded-lg">
                  <img src={src} alt="" loading="lazy" className="aspect-video w-full object-cover transition-transform hover:scale-105" />
                </a>
              ))}
            </div>
          ) : null}
          {questions.length ? (
            <Card variant="outlined">
              <h2 className="mb-3 type-title-md text-on-surface">Answers to organizer questions</h2>
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
          <Comments submissionId={s.id} eventSlug={e.slug} />
        </div>
        <aside className="flex flex-col gap-4 expanded:sticky expanded:top-20 expanded:self-start">
          {vote.data?.votingOpen ? (
            <Card variant="tertiary" radius="2xl" className="flex flex-col items-start gap-3">
              <p className="type-title-md">Like this project?</p>
              <VoteControl event={e} state={vote.data} submissionId={s.id} />
              <p className="type-body-sm opacity-80">
                {vote.data.remaining} {vote.data.style === "quadratic" ? "credits" : "picks"} left
              </p>
            </Card>
          ) : null}
          {vote.data?.votingOpen && vote.data.mode === "email" && !vote.data.identified ? <VotingBar event={e} state={vote.data} /> : null}
          <Card variant="filled" radius="2xl">
            <p className="type-label-lg text-on-surface-variant">Team</p>
            <p className="type-title-lg text-on-surface">{s.teamName}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {s.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <Avatar name={m.name} size={36} />
                  <span className="type-body-md text-on-surface">{m.name}</span>
                </li>
              ))}
            </ul>
          </Card>
          {s.techTags.length ? (
            <Card variant="filled" radius="2xl">
              <p className="mb-3 type-label-lg text-on-surface-variant">Built with</p>
              <div className="flex flex-wrap gap-2">
                {s.techTags.map((t) => (
                  <span key={t} className="rounded-sm bg-surface-container-highest px-2 py-1 font-mono type-label-md text-on-surface">
                    {t}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
