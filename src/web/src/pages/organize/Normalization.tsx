import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { NormalizationRunDto } from "@dogfood/core";
import { DivergingBars, StripPlot } from "../../components/charts/Charts";
import { errorMessage, get, post } from "../../lib/api";
import { fmt } from "../../lib/format";
import { keys } from "../../lib/queries";
import { formatDateTime } from "../../lib/time";
import { Banner, Button, Card, Dialog, EmptyState, Icon, LinkButton, PageLoader, Pill, SectionHeader, StatTile, Tabs, useToast } from "../../ui";
import { useOrganize } from "./common";

interface NormalizationResponse {
  latest: NormalizationRunDto | null;
  history: { id: string; createdAt: string; createdBy: string | null; results: number }[];
}

interface PairwiseResponse {
  comparisons: number;
  converged: boolean;
  iterations: number;
  items: { id: string; title: string; teamName: string; strength: number; winProbability: number; wins: number; losses: number; rank: number }[];
}

function Movement({ from, to }: { from: number; to: number }) {
  const d = from - to;
  if (d === 0) return <span className="type-label-md text-on-surface-variant">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 type-label-lg tabular-nums text-on-surface" title={`Raw rank ${from} → normalized rank ${to}`}>
      <Icon name={d > 0 ? "arrow_upward" : "arrow_downward"} size={16} className={d > 0 ? "text-[var(--chart-cool)]" : "text-[var(--chart-warm)]"} />
      {Math.abs(d)}
    </span>
  );
}

