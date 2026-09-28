import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { EventDto } from "@dogfood/core";
import { ApiError, errorMessage, patch, post } from "../../lib/api";
import { keys } from "../../lib/queries";
import { Banner, Button, ButtonGroup, Card, Dialog, SectionHeader, Select, TextArea, TextField, useToast } from "../../ui";
import { fromLocalInput, toLocalInput, useOrganize, utcHint } from "./common";

export function EventSettingsPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<null | "archive">(null);
  const [f, setF] = useState({
    name: e.name,
    slug: e.slug,
    tagline: e.tagline,
    description: e.description,
    rules: e.rules,
    location: e.location,
    startsAt: toLocalInput(e.startsAt),
    submissionDeadline: toLocalInput(e.submissionDeadline),
    judgingEndsAt: toLocalInput(e.judgingEndsAt),
    votingOpensAt: toLocalInput(e.votingOpensAt),
    votingClosesAt: toLocalInput(e.votingClosesAt),
    minTeamSize: e.minTeamSize,
    maxTeamSize: e.maxTeamSize,
    votingMode: e.votingMode,
    votingStyle: e.votingStyle,
    quadraticCredits: e.quadraticCredits,
    reviewsPerSubmission: e.reviewsPerSubmission,
    targetMean: e.normalization.targetMean,
    targetSd: e.normalization.targetSd,
    minSampleSize: e.normalization.minSampleSize,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      patch<EventDto>(`/api/events/${e.id}`, {
        name: f.name,
        slug: f.slug,
        tagline: f.tagline,
        description: f.description,
        rules: f.rules,
        location: f.location,
        startsAt: fromLocalInput(f.startsAt),
        submissionDeadline: fromLocalInput(f.submissionDeadline),
        judgingEndsAt: fromLocalInput(f.judgingEndsAt),
        votingOpensAt: fromLocalInput(f.votingOpensAt),
        votingClosesAt: fromLocalInput(f.votingClosesAt),
        minTeamSize: Number(f.minTeamSize),
        maxTeamSize: Number(f.maxTeamSize),
        votingMode: f.votingMode,
        votingStyle: f.votingStyle,
        quadraticCredits: Number(f.quadraticCredits),
        reviewsPerSubmission: Number(f.reviewsPerSubmission),
        normalization: { targetMean: Number(f.targetMean), targetSd: Number(f.targetSd), minSampleSize: Number(f.minSampleSize) },
      }),
    onSuccess: (updated) => {
      toast.success("Settings saved");
      qc.setQueryData(keys.event(updated.slug), updated);
      qc.invalidateQueries({ queryKey: ["events"] });
      if (updated.slug !== e.slug) navigate(`/organize/${updated.slug}/settings`, { replace: true });
      else qc.invalidateQueries({ queryKey: keys.event(e.slug) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const status = useMutation({
    mutationFn: (action: "publish" | "archive") => post(`/api/events/${e.id}/${action}`),
    onSuccess: () => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: keys.event(e.slug) });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const errs = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="Details" level={3} className="mb-0" />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
          <TextField label="Name" value={f.name} onChange={(ev) => set("name", ev.target.value)} error={errs.name} />
          <TextField label="Slug" value={f.slug} onChange={(ev) => set("slug", ev.target.value)} error={errs.slug} />
        </div>
        <TextField label="Tagline" value={f.tagline} onChange={(ev) => set("tagline", ev.target.value)} />
        <TextField label="Location" value={f.location} onChange={(ev) => set("location", ev.target.value)} />
        <TextArea label="Description" value={f.description} onChange={(ev) => set("description", ev.target.value)} rows={6} />
        <TextArea label="Rules" value={f.rules} onChange={(ev) => set("rules", ev.target.value)} rows={5} />
      </Card>

      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="Schedule" subtitle="Shown in your timezone; stored and enforced in UTC by the server." level={3} className="mb-0" />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
          <TextField label="Hacking starts" type="datetime-local" value={f.startsAt} onChange={(ev) => set("startsAt", ev.target.value)} supporting={utcHint(f.startsAt)} error={errs.startsAt} />
          <TextField label="Hard submission deadline" type="datetime-local" value={f.submissionDeadline} onChange={(ev) => set("submissionDeadline", ev.target.value)} supporting={utcHint(f.submissionDeadline)} error={errs.submissionDeadline} />
          <TextField label="Judging ends (optional)" type="datetime-local" value={f.judgingEndsAt} onChange={(ev) => set("judgingEndsAt", ev.target.value)} supporting={utcHint(f.judgingEndsAt)} />
        </div>
        <Banner tone="info" icon="history">Deadline changes are recorded in the audit trail with the previous value.</Banner>
      </Card>

      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="Teams & judging" level={3} className="mb-0" />
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-3">
          <TextField label="Min team size" type="number" min={1} max={10} value={f.minTeamSize} onChange={(ev) => set("minTeamSize", Number(ev.target.value))} error={errs.minTeamSize} />
          <TextField label="Max team size" type="number" min={1} max={10} value={f.maxTeamSize} onChange={(ev) => set("maxTeamSize", Number(ev.target.value))} />
          <TextField label="Reviews per project" type="number" min={1} max={10} value={f.reviewsPerSubmission} onChange={(ev) => set("reviewsPerSubmission", Number(ev.target.value))} />
        </div>
        <p className="type-title-sm text-on-surface">Normalization</p>
        <div className="grid grid-cols-1 gap-4 medium:grid-cols-3">
          <TextField label="Target mean" type="number" value={f.targetMean} onChange={(ev) => set("targetMean", Number(ev.target.value))} supporting="μ_target" />
          <TextField label="Target std-dev" type="number" value={f.targetSd} onChange={(ev) => set("targetSd", Number(ev.target.value))} supporting="σ_target" />
          <TextField label="Min-Max below N =" type="number" min={1} value={f.minSampleSize} onChange={(ev) => set("minSampleSize", Number(ev.target.value))} supporting="Judges with fewer ballots use Min-Max" />
        </div>
      </Card>

      <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
        <SectionHeader title="Community voting" level={3} className="mb-0" />
        <ButtonGroup
          label="Voting access"
          value={f.votingMode}
          onChange={(v) => set("votingMode", v)}
          options={[
            { value: "off", label: "Off" },
            { value: "open", label: "Open link" },
            { value: "email", label: "Email-gated" },
            { value: "authenticated", label: "Signed-in" },
          ]}
        />
        {f.votingMode !== "off" ? (
          <>
            <div className="grid grid-cols-1 gap-4 medium:grid-cols-3">
              <Select label="Style" value={f.votingStyle} onChange={(ev) => set("votingStyle", ev.target.value as typeof f.votingStyle)} options={[{ value: "single", label: "One vote per project" }, { value: "quadratic", label: "Quadratic (credits)" }]} />
              <TextField label={f.votingStyle === "quadratic" ? "Credits per voter" : "Projects each voter may back"} type="number" min={1} value={f.quadraticCredits} onChange={(ev) => set("quadraticCredits", Number(ev.target.value))} />
            </div>
            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <TextField label="Voting opens" type="datetime-local" value={f.votingOpensAt} onChange={(ev) => set("votingOpensAt", ev.target.value)} supporting={utcHint(f.votingOpensAt)} />
              <TextField label="Voting closes" type="datetime-local" value={f.votingClosesAt} onChange={(ev) => set("votingClosesAt", ev.target.value)} supporting={utcHint(f.votingClosesAt)} error={errs.votingClosesAt} />
            </div>
          </>
        ) : null}
      </Card>

      <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-high p-3 shadow-2 medium:bottom-4">
        <div className="flex flex-wrap gap-2">
          {e.status === "draft" ? <Button variant="tonal" icon="public" onClick={() => status.mutate("publish")} loading={status.isPending}>Publish</Button> : null}
          {e.status !== "archived" ? <Button variant="text" icon="history" onClick={() => setConfirm("archive")}>Archive</Button> : null}
        </div>
        <Button type="submit" size="md" icon="check" loading={save.isPending}>
          Save changes
        </Button>
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Archive this event?"
        icon="history"
        actions={
          <>
            <Button variant="text" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" loading={status.isPending} onClick={() => confirm && status.mutate(confirm)}>
              Archive
            </Button>
          </>
        }
      >
        Archived events stay visible as read-only history. This cannot be undone.
      </Dialog>
    </form>
  );
}
