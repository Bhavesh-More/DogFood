import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { BarList } from "../components/charts/Charts";
import { get } from "../lib/api";
import { cx, fmt } from "../lib/format";
import { useEvent } from "../lib/queries";
import { formatDateTime } from "../lib/time";
import { Banner, Card, ErrorState, Icon, PageLoader, Shape, type ShapeName } from "../ui";

interface ResultsResponse {
  publishedAt: string;
  results: {
    submissionId: string;
    title: string;
    teamName: string;
    trackName: string | null;
    rank: number;
    normalizedScore: number;
    rawMean: number;
    judgeCount: number;
    pairwiseRank: number | null;
    voteTally: number | null;
  }[];
  communityChoice: { submissionId: string; title: string; tally: number }[] | null;
}

const PODIUM: { shape: ShapeName; cls: string; label: string; height: string }[] = [
  { shape: "burst", cls: "text-primary", label: "1st", height: "medium:mt-0" },
  { shape: "cookie9", cls: "text-tertiary", label: "2nd", height: "medium:mt-10" },
  { shape: "flower", cls: "text-secondary", label: "3rd", height: "medium:mt-16" },
];

export function ResultsPage() {
  const { slug } = useParams();
  const event = useEvent(slug);
  const results = useQuery({
    queryKey: ["results", event.data?.id],
    queryFn: () => get<ResultsResponse>(`/api/events/${event.data!.id}/results`),
    enabled: Boolean(event.data),
  });
  if (event.isPending || (event.data && results.isPending)) return <PageLoader label="Loading results" />;
  if (event.error) return <ErrorState error={event.error} />;
  if (results.error) return <ErrorState error={results.error} />;
  const e = event.data;
  const r = results.data!;
  const top = r.results.slice(0, 3);
  const order = top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top;
  return (
    <div className="animate-enter">
      <header className="py-6">
        <Link to={`/e/${e.slug}`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
          <Icon name="arrow_back" size={18} /> {e.name}
        </Link>
        <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">Results</h1>
        <p className="mt-1 type-body-md text-on-surface-variant">Published {formatDateTime(r.publishedAt)}</p>
      </header>

      <section aria-label="Podium" className="mb-10 grid items-start gap-4 medium:grid-cols-3">
        {order.map((row) => {
          const idx = row.rank - 1;
          const p = PODIUM[Math.min(idx, 2)]!;
          return (
            <Card key={row.submissionId} to={`/e/${e.slug}/p/${row.submissionId}`} variant={idx === 0 ? "primary" : "filled"} radius="2xl" className={cx("flex flex-col items-center gap-3 text-center", p.height)}>
              <Shape name={p.shape} className={cx("h-24 w-24", p.cls)}>
                <span className="font-rounded text-2xl font-bold text-on-primary">{p.label}</span>
              </Shape>
              <p className="type-title-lg">{row.title}</p>
              <p className="type-body-md opacity-80">{row.teamName}</p>
              <p className="font-rounded text-4xl font-bold">{fmt(row.normalizedScore, 1)}</p>
              <p className="type-label-md opacity-80">normalized score · {row.judgeCount} judges</p>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 expanded:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="board">
          <h2 id="board" className="mb-3 type-title-lg text-on-surface">Leaderboard</h2>
          <div className="overflow-x-auto rounded-xl bg-surface-container-low">
            <table className="w-full min-w-[640px] text-left">
              <caption className="sr-only">Final ranking with normalized and raw scores</caption>
              <thead>
                <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
                  <th scope="col" className="px-4 py-3">#</th>
                  <th scope="col" className="px-4 py-3">Project</th>
                  <th scope="col" className="w-[34%] px-4 py-3">Normalized score</th>
                  <th scope="col" className="px-4 py-3 text-right">Raw mean</th>
                  <th scope="col" className="px-4 py-3 text-right">Judges</th>
                  <th scope="col" className="px-4 py-3 text-right" title="Rank from pairwise (Bradley-Terry) comparisons">Pairwise</th>
                  {r.results.some((x) => x.voteTally !== null) ? <th scope="col" className="px-4 py-3 text-right">Votes</th> : null}
                </tr>
              </thead>
              <tbody>
                {r.results.map((row) => (
                  <tr key={row.submissionId} className="border-b border-outline-variant/60 last:border-0 hover:bg-on-surface/4">
                    <td className="px-4 py-3 type-title-md tabular-nums text-on-surface">{row.rank}</td>
                    <td className="px-4 py-3">
                      <Link to={`/e/${e.slug}/p/${row.submissionId}`} className="type-title-sm text-on-surface hover:text-primary">
                        {row.title}
                      </Link>
                      <p className="type-body-sm text-on-surface-variant">
                        {row.teamName}
                        {row.trackName ? ` · ${row.trackName}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2" title={`Normalized ${fmt(row.normalizedScore, 2)}`}>
                        <div className="flex h-3 flex-1 items-center">
                          <div className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(2, Math.min(100, row.normalizedScore))}%`, background: "var(--chart-1)" }} />
                          <div className="h-px flex-1 bg-outline-variant" />
                        </div>
                        <span className="w-10 text-right type-label-lg tabular-nums text-on-surface">{fmt(row.normalizedScore, 1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right type-body-md tabular-nums text-on-surface-variant">{fmt(row.rawMean, 1)}</td>
                    <td className="px-4 py-3 text-right type-body-md tabular-nums text-on-surface-variant">{row.judgeCount}</td>
                    <td className="px-4 py-3 text-right type-body-md tabular-nums text-on-surface-variant">{row.pairwiseRank ?? "—"}</td>
                    {row.voteTally !== null ? <td className="px-4 py-3 text-right type-body-md tabular-nums text-on-surface-variant">{row.voteTally}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Banner tone="info" icon="balance" className="mt-4" title="Why raw and normalized ranks differ">
            Each judge's scores are standardized against that judge's own average and spread before averaging, so a project reviewed by a harsh judge
            is not penalized. Normalized scores sit on a common scale centred at {e.normalization.targetMean}.
          </Banner>
        </section>
        {r.communityChoice ? (
          <aside>
            <Card variant="tertiary" radius="2xl">
              <div className="mb-4 flex items-center gap-2">
                <Icon name="favorite" size={24} />
                <h2 className="type-title-lg">Community choice</h2>
              </div>
              <BarList
                ariaLabel="Community vote tallies"
                color="var(--md-on-tertiary-container)"
                data={r.communityChoice.map((c) => ({ key: c.submissionId, label: c.title, value: c.tally }))}
              />
              <p className="mt-4 type-body-sm opacity-80">Counted votes only — votes flagged by the anti-abuse checks are excluded.</p>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
