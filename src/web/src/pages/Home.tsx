import { useQuery } from "@tanstack/react-query";
import type { EventSummaryDto } from "@dogfood/core";
import { EventCard } from "../components/EventCard";
import { get } from "../lib/api";
import { useSession } from "../lib/session";
import { Card, Icon, LinkButton, SectionHeader, Shape, Skeleton, type IconName, type ShapeName } from "../ui";

const PIPELINE: { label: string; icon: IconName; shape: ShapeName }[] = [
  { label: "Registration", icon: "how_to_reg", shape: "cookie9" },
  { label: "Teams", icon: "groups", shape: "clover4" },
  { label: "Submissions", icon: "upload", shape: "sunny" },
  { label: "Eligibility", icon: "rule", shape: "gem" },
  { label: "Judge routing", icon: "hub", shape: "flower" },
  { label: "Scoring", icon: "rate_review", shape: "cookie6" },
  { label: "Normalization", icon: "balance", shape: "softBurst" },
  { label: "Results", icon: "trophy", shape: "burst" },
  { label: "Certificates", icon: "workspace_premium", shape: "pentagon" },
  { label: "Archive", icon: "history", shape: "cookie12" },
];

function BiasIllustration() {
  // Two judges' raw score distributions (strict, lenient) collapse onto one after normalization.
  const bell = (mu: number, sd: number) =>
    Array.from({ length: 41 }, (_, i) => {
      const x = i * 2.5;
      const y = Math.exp(-0.5 * ((x - mu) / sd) ** 2);
      return `${i === 0 ? "M" : "L"}${(x * 2.4).toFixed(1)},${(78 - y * 60).toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox="0 0 240 90" className="w-full" role="img" aria-label="A strict and a lenient judge's score distributions merging into one after normalization">
      <path d={bell(35, 9)} fill="none" stroke="var(--md-tertiary)" strokeWidth="3" strokeDasharray="5 5" />
      <path d={bell(78, 7)} fill="none" stroke="var(--md-secondary)" strokeWidth="3" strokeDasharray="5 5" />
      <path d={bell(58, 12)} fill="none" stroke="var(--md-primary)" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="0" y1="80" x2="240" y2="80" stroke="var(--md-outline-variant)" strokeWidth="1.5" />
    </svg>
  );
}

export function HomePage() {
  const { user } = useSession();
  const events = useQuery({ queryKey: ["events"], queryFn: () => get<EventSummaryDto[]>("/api/events") });
  const live = (events.data ?? []).filter((e) => e.phase !== "archived");
  const past = (events.data ?? []).filter((e) => e.phase === "archived" || e.phase === "results");

  return (
    <div className="flex flex-col gap-14 pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-primary-container px-6 py-10 text-on-primary-container animate-enter medium:px-12 medium:py-16">
        <Shape name="cookie12" className="animate-float absolute -right-16 -top-20 h-72 w-72 text-primary opacity-90 medium:h-96 medium:w-96" />
        <Shape name="clover4" className="animate-float absolute -bottom-16 right-40 hidden h-44 w-44 text-tertiary-container [animation-delay:-3s] expanded:block" />
        <Shape name="sunny" className="absolute bottom-10 right-10 hidden h-24 w-24 text-inverse-primary medium:block" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1 type-label-lg text-on-surface backdrop-blur">
            <Icon name="verified" size={18} className="text-primary" /> Open source · self-hosted · works offline
          </span>
          <h1 className="mt-5 font-rounded text-[44px] font-[780] leading-[1.02] tracking-tight [font-variation-settings:'ROND'_100] medium:text-[76px]">
            Hackathons,
            <br />
            judged <span className="text-primary">fairly</span>.
          </h1>
          <p className="mt-5 max-w-xl type-body-lg opacity-90 medium:text-lg">
            Run the whole competition — teams, hard deadlines, judge routing, weighted rubrics and community votes — on a
            platform where strict and lenient judges are statistically normalized and no judge can ever read another
            judge's ballot.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to="/events" size="md" icon="travel_explore">
              Browse hackathons
            </LinkButton>
            {user?.role === "organizer" || user?.role === "admin" ? (
              <LinkButton to="/organize" size="md" variant="elevated" icon="dashboard">
                Organizer console
              </LinkButton>
            ) : user ? (
              <LinkButton to="/dashboard" size="md" variant="elevated" icon="space_dashboard">
                My hub
              </LinkButton>
            ) : (
              <LinkButton to="/register" size="md" variant="elevated" icon="person_add">
                Create an account
              </LinkButton>
            )}
          </div>
        </div>
      </section>

      {/* Live events */}
      <section aria-labelledby="live-heading">
        <SectionHeader
          title={<span id="live-heading">Happening now</span>}
          subtitle="Open for submissions, in judging, or voting"
          action={<LinkButton to="/events" variant="text" trailingIcon="arrow_forward">All events</LinkButton>}
        />
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
          {events.isPending
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)
            : live.slice(0, 6).map((e, i) => <EventCard key={e.id} event={e} featured={i === 0} />)}
        </div>
      </section>

      {/* Why it's fair */}
      <section aria-labelledby="fair-heading">
        <SectionHeader title={<span id="fair-heading">Built so the judging is the part you can trust</span>} />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-6">
          <Card variant="primary" radius="2xl" className="medium:col-span-4">
            <div className="flex flex-col gap-6 medium:flex-row medium:items-center">
              <div className="flex-1">
                <p className="type-label-lg opacity-80">Cross-judge normalization</p>
                <h3 className="mt-1 type-headline-md">A harsh judge can't sink you. A generous one can't float you.</h3>
                <p className="mt-3 type-body-md opacity-90">
                  Every judge's scores are Z-scored against their own mean and spread (Min-Max for judges with fewer
                  than 5 ballots), then mapped to a common scale. The maths, the snapshots and a live proof are public.
                </p>
              </div>
              <div className="w-full rounded-xl bg-surface p-4 medium:w-80">
                <BiasIllustration />
                <div className="mt-2 flex justify-between type-label-sm text-on-surface-variant">
                  <span className="text-tertiary">strict judge</span>
                  <span className="text-primary">normalized</span>
                  <span className="text-secondary">lenient judge</span>
                </div>
              </div>
            </div>
          </Card>
          <Card variant="tertiary" radius="2xl" className="medium:col-span-2">
            <Icon name="shield" size={32} />
            <h3 className="mt-3 type-title-lg">Isolation in the database</h3>
            <p className="mt-2 type-body-md opacity-90">
              Ballots are filtered by <code className="rounded-xs bg-surface/60 px-1">judge_id</code> in every query
              and enforced by Postgres row-level security — not by hiding buttons.
            </p>
          </Card>
          <Card variant="filled" radius="2xl" className="medium:col-span-2">
            <Icon name="how_to_vote" size={32} className="text-primary" />
            <h3 className="mt-3 type-title-lg">Abuse-resistant voting</h3>
            <p className="mt-2 type-body-md text-on-surface-variant">Open, email-gated or signed-in voting, quadratic budgets, per-IP Sybil caps and hidden tallies.</p>
          </Card>
          <Card variant="filled" radius="2xl" className="medium:col-span-2">
            <Icon name="timer" size={32} className="text-primary" />
            <h3 className="mt-3 type-title-lg">Deadlines by the server clock</h3>
            <p className="mt-2 type-body-md text-on-surface-variant">Late edits are refused by the API and again by a database trigger. Client clocks are never consulted.</p>
          </Card>
          <Card variant="filled" radius="2xl" className="medium:col-span-2">
            <Icon name="fingerprint" size={32} className="text-primary" />
            <h3 className="mt-3 type-title-lg">Tamper-evident audit trail</h3>
            <p className="mt-2 type-body-md text-on-surface-variant">Every sensitive action is hash-chained and verifiable; judges get Ed25519-signed participation records.</p>
          </Card>
        </div>
      </section>

      {/* Pipeline */}
      <section aria-labelledby="pipeline-heading">
        <SectionHeader title={<span id="pipeline-heading">One pipeline, ten stages</span>} subtitle="Each stage feeds the next — and every one of them lives in this platform." />
        <ol className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {PIPELINE.map((s, i) => (
            <li key={s.label} className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-xl bg-surface-container-low p-4 text-center">
              <Shape name={s.shape} className="h-14 w-14 text-secondary-container">
                <Icon name={s.icon} size={24} className="text-on-secondary-container" />
              </Shape>
              <span className="type-label-sm text-on-surface-variant">Stage {i + 1}</span>
              <span className="type-title-sm text-on-surface">{s.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {past.length ? (
        <section aria-labelledby="past-heading">
          <SectionHeader title={<span id="past-heading">Past results</span>} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 expanded:grid-cols-3">
            {past.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="flex flex-col items-start justify-between gap-4 rounded-xl bg-surface-container-low p-6 medium:flex-row medium:items-center">
        <div>
          <p className="type-title-md text-on-surface">Self-host it in one command</p>
          <code className="mt-2 inline-block rounded-md bg-inverse-surface px-3 py-2 font-mono type-body-md text-inverse-on-surface">docker compose up</code>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/api-docs" variant="outlined" icon="api">
            REST API
          </LinkButton>
          <LinkButton to="/api/openapi.json" external variant="text" icon="data_object">
            OpenAPI 3.1
          </LinkButton>
        </div>
      </footer>
    </div>
  );
}
