import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CriterionDto } from "@dogfood/core";
import { get } from "../../lib/api";
import { Banner, Button, Card, Dialog, EmptyState, IconButton, PageLoader, Pill, SectionHeader, Select, TextArea, TextField } from "../../ui";
import { useOrganize } from "./common";
import { useChildCrud } from "./Setup";

type Group = { trackId: string | null; trackName: string; criteria: (CriterionDto & { weightPercent: number })[] };

export function RubricPage() {
  const { event: e } = useOrganize();
  const crud = useChildCrud("criteria");
  const rubric = useQuery({ queryKey: ["criteria", e.id], queryFn: () => get<{ criteria: CriterionDto[]; byTrack: Group[] }>(`/api/events/${e.id}/criteria`) });
  const [form, setForm] = useState<{ id?: string; name: string; description: string; weight: string; maxScore: string; trackId: string } | null>(null);
  if (rubric.isPending) return <PageLoader label="Loading rubric" />;
  if (rubric.error) return <Banner tone="error">{String(rubric.error)}</Banner>;
  const groups = rubric.data.byTrack;
  const shared = rubric.data.criteria.filter((c) => c.trackId === null);
  return (
    <div className="flex flex-col gap-6">
      <Banner tone="primary" icon="balance" title="Weights are relative">
        A ballot's weighted total is 100 · Σ wᵢ·(scoreᵢ / maxᵢ) / Σ wᵢ, so only the ratios between weights matter. Track-specific criteria are added on top of the shared
        ones for projects in that track.
      </Banner>
      <Card variant="filled" radius="2xl">
        <SectionHeader
          title="Criteria"
          subtitle={`${rubric.data.criteria.length} criteria · ${shared.length} shared`}
          level={3}
          action={<Button icon="add" variant="tonal" onClick={() => setForm({ name: "", description: "", weight: "1", maxScore: "10", trackId: "" })}>Add criterion</Button>}
        />
        {rubric.data.criteria.length === 0 ? (
          <EmptyState icon="balance" title="No rubric yet" body="Judges can't score until at least one criterion exists." />
        ) : (
          <ul className="flex flex-col gap-2">
            {rubric.data.criteria.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="type-title-sm text-on-surface">{c.name}</p>
                    <Pill tone="neutral">w {c.weight}</Pill>
                    <Pill tone="neutral">0–{c.maxScore}</Pill>
                    {c.trackId ? <Pill tone="secondary">{e.tracks.find((t) => t.id === c.trackId)?.name ?? "track"}</Pill> : <Pill tone="primary">all tracks</Pill>}
                  </div>
                  {c.description ? <p className="truncate type-body-sm text-on-surface-variant">{c.description}</p> : null}
                </div>
                <IconButton icon="edit" label="Edit" onClick={() => setForm({ id: c.id, name: c.name, description: c.description, weight: String(c.weight), maxScore: String(c.maxScore), trackId: c.trackId ?? "" })} />
                <IconButton icon="delete" label="Delete" onClick={() => crud.remove.mutate(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section>
        <SectionHeader title="Effective rubric per track" subtitle="What judges see, with normalized weights" level={3} />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2 expanded:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.trackId ?? "all"} variant="outlined" radius="xl">
              <p className="mb-3 type-title-md text-on-surface">{g.trackId ? g.trackName : "Projects without a track"}</p>
              <ul className="flex flex-col gap-2.5">
                {g.criteria.map((c) => (
                  <li key={c.id}>
                    <div className="flex justify-between type-body-sm">
                      <span className="text-on-surface">{c.name}</span>
                      <span className="tabular-nums text-on-surface-variant">{c.weightPercent.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 flex h-2 items-center">
                      <div className="h-2 rounded-r-[4px]" style={{ width: `${c.weightPercent}%`, background: "var(--chart-1)" }} />
                      <div className="h-px flex-1 bg-outline-variant" />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit criterion" : "Add criterion"}
        actions={
          <>
            <Button variant="text" onClick={() => setForm(null)}>Cancel</Button>
            <Button
              loading={crud.save.isPending}
              onClick={() =>
                form &&
                crud.save.mutate(
                  { id: form.id, body: { name: form.name, description: form.description, weight: Number(form.weight), maxScore: Number(form.maxScore), trackId: form.trackId || null } },
                  { onSuccess: () => setForm(null) },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-3">
            <TextField label="Name" value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
            <TextArea label="Guidance for judges" value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} rows={3} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Weight" type="number" step="0.05" min="0.01" value={form.weight} onChange={(ev) => setForm({ ...form, weight: ev.target.value })} />
              <TextField label="Max score" type="number" min="1" max="100" value={form.maxScore} onChange={(ev) => setForm({ ...form, maxScore: ev.target.value })} />
            </div>
            <Select label="Applies to" value={form.trackId} onChange={(ev) => setForm({ ...form, trackId: ev.target.value })} placeholder="All tracks" options={e.tracks.map((t) => ({ value: t.id, label: t.name }))} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
