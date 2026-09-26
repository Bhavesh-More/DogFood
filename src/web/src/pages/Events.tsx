import { useMemo, useState } from "react";
import type { EventPhase } from "@dogfood/core";
import { EventCard } from "../components/EventCard";
import { useEvents } from "../lib/queries";
import { Chip, EmptyState, ErrorState, SectionHeader, Skeleton, TextField } from "../ui";

const FILTERS: { value: "all" | EventPhase; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submissions_open", label: "Open now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "judging", label: "Judging" },
  { value: "results", label: "Results" },
  { value: "archived", label: "Archived" },
];

export function EventsPage() {
  const events = useEvents();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      (events.data ?? []).filter(
        (e) => (filter === "all" || e.phase === filter) && `${e.name} ${e.tagline}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [events.data, filter, q],
  );
  return (
    <div className="animate-enter">
      <header className="py-6">
        <h1 className="type-display-sm type-emphasized text-on-surface">Hackathons</h1>
        <p className="mt-2 type-body-lg text-on-surface-variant">Find an event, form a team and ship something.</p>
      </header>
      <div className="mb-6 flex flex-col gap-4 medium:flex-row medium:items-center">
        <TextField label="Search events" leadingIcon="search" value={q} onChange={(e) => setQ(e.target.value)} className="medium:w-80" />
        <div className="scrollbar-none flex gap-2 overflow-x-auto" role="group" aria-label="Filter by phase">
          {FILTERS.map((f) => (
            <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>
      {events.error ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon="event" title="No events match" body="Try another filter or search term." />
      ) : (
        <>
          <SectionHeader title={`${list.length} event${list.length === 1 ? "" : "s"}`} level={3} />
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
            {list.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
