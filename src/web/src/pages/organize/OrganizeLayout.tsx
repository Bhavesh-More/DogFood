import { Suspense } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { PhasePill } from "../../components/EventCard";
import { cx } from "../../lib/format";
import { useEvent } from "../../lib/queries";
import { EmptyState, ErrorState, Icon, LinkButton, PageLoader, type IconName } from "../../ui";

const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: "", label: "Overview", icon: "dashboard" },
  { to: "settings", label: "Settings", icon: "settings" },
  { to: "setup", label: "Tracks & prizes", icon: "category" },
  { to: "rubric", label: "Rubric", icon: "balance" },
  { to: "submissions", label: "Submissions", icon: "assignment" },
  { to: "judges", label: "Judges & routing", icon: "gavel" },
  { to: "results", label: "Results lab", icon: "query_stats" },
  { to: "votes", label: "Voting", icon: "how_to_vote" },
  { to: "audit", label: "Audit trail", icon: "receipt_long" },
  { to: "integrations", label: "Integrations", icon: "webhook" },
];

export function OrganizeLayout() {
  const { slug } = useParams();
  const event = useEvent(slug);
  if (event.isPending) return <PageLoader label="Loading event" />;
  if (event.error) return <ErrorState error={event.error} onRetry={() => event.refetch()} />;
  const e = event.data;
  if (!e.viewer.isOrganizer) return <EmptyState icon="block" title="Not your event" body="Only this event's organizers can open its console." />;
  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 pt-6">
        <div className="min-w-0">
          <Link to="/organize" className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
            <Icon name="arrow_back" size={18} /> Console
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="truncate type-headline-lg type-emphasized text-on-surface">{e.name}</h1>
            <PhasePill phase={e.phase} />
          </div>
        </div>
        <LinkButton to={`/e/${e.slug}`} variant="outlined" icon="open_in_new">
          Public page
        </LinkButton>
      </header>
      <nav aria-label="Event console" className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-outline-variant px-4">
        {SECTIONS.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.to === ""} className={({ isActive }) => cx("state-layer focus-ring relative flex h-12 shrink-0 items-center gap-2 px-3 type-title-sm", isActive ? "text-primary" : "text-on-surface-variant")}>
            {({ isActive }) => (
              <>
                <Icon name={s.icon} size={20} filled={isActive} className="relative z-[1]" />
                <span className="relative z-[1]">{s.label}</span>
                <span className={cx("absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full bg-primary transition-transform duration-300", isActive ? "scale-x-100" : "scale-x-0")} />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<PageLoader />}>
        <Outlet context={{ event: e, refresh: () => event.refetch() }} />
      </Suspense>
    </div>
  );
}
