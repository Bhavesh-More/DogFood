import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { EventDto } from "@dogfood/core";
import { ApiError, errorMessage, post } from "../../lib/api";
import { Banner, Button, Card, Icon, TextArea, TextField } from "../../ui";
import { fromLocalInput, toLocalInput, utcHint } from "./common";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export function CreateEventPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => {
    const now = Date.now();
    return {
      name: "",
      slug: "",
      tagline: "",
      description: "",
      startsAt: toLocalInput(new Date(now + 7 * 86_400_000).toISOString()),
      submissionDeadline: toLocalInput(new Date(now + 10 * 86_400_000).toISOString()),
      maxTeamSize: 4,
    };
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      post<EventDto>("/api/events", {
        name: form.name,
        slug: form.slug,
        tagline: form.tagline,
        description: form.description,
        startsAt: fromLocalInput(form.startsAt),
        submissionDeadline: fromLocalInput(form.submissionDeadline),
        maxTeamSize: form.maxTeamSize,
      }),
    onSuccess: (e) => navigate(`/organize/${e.slug}/setup`),
  });
  const errs = create.error instanceof ApiError ? create.error.fieldErrors : {};
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    create.mutate();
  };
  return (
    <div className="mx-auto max-w-3xl animate-enter py-6">
      <Link to="/organize" className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
        <Icon name="arrow_back" size={18} /> Organizer console
      </Link>
      <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">New hackathon</h1>
      <p className="mt-2 type-body-lg text-on-surface-variant">It starts as a private draft. Add tracks, prizes, questions and a rubric next, then publish.</p>
      <Card variant="filled" radius="2xl" className="mt-6">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {create.error && !Object.keys(errs).length ? <Banner tone="error">{errorMessage(create.error)}</Banner> : null}
          <TextField
            label="Event name"
            value={form.name}
            required
            error={errs.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })}
          />
          <TextField
            label="URL slug"
            value={form.slug}
            required
            error={errs.slug}
            supporting={`Public page: /e/${form.slug || "your-slug"}`}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: slugify(e.target.value) });
            }}
          />
          <TextField label="Tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={200} />
          <TextArea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} />
          <div className="grid gap-4 medium:grid-cols-2">
            <TextField label="Hacking starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} supporting={utcHint(form.startsAt)} error={errs.startsAt} />
            <TextField
              label="Hard submission deadline"
              type="datetime-local"
              value={form.submissionDeadline}
              onChange={(e) => setForm({ ...form, submissionDeadline: e.target.value })}
              supporting={utcHint(form.submissionDeadline)}
              error={errs.submissionDeadline}
            />
          </div>
          <TextField label="Max team size" type="number" min={1} max={10} value={form.maxTeamSize} onChange={(e) => setForm({ ...form, maxTeamSize: Number(e.target.value) })} error={errs.maxTeamSize} className="max-w-48" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" onClick={() => navigate("/organize")}>Cancel</Button>
            <Button type="submit" size="md" icon="add" loading={create.isPending}>
              Create draft
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