export function NormalizationPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<"lab" | "results" | "pairwise">("lab");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const norm = useQuery({ queryKey: ["normalization", e.id], queryFn: () => get<NormalizationResponse>(`/api/events/${e.id}/normalization`) });
  const pairwise = useQuery({ queryKey: ["pairwise-ranking", e.id], queryFn: () => get<PairwiseResponse>(`/api/events/${e.id}/pairwise/ranking`), enabled: view === "pairwise" });
  const run = useMutation({
    mutationFn: () => post<NormalizationRunDto>(`/api/events/${e.id}/normalize`),
    onSuccess: () => {
      toast.success("Normalization run stored");
      qc.invalidateQueries({ queryKey: ["normalization", e.id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const publish = useMutation({
    mutationFn: () => post(`/api/events/${e.id}/results/publish`, { rerun: true }),
    onSuccess: () => {
      setConfirmPublish(false);
      toast.success("Results published");
      qc.invalidateQueries({ queryKey: ["normalization", e.id] });
      qc.invalidateQueries({ queryKey: keys.event(e.slug) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const unpublish = useMutation({
    mutationFn: () => post(`/api/events/${e.id}/results/unpublish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.event(e.slug) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const issue = useMutation({
    mutationFn: () => post<{ issued: number }>(`/api/events/${e.id}/records/issue`),
    onSuccess: (r) => toast.success(`${r.issued} signed records issued`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const r = norm.data?.latest ?? null;
  const titles = useMemo(() => new Map((r?.results ?? []).map((x) => [x.submissionId, x.title])), [r]);
  const judgeRows = useMemo(() => {
    if (!r) return { raw: [], normalized: [] };
    const byJudge = (key: "raw" | "normalized") =>
      r.judges.map((j) => ({
        key: j.judgeId,
        label: j.name,
        sublabel: `${j.method === "z_score" ? "Z-score" : "Min-Max"} · N=${j.n}`,
        points: r.entries.filter((en) => en.judgeId === j.judgeId).map((en) => ({ key: en.submissionId, value: en[key], label: titles.get(en.submissionId) ?? en.submissionId })),
      }));
    return { raw: byJudge("raw"), normalized: byJudge("normalized") };
  }, [r, titles]);

  if (norm.isPending) return <PageLoader label="Loading results lab" />;

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button icon="query_stats" loading={run.isPending} onClick={() => run.mutate()}>
        Run normalization
      </Button>
      {e.resultsPublishedAt ? (
        <Button variant="outlined" icon="visibility_off" loading={unpublish.isPending} onClick={() => unpublish.mutate()}>
          Unpublish
        </Button>
      ) : (
        <Button variant="tertiary" icon="public" disabled={!r} onClick={() => setConfirmPublish(true)}>
          Publish results
        </Button>
      )}
    </div>
  );

  if (!r) {
    return <EmptyState icon="query_stats" title="No normalization run yet" body="Once judges have submitted ballots, run normalization to see bias-corrected rankings." action={actions} />;
  }
  const minMaxJudges = r.judges.filter((j) => j.method === "min_max");
  const allHold = r.invariants.every((i) => i.holds);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-md text-on-surface-variant">
          Latest run <span className="font-mono">{r.id}</span> · {formatDateTime(r.createdAt)}
          {e.resultsPublishedAt ? <Pill tone="success" icon="public" className="ml-2">published</Pill> : null}
        </p>
        {actions}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 expanded:grid-cols-4">
        <StatTile label="Ballots normalized" value={r.entries.length} icon="rate_review" />
        <StatTile label="Judges" value={r.judges.length} icon="gavel" tone="secondary" hint={minMaxJudges.length ? `${minMaxJudges.length} on Min-Max fallback` : "all Z-scored"} />
        <StatTile label="Rank agreement (Spearman ρ)" value={fmt(r.spearmanRawVsNormalized, 3)} icon="compare_arrows" tone="tertiary" hint="raw vs normalized order" />
        <StatTile label="Invariants" value={allHold ? "All hold" : "Violated"} icon={allHold ? "verified" : "error"} tone={allHold ? "success" : "warning"} hint="mean & sd per Z-scored judge" />
      </div>

      <Tabs
        label="Results lab views"
        value={view}
        onChange={setView}
        tabs={[
          { value: "lab", label: "Normalization proof", icon: "science" },
          { value: "results", label: "Ranking", icon: "leaderboard" },
          { value: "pairwise", label: "Pairwise (Bradley–Terry)", icon: "compare_arrows" },
        ]}
      />

      {view === "lab" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 expanded:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card variant="filled" radius="2xl">
              <SectionHeader title="Judge leniency" subtitle={`Each judge's mean raw total minus the global mean (${fmt(r.globalMean, 1)})`} level={3} />
              <DivergingBars
                ariaLabel="Judge bias relative to the global mean"
                negativeLabel="Stricter"
                positiveLabel="More lenient"
                data={r.judges.map((j) => ({ key: j.judgeId, label: j.name, value: j.bias, note: `μ=${fmt(j.mean)} σ=${fmt(j.sd)} N=${j.n}` }))}
              />
            </Card>
            <Card variant="filled" radius="2xl">
              <SectionHeader title="How it's computed" level={3} />
              <ol className="flex flex-col gap-3 type-body-md text-on-surface">
                <li>
                  <span className="type-title-sm">1 · Weighted raw total</span>
                  <code className="mt-1 block rounded-sm bg-surface-container-highest px-3 py-2 font-mono text-[13px]">S = 100 · Σ wᵢ·(sᵢ/maxᵢ) / Σ wᵢ</code>
                </li>
                <li>
                  <span className="type-title-sm">2 · Per-judge Z-score (N ≥ {r.config.minSampleSize})</span>
                  <code className="mt-1 block rounded-sm bg-surface-container-highest px-3 py-2 font-mono text-[13px]">Z = (S − μⱼ) / (σⱼ + ε), ε = {r.config.epsilon}</code>
                </li>
                <li>
                  <span className="type-title-sm">3 · Min-Max fallback (N &lt; {r.config.minSampleSize})</span>
                  <code className="mt-1 block rounded-sm bg-surface-container-highest px-3 py-2 font-mono text-[13px]">x = (S − min) / (max − min + ε);  Z = (2x − 1)·√3</code>
                </li>
                <li>
                  <span className="type-title-sm">4 · Common scale</span>
                  <code className="mt-1 block rounded-sm bg-surface-container-highest px-3 py-2 font-mono text-[13px]">N = {r.config.targetMean} + Z · {r.config.targetSd}</code>
                </li>
              </ol>
              <p className="mt-3 type-body-sm text-on-surface-variant">
                If a judge's scores are any affine transform of true quality (S = a·q + b, a &gt; 0), their Z-scores are identical — strictness (b) and range (a)
                cancel out. Full proof in JUDGING.md.
              </p>
            </Card>
          </div>

          <Card variant="filled" radius="2xl">
            <SectionHeader title="Before and after" subtitle="Each dot is one ballot; the dark tick is that judge's mean. After normalization every Z-scored judge is centred on the target." level={3} />
            <div className="grid gap-8 expanded:grid-cols-2">
              <StripPlot rows={judgeRows.raw} title="Raw weighted totals" ariaLabel="Raw weighted totals per judge" />
              <StripPlot rows={judgeRows.normalized} title="Normalized scores" ariaLabel="Normalized scores per judge" marker={r.config.targetMean} />
            </div>
          </Card>

          <Card variant="filled" radius="2xl">
            <SectionHeader title="Live invariant check" subtitle="Recomputed from the stored snapshot: for every Z-scored judge, mean(N) = μ_target and sd(N) = σ_target·σⱼ/(σⱼ+ε)." level={3} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <caption className="sr-only">Per-judge statistics and normalization invariants</caption>
                <thead>
                  <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
                    <th scope="col" className="py-2 pr-3">Judge</th>
                    <th scope="col" className="py-2 pr-3">Method</th>
                    <th scope="col" className="py-2 pr-3 text-right">N</th>
                    <th scope="col" className="py-2 pr-3 text-right">μ raw</th>
                    <th scope="col" className="py-2 pr-3 text-right">σ raw</th>
                    <th scope="col" className="py-2 pr-3 text-right">mean(N)</th>
                    <th scope="col" className="py-2 pr-3 text-right">sd(N)</th>
                    <th scope="col" className="py-2 text-right">Holds</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.judges.map((j) => {
                    const inv = r.invariants.find((i) => i.judgeId === j.judgeId)!;
                    return (
                      <tr key={j.judgeId} className="border-b border-outline-variant/60 last:border-0 type-body-md">
                        <td className="py-2 pr-3 text-on-surface">{j.name}</td>
                        <td className="py-2 pr-3">
                          <Pill tone={j.method === "z_score" ? "primary" : "warning"}>{j.method === "z_score" ? "Z-score" : "Min-Max"}</Pill>
                        </td>
                        <td className="py-2 pr-3 text-right">{j.n}</td>
                        <td className="py-2 pr-3 text-right">{fmt(j.mean, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(j.sd, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(inv.normalizedMean, 4)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(inv.normalizedSd, 4)}</td>
                        <td className="py-2 text-right">
                          {j.method === "z_score" ? (
                            <span className={inv.holds ? "text-success" : "text-error"}>
                              <Icon name={inv.holds ? "check_circle" : "error"} size={20} filled className="inline" /> {inv.holds ? "yes" : "no"}
                            </span>
                          ) : (
                            <span className="type-body-sm text-on-surface-variant">n/a (fallback)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {minMaxJudges.length ? (
              <Banner tone="warning" icon="info" className="mt-4">
                {minMaxJudges.map((j) => j.name).join(", ")} submitted fewer than {r.config.minSampleSize} ballots, so their scores are Min-Max scaled onto a uniform distribution with the
                same mean and spread instead of Z-scored (too few points to estimate σ).
              </Banner>
            ) : null}
          </Card>
        </div>
      ) : view === "results" ? (
        <Card variant="filled" radius="2xl" padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <caption className="sr-only">Normalized ranking with raw comparison</caption>
              <thead>
                <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
                  <th scope="col" className="px-4 py-3">Rank</th>
                  <th scope="col" className="px-4 py-3">Δ vs raw</th>
                  <th scope="col" className="px-4 py-3">Project</th>
                  <th scope="col" className="px-4 py-3 text-right">Normalized</th>
                  <th scope="col" className="px-4 py-3 text-right">Raw mean</th>
                  <th scope="col" className="px-4 py-3 text-right" title="Standard deviation of normalized scores across judges">Disagreement</th>
                  <th scope="col" className="px-4 py-3 text-right">Judges</th>
                  <th scope="col" className="px-4 py-3 text-right">Pairwise</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.results.map((x) => (
                  <tr key={x.submissionId} className="border-b border-outline-variant/60 last:border-0">
                    <td className="px-4 py-2 type-title-md text-on-surface">{x.rank}</td>
                    <td className="px-4 py-2">
                      <Movement from={x.rawRank} to={x.rank} />
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/e/${e.slug}/p/${x.submissionId}`} className="type-title-sm text-on-surface hover:text-primary">
                        {x.title}
                      </Link>
                      <p className="type-body-sm text-on-surface-variant">
                        {x.teamName}
                        {x.trackName ? ` · ${x.trackName}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right type-title-sm text-on-surface">{fmt(x.normalizedMean, 1)}</td>
                    <td className="px-4 py-2 text-right type-body-md text-on-surface-variant">{fmt(x.rawMean, 1)}</td>
                    <td className="px-4 py-2 text-right type-body-md text-on-surface-variant">{fmt(x.normalizedSd, 1)}</td>
                    <td className="px-4 py-2 text-right type-body-md text-on-surface-variant">{x.judgeCount}</td>
                    <td className="px-4 py-2 text-right type-body-md text-on-surface-variant">{x.pairwiseRank ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card variant="filled" radius="2xl">
          {pairwise.isPending ? (
            <PageLoader label="Fitting Bradley–Terry" />
          ) : pairwise.data && pairwise.data.comparisons > 0 ? (
            <>
              <SectionHeader
                title="Pairwise ranking"
                subtitle={`${pairwise.data.comparisons} comparisons · MM fit ${pairwise.data.converged ? "converged" : "did not converge"} in ${pairwise.data.iterations} iterations`}
                level={3}
              />
              <ol className="flex flex-col gap-2">
                {pairwise.data.items.map((it) => (
                  <li key={it.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,12rem)_4rem] items-center gap-3 rounded-lg bg-surface-container-low px-3 py-2">
                    <span className="type-title-md tabular-nums text-on-surface">{it.rank}</span>
                    <span className="min-w-0">
                      <span className="block truncate type-title-sm text-on-surface">{it.title}</span>
                      <span className="type-body-sm text-on-surface-variant">
                        {it.wins}W · {it.losses}L
                      </span>
                    </span>
                    <span className="flex h-3 items-center" title={`P(beats average) = ${fmt(it.winProbability * 100, 0)}%`}>
                      <span className="h-3 rounded-r-[4px]" style={{ width: `${it.winProbability * 100}%`, background: "var(--chart-1)" }} />
                      <span className="h-px flex-1 bg-outline-variant" />
                    </span>
                    <span className="text-right type-label-lg tabular-nums text-on-surface">{fmt(it.winProbability * 100, 0)}%</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 type-body-sm text-on-surface-variant">Bar = estimated probability of beating an average project, P = p / (p + 1).</p>
            </>
          ) : (
            <EmptyState icon="compare_arrows" title="No pairwise comparisons yet" body="Judges can switch to pairwise mode from their queue." />
          )}
        </Card>
      )}

      <Card variant="outlined" radius="2xl">
        <SectionHeader title="Exports & records" level={3} />
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/api/events/${e.id}/exports/results.csv`} download variant="tonal" icon="download">Results CSV</LinkButton>
          <LinkButton to={`/api/events/${e.id}/exports/scores.csv`} download variant="tonal" icon="download">Raw scores CSV</LinkButton>
          <LinkButton to={`/api/events/${e.id}/exports/judges.csv`} download variant="tonal" icon="download">Judge progress CSV</LinkButton>
          <Button variant="outlined" icon="workspace_premium" loading={issue.isPending} onClick={() => issue.mutate()}>
            Issue signed records
          </Button>
        </div>
        {norm.data?.history.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer type-title-sm text-on-surface">Run history ({norm.data.history.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 type-body-sm text-on-surface-variant">
              {norm.data.history.map((h) => (
                <li key={h.id} className="font-mono">
                  {h.id} · {formatDateTime(h.createdAt)} · {h.results} projects{h.createdBy ? ` · ${h.createdBy}` : " · seed"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Dialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Publish results?"
        icon="public"
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmPublish(false)}>Cancel</Button>
            <Button variant="tertiary" loading={publish.isPending} onClick={() => publish.mutate()}>Publish</Button>
          </>
        }
      >
        A fresh normalization run is computed and its ranking becomes public. Only ranks, normalized scores, raw means and judge counts are published —
        never individual ballots. Judging closes for this event.
      </Dialog>
    </div>
  );
}
