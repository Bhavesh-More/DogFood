import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { EventDto, GalleryItemDto, Paginated } from "@dogfood/core";
import { VoteControl, VotingBar, useVoteState, type VoteState } from "../components/Voting";
import { get } from "../lib/api";
import { useEvent } from "../lib/queries";
import { Button, ButtonGroup, Chip, Cover, EmptyState, ErrorState, Icon, IconButton, PageLoader, Pill, Skeleton, TextField } from "../ui";

type Sort = "recent" | "title" | "random" | "rank";

function ProjectCard({ item, event, vote }: { item: GalleryItemDto; event: EventDto; vote?: VoteState }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-surface-container-low transition-[border-radius,box-shadow] duration-500 ease-[var(--ease-spring-default)] hover:shadow-2 focus-within:shadow-2">
      <Link to={`/e/${event.slug}/p/${item.id}`} className="focus-ring relative block" aria-label={`Open ${item.title}`}>
        <Cover src={item.thumbnailUrl} seed={item.id} label={item.title} className="h-40 w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        {item.rank ? (
          <span className="absolute left-3 top-3 grid h-10 min-w-10 place-items-center rounded-full bg-primary px-2 type-title-sm text-on-primary shadow-2">#{item.rank}</span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/e/${event.slug}/p/${item.id}`} className="min-w-0 focus-ring rounded-xs">
            <h3 className="truncate type-title-md text-on-surface group-hover:text-primary">{item.title}</h3>
            <p className="truncate type-body-sm text-on-surface-variant">by {item.teamName}</p>
          </Link>
          {item.trackName ? <Pill tone="secondary">{item.trackName}</Pill> : null}
        </div>
        <p className="line-clamp-2 type-body-md text-on-surface-variant">{item.tagline}</p>
        <div className="flex flex-wrap gap-1">
          {item.techTags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-xs bg-surface-container-highest px-1.5 py-0.5 font-mono type-label-sm text-on-surface-variant">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-3 type-label-md text-on-surface-variant">
            <span className="inline-flex items-center gap-1">
              <Icon name="chat_bubble" size={16} /> {item.commentCount}
            </span>
            {item.voteTally !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="favorite" size={16} /> {item.voteTally}
              </span>
            ) : null}
          </span>
          {vote?.votingOpen ? <VoteControl event={event} state={vote} submissionId={item.id} compact /> : null}
        </div>
      </div>
    </article>
  );
}

export function GalleryPage() {
  const { slug } = useParams();
  const event = useEvent(slug);
  const vote = useVoteState(event.data);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [track, setTrack] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [sort, setSort] = useState<Sort | "">("");
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPages(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const filterBy = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPages(1);
  };
  const pickTrack = filterBy(setTrack);
  const pickTag = filterBy(setTag);
  const pickSort = filterBy(setSort);

  const gallery = useQuery({
    queryKey: ["gallery", event.data?.id, debounced, track, tag, sort, pages],
    queryFn: () =>
      get<Paginated<GalleryItemDto> & { facets: { tags: { tag: string; count: number }[] }; order: string }>(`/api/events/${event.data!.id}/gallery`, {
        q: debounced,
        track,
        tag,
        sort: sort || undefined,
        pageSize: 24 * pages,
      }),
    enabled: Boolean(event.data),
    placeholderData: keepPreviousData,
  });

  if (event.isPending) return <PageLoader label="Loading gallery" />;
  if (event.error) return <ErrorState error={event.error} />;
  const e = event.data;
  const data = gallery.data;
  const effectiveSort = (sort || data?.order || "recent") as Sort;

  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <Link to={`/e/${e.slug}`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
            <Icon name="arrow_back" size={18} /> {e.name}
          </Link>
          <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">Project gallery</h1>
          <p className="mt-1 type-body-lg text-on-surface-variant">{data ? `${data.total} submitted project${data.total === 1 ? "" : "s"}` : "…"}</p>
        </div>
        <ButtonGroup
          label="Sort projects"
          value={effectiveSort}
          onChange={(v) => pickSort(v)}
          size="xs"
          options={[
            ...(e.votingOpen ? [{ value: "random" as Sort, label: "Shuffled", icon: "shuffle" as const }] : []),
            ...(e.resultsPublishedAt ? [{ value: "rank" as Sort, label: "Ranked", icon: "leaderboard" as const }] : []),
            { value: "recent", label: "Recent" },
            { value: "title", label: "A–Z" },
          ]}
        />
      </header>

      {vote.data?.votingOpen ? (
        <div className="mb-6">
          <VotingBar event={e} state={vote.data} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3">
        <TextField
          label="Search projects, teams and tags"
          leadingIcon="search"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          trailing={q ? <IconButton icon="close" label="Clear search" size="sm" onClick={() => setQ("")} /> : undefined}
          className="max-w-xl"
        />
        {e.tracks.length ? (
          <div className="scrollbar-none flex gap-2 overflow-x-auto" role="group" aria-label="Filter by track">
            <Chip selected={!track} onClick={() => pickTrack("")}>All tracks</Chip>
            {e.tracks.map((t) => (
              <Chip key={t.id} selected={track === t.id} onClick={() => pickTrack(track === t.id ? "" : t.id)}>
                {t.name}
              </Chip>
            ))}
          </div>
        ) : null}
        {data?.facets.tags.length ? (
          <div className="scrollbar-none flex gap-2 overflow-x-auto" role="group" aria-label="Filter by tag">
            {data.facets.tags.slice(0, 16).map((t) => (
              <Chip key={t.tag} icon="sell" selected={tag === t.tag} onClick={() => pickTag(tag === t.tag ? "" : t.tag)}>
                {t.tag} <span className="opacity-60">{t.count}</span>
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {gallery.error ? (
        <ErrorState error={gallery.error} onRetry={() => gallery.refetch()} />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 expanded:grid-cols-3 large:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState icon="grid_view" title="No projects yet" body={debounced || track || tag ? "Nothing matches these filters." : "Projects appear here once teams submit."} />
      ) : (
        <div className={gallery.isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <div className="stagger grid gap-4 sm:grid-cols-2 expanded:grid-cols-3 large:grid-cols-4">
            {data.items.map((item) => (
              <ProjectCard key={item.id} item={item} event={e} vote={vote.data} />
            ))}
          </div>
          {data.items.length < data.total ? (
            <div className="mt-8 flex justify-center">
              <Button variant="tonal" icon="keyboard_arrow_down" onClick={() => setPages((p) => p + 1)} loading={gallery.isFetching}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
