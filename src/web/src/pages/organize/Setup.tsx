import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { PrizeDto, QuestionDto, TrackDto } from "@dogfood/core";
import { errorMessage, patch, post, del } from "../../lib/api";
import { keys } from "../../lib/queries";
import { Button, Card, Checkbox, Dialog, EmptyState, IconButton, Pill, SectionHeader, Select, TextArea, TextField, useToast, type IconName } from "../../ui";
import { useOrganize } from "./common";

/** Shared add/edit/delete plumbing for the event's child collections. */
export function useChildCrud(plural: string) {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: keys.event(e.slug) });
    qc.invalidateQueries({ queryKey: ["criteria", e.id] });
  };
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: unknown }) => (id ? patch(`/api/events/${e.id}/${plural}/${id}`, body) : post(`/api/events/${e.id}/${plural}`, body)),
    onSuccess: (_d, v) => done(v.id ? "Saved" : "Added"),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/api/events/${e.id}/${plural}/${id}`),
    onSuccess: () => done("Removed"),
    onError: (err) => toast.error(errorMessage(err)),
  });
  return { save, remove };
}

function Section<T extends { id: string }>({
  title,
  subtitle,
  icon,
  items,
  render,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  items: T[];
  render: (item: T) => ReactNode;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}) {
  return (
    <Card variant="filled" radius="2xl">
      <SectionHeader title={title} subtitle={subtitle} level={3} action={<Button icon="add" variant="tonal" onClick={onAdd}>Add</Button>} />
      {items.length === 0 ? (
        <EmptyState icon={icon} title={`No ${title.toLowerCase()} yet`} className="py-6" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
              <div className="min-w-0 flex-1">{render(item)}</div>
              <IconButton icon="edit" label="Edit" onClick={() => onEdit(item)} />
              <IconButton icon="delete" label="Delete" onClick={() => onDelete(item)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SetupPage() {
  const { event: e } = useOrganize();
  const tracks = useChildCrud("tracks");
  const prizes = useChildCrud("prizes");
  const questions = useChildCrud("questions");
  const [trackForm, setTrackForm] = useState<Partial<TrackDto> | null>(null);
  const [prizeForm, setPrizeForm] = useState<Partial<PrizeDto> | null>(null);
  const [questionForm, setQuestionForm] = useState<(Partial<QuestionDto> & { optionsText?: string }) | null>(null);

  return (
    <div className="grid gap-6 expanded:grid-cols-2">
      <Section
        title="Tracks"
        subtitle="Categories projects compete in; judges can be scoped to tracks."
        icon="category"
        items={e.tracks}
        render={(t) => (
          <>
            <p className="type-title-sm text-on-surface">{t.name}</p>
            <p className="truncate type-body-sm text-on-surface-variant">{t.description}</p>
          </>
        )}
        onAdd={() => setTrackForm({ name: "", description: "" })}
        onEdit={(t) => setTrackForm(t)}
        onDelete={(t) => tracks.remove.mutate(t.id)}
      />
      <Section
        title="Prizes"
        subtitle="What's at stake, overall or per track."
        icon="trophy"
        items={e.prizes}
        render={(p) => (
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <p className="type-title-sm text-on-surface">{p.name}</p>
              <p className="truncate type-body-sm text-on-surface-variant">{p.description}</p>
            </div>
            {p.value ? <Pill tone="tertiary">{p.value}</Pill> : null}
          </div>
        )}
        onAdd={() => setPrizeForm({ name: "", description: "", value: "", trackId: null })}
        onEdit={(p) => setPrizeForm(p)}
        onDelete={(p) => prizes.remove.mutate(p.id)}
      />
      <div className="expanded:col-span-2">
        <Section
          title="Submission questions"
          subtitle="Custom questions every team answers when submitting."
          icon="chat_bubble"
          items={e.questions}
          render={(q) => (
            <div className="flex flex-wrap items-center gap-2">
              <p className="type-title-sm text-on-surface">{q.label}</p>
              <Pill tone="neutral">{q.kind}</Pill>
              {q.required ? <Pill tone="primary">required</Pill> : null}
            </div>
          )}
          onAdd={() => setQuestionForm({ label: "", help: "", kind: "text", required: false, optionsText: "" })}
          onEdit={(q) => setQuestionForm({ ...q, optionsText: q.options.join("\n") })}
          onDelete={(q) => questions.remove.mutate(q.id)}
        />
      </div>

      <Dialog
        open={trackForm !== null}
        onClose={() => setTrackForm(null)}
        title={trackForm?.id ? "Edit track" : "Add track"}
        actions={
          <>
            <Button variant="text" onClick={() => setTrackForm(null)}>Cancel</Button>
            <Button loading={tracks.save.isPending} onClick={() => tracks.save.mutate({ id: trackForm?.id, body: { name: trackForm?.name, description: trackForm?.description ?? "" } }, { onSuccess: () => setTrackForm(null) })}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField label="Name" value={trackForm?.name ?? ""} onChange={(ev) => setTrackForm({ ...trackForm, name: ev.target.value })} />
          <TextArea label="Description" value={trackForm?.description ?? ""} onChange={(ev) => setTrackForm({ ...trackForm, description: ev.target.value })} rows={3} />
        </div>
      </Dialog>

      <Dialog
        open={prizeForm !== null}
        onClose={() => setPrizeForm(null)}
        title={prizeForm?.id ? "Edit prize" : "Add prize"}
        actions={
          <>
            <Button variant="text" onClick={() => setPrizeForm(null)}>Cancel</Button>
            <Button
              loading={prizes.save.isPending}
              onClick={() =>
                prizes.save.mutate(
                  { id: prizeForm?.id, body: { name: prizeForm?.name, description: prizeForm?.description ?? "", value: prizeForm?.value ?? "", trackId: prizeForm?.trackId || null } },
                  { onSuccess: () => setPrizeForm(null) },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField label="Name" value={prizeForm?.name ?? ""} onChange={(ev) => setPrizeForm({ ...prizeForm, name: ev.target.value })} />
          <TextField label="Value" value={prizeForm?.value ?? ""} onChange={(ev) => setPrizeForm({ ...prizeForm, value: ev.target.value })} supporting="e.g. ₹15,000 or a mentorship" />
          <Select label="Track" value={prizeForm?.trackId ?? ""} onChange={(ev) => setPrizeForm({ ...prizeForm, trackId: ev.target.value || null })} placeholder="Overall" options={e.tracks.map((t) => ({ value: t.id, label: t.name }))} />
          <TextArea label="Description" value={prizeForm?.description ?? ""} onChange={(ev) => setPrizeForm({ ...prizeForm, description: ev.target.value })} rows={3} />
        </div>
      </Dialog>

      <Dialog
        open={questionForm !== null}
        onClose={() => setQuestionForm(null)}
        title={questionForm?.id ? "Edit question" : "Add question"}
        actions={
          <>
            <Button variant="text" onClick={() => setQuestionForm(null)}>Cancel</Button>
            <Button
              loading={questions.save.isPending}
              onClick={() =>
                questions.save.mutate(
                  {
                    id: questionForm?.id,
                    body: {
                      label: questionForm?.label,
                      help: questionForm?.help ?? "",
                      kind: questionForm?.kind ?? "text",
                      required: questionForm?.required ?? false,
                      options: (questionForm?.optionsText ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
                    },
                  },
                  { onSuccess: () => setQuestionForm(null) },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField label="Question" value={questionForm?.label ?? ""} onChange={(ev) => setQuestionForm({ ...questionForm, label: ev.target.value })} />
          <TextField label="Help text" value={questionForm?.help ?? ""} onChange={(ev) => setQuestionForm({ ...questionForm, help: ev.target.value })} />
          <Select
            label="Answer type"
            value={questionForm?.kind ?? "text"}
            onChange={(ev) => setQuestionForm({ ...questionForm, kind: ev.target.value as QuestionDto["kind"] })}
            options={[
              { value: "text", label: "Short text" },
              { value: "textarea", label: "Long text" },
              { value: "url", label: "URL" },
              { value: "select", label: "Choice" },
              { value: "boolean", label: "Yes / no" },
            ]}
          />
          {questionForm?.kind === "select" ? <TextArea label="Options (one per line)" value={questionForm.optionsText ?? ""} onChange={(ev) => setQuestionForm({ ...questionForm, optionsText: ev.target.value })} rows={4} /> : null}
          <Checkbox label="Required to submit" checked={questionForm?.required ?? false} onChange={(v) => setQuestionForm({ ...questionForm, required: v })} />
        </div>
      </Dialog>
    </div>
  );
}
