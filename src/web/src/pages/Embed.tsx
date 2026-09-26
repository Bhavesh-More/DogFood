import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { get } from "../lib/api";
import { Cover, LoadingIndicator } from "../ui";

interface Feed {
  event: { slug: string; name: string };
  items: { id: string; title: string; tagline: string; thumbnailUrl: string; teamName: string; trackName: string | null }[];
}

/** Chrome-less gallery for <iframe> embedding (framing is allowed only on /embed/*). */
export function EmbedPage() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ["embed", slug], queryFn: () => get<Feed>(`/api/embed/events/${slug}/gallery.json`) });
  if (q.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingIndicator />
      </div>
    );
  }
  if (q.error || !q.data) return <p className="p-4 type-body-md text-on-surface-variant">Gallery unavailable.</p>;
  const origin = window.location.origin;
  return (
    <div className="min-h-dvh bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="type-title-md text-on-surface">{q.data.event.name}</h1>
        <a href={`${origin}/e/${q.data.event.slug}/gallery`} target="_blank" rel="noreferrer" className="type-label-lg text-primary hover:underline">
          Open gallery ↗
        </a>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {q.data.items.map((it) => (
          <a key={it.id} href={`${origin}/e/${q.data.event.slug}/p/${it.id}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-surface-container-low hover:shadow-2">
            <Cover src={it.thumbnailUrl} seed={it.id} label={it.title} className="h-24 w-full" />
            <div className="p-3">
              <p className="truncate type-title-sm text-on-surface">{it.title}</p>
              <p className="truncate type-body-sm text-on-surface-variant">{it.teamName}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
