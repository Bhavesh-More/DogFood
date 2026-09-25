import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { isBeforeDeadline, type EventDto, type SubmissionDto, type TeamDto } from "@dogfood/core";
import { Countdown } from "../../components/Countdown";
import { ApiError, api, errorMessage, get, post, put } from "../../lib/api";
import { cx } from "../../lib/format";
import { useEvent, useMyTeam } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { formatUtc, relativeTime, useServerNow } from "../../lib/time";
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Chip,
  Cover,
  ErrorState,
  Icon,
  IconButton,
  LinkButton,
  PageLoader,
  Pill,
  Select,
  TextArea,
  TextField,
  useToast,
} from "../../ui";

type Draft = {
  title: string;
  tagline: string;
  description: string;
  trackId: string;
  repoUrl: string;
  demoVideoUrl: string;
  liveUrl: string;
  thumbnailUrl: string;
  gallery: string[];
  techTags: string[];
  answers: Record<string, string | boolean>;
};

const EMPTY: Draft = { title: "", tagline: "", description: "", trackId: "", repoUrl: "", demoVideoUrl: "", liveUrl: "", thumbnailUrl: "", gallery: [], techTags: [], answers: {} };

function fromDto(s: SubmissionDto | null): Draft {
  if (!s) return EMPTY;
  return {
    title: s.title,
    tagline: s.tagline,
    description: s.description,
    trackId: s.trackId ?? "",
    repoUrl: s.repoUrl,
    demoVideoUrl: s.demoVideoUrl,
    liveUrl: s.liveUrl,
    thumbnailUrl: s.thumbnailUrl,
    gallery: s.gallery,
    techTags: s.techTags,
    answers: s.answers,
  };
}

function toPayload(d: Draft) {
  return { ...d, trackId: d.trackId || null };
}

function checklist(d: Draft, e: EventDto, members: number) {
  return [
    { ok: d.title.trim().length >= 3, label: "Project name" },
    { ok: d.description.trim().length >= 20, label: "Description (20+ characters)" },
    { ok: /^https?:\/\//.test(d.repoUrl), label: "Repository URL" },
    ...(e.tracks.length ? [{ ok: Boolean(d.trackId), label: "Track" }] : []),
    ...e.questions.filter((q) => q.required).map((q) => ({ ok: d.answers[q.id] !== undefined && d.answers[q.id] !== "" && d.answers[q.id] !== false, label: q.label })),
    { ok: members >= e.minTeamSize, label: `Team of at least ${e.minTeamSize}` },
  ];
}

async function uploadImage(file: File): Promise<string> {
  const r = await api<{ url: string }>("/api/uploads", { method: "POST", raw: file, contentType: file.type || "application/octet-stream" });
  return r.url;
}

function TagInput({ tags, onChange, disabled }: { tags: string[]; onChange: (t: string[]) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const add = () => {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 12) onChange([...tags, t]);
    setValue("");
  };
  return (
    <div>
      <TextField
        label="Tech tags"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        supporting="Press Enter to add · up to 12"
        leadingIcon="sell"
      />
      {tags.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Chip key={t} onRemove={disabled ? undefined : () => onChange(tags.filter((x) => x !== t))}>
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SubmitPage() {
  const { slug } = useParams();
  const { user, loading } = useSession();
  const event = useEvent(slug);
  const team = useMyTeam(event.data?.id, Boolean(user));
  const sub = useQuery({
    queryKey: ["team-submission", team.data?.id],
    queryFn: () => get<SubmissionDto | null>(`/api/teams/${team.data!.id}/submission`),
    enabled: Boolean(team.data),
  });
  if (loading || event.isPending) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=/e/${slug}/submit`} replace />;
  if (event.error) return <ErrorState error={event.error} />;
  const e = event.data;
  if (team.isPending) return <PageLoader />;
  if (!team.data) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Banner tone="info" title="You need a team first" action={<LinkButton to={`/e/${e.slug}/team`} size="xs">Team page</LinkButton>}>
          Solo? Create a team of one.
        </Banner>
      </div>
    );
  }
  if (sub.isPending) return <PageLoader label="Loading your draft" />;
  if (sub.error) return <ErrorState error={sub.error} />;
  return <SubmissionEditor key={team.data.id} event={e} team={team.data} initial={sub.data} />;
}

function SubmissionEditor({ event: e, team, initial }: { event: EventDto; team: TeamDto; initial: SubmissionDto | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(1000);
  const [current, setCurrent] = useState<SubmissionDto | null>(initial);
  const [draft, setDraft] = useState<Draft>(() => fromDto(initial));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (d: Draft) => put<SubmissionDto>(`/api/teams/${team.id}/submission`, toPayload(d)),
    onSuccess: (s) => {
      setDirty(false);
      setSavedAt(s.updatedAt);
      setFieldErrors({});
      setCurrent(s);
      qc.setQueryData(["team-submission", team.id], s);
    },
    onError: (err) => {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
    },
  });

  // Debounced autosave while the window is open (server clock decides).
  const open = isBeforeDeadline(e.submissionDeadline, now, team.deadlineExtensionUntil) && e.status === "published";
  const autosave = save.mutate;
  useEffect(() => {
    if (!dirty || !open) return;
    const t = setTimeout(() => autosave(draft), 1200);
    return () => clearTimeout(t);
  }, [draft, dirty, open, autosave]);

  const lock = useMutation({
    mutationFn: async (action: "submit" | "unsubmit") => {
      let id = current?.id;
      if (dirty || !id) id = (await put<SubmissionDto>(`/api/teams/${team.id}/submission`, toPayload(draft))).id;
      return post<SubmissionDto>(`/api/submissions/${id}/${action}`);
    },
    onSuccess: (s, action) => {
      setDirty(false);
      setCurrent(s);
      qc.setQueryData(["team-submission", team.id], s);
      qc.invalidateQueries({ queryKey: ["my-team"] });
      toast.success(action === "submit" ? "Submitted! You can still edit until the deadline." : "Back to draft.");
    },
    onError: (err) => {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    },
  });

  const upload = useMutation({ mutationFn: uploadImage, onError: (err) => toast.error(errorMessage(err)) });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const members = team.members.length;
  const checks = useMemo(() => checklist(draft, e, members), [draft, e, members]);
  const status = current?.status ?? "draft";
  const deadline = team.deadlineExtensionUntil && team.deadlineExtensionUntil > e.submissionDeadline ? team.deadlineExtensionUntil : e.submissionDeadline;
  const saveLabel = !open ? "Locked" : save.isPending ? "Saving…" : save.isError ? "Save failed — retrying on next edit" : dirty ? "Unsaved changes" : savedAt ? `Saved ${relativeTime(savedAt, now)}` : "Not saved yet";
  const complete = checks.every((c) => c.ok);

  const onFile = async (ev: ChangeEvent<HTMLInputElement>, target: "thumbnail" | "gallery") => {
    const files = [...(ev.target.files ?? [])];
    ev.target.value = "";
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is larger than 5 MB`);
        continue;
      }
      const url = await upload.mutateAsync(f).catch(() => null);
      if (!url) continue;
      if (target === "thumbnail") {
        set("thumbnailUrl", url);
      } else {
        setDraft((d) => ({ ...d, gallery: [...d.gallery, url].slice(0, 8) }));
        setDirty(true);
      }
    }
  };

  return (
    <div className="animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <Link to={`/e/${e.slug}/team`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
            <Icon name="arrow_back" size={18} /> {team.name}
          </Link>
          <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">Submission</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {status === "submitted" ? <Pill tone="success" icon="check_circle">Submitted</Pill> : <Pill tone="warning" icon="edit">Draft</Pill>}
            <span className={cx("inline-flex items-center gap-1 type-label-md", save.isError ? "text-error" : "text-on-surface-variant")} aria-live="polite">
              <Icon name={save.isPending ? "sync" : dirty ? "pending" : "cloud_off"} size={16} className={save.isPending ? "animate-spin" : ""} /> {saveLabel}
            </span>
          </div>
        </div>
        {current ? <LinkButton to={`/e/${e.slug}/p/${current.id}`} variant="outlined" icon="visibility">Preview</LinkButton> : null}
      </header>

      {!open ? (
        <Banner tone="error" icon="lock" title="Submission locked" className="mb-6">
          The hard deadline ({formatUtc(deadline)}) has passed on the server clock. {status === "submitted" ? "Your submitted version is final." : "This draft was not submitted and will not be judged."}
        </Banner>
      ) : null}

      <div className="grid gap-6 expanded:grid-cols-[minmax(0,1fr)_360px]">
        <form className="flex min-w-0 flex-col gap-6" onSubmit={(ev) => ev.preventDefault()} aria-label="Submission form">
          <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
            <h2 className="type-title-lg text-on-surface">Basics</h2>
            <TextField label="Project name" value={draft.title} onChange={(ev) => set("title", ev.target.value)} maxLength={120} required disabled={!open} error={fieldErrors.title} />
            <TextField label="Tagline" value={draft.tagline} onChange={(ev) => set("tagline", ev.target.value)} maxLength={200} disabled={!open} supporting="One sentence that sells it" counter={`${draft.tagline.length}/200`} />
            {e.tracks.length ? (
              <Select label="Track" value={draft.trackId} onChange={(ev) => set("trackId", ev.target.value)} disabled={!open} placeholder="Choose a track" options={e.tracks.map((t) => ({ value: t.id, label: t.name }))} required error={fieldErrors.trackId} />
            ) : null}
            <TextArea label="Description" rows={8} value={draft.description} onChange={(ev) => set("description", ev.target.value)} maxLength={20000} disabled={!open} required error={fieldErrors.description} supporting="What does it do, how does it work, what's next?" />
            <TagInput tags={draft.techTags} onChange={(t) => set("techTags", t)} disabled={!open} />
          </Card>

          <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
            <h2 className="type-title-lg text-on-surface">Links</h2>
            <TextField label="Repository URL" type="url" leadingIcon="code" value={draft.repoUrl} onChange={(ev) => set("repoUrl", ev.target.value)} disabled={!open} required error={fieldErrors.repoUrl} />
            <TextField label="Demo video URL" type="url" leadingIcon="play_arrow" value={draft.demoVideoUrl} onChange={(ev) => set("demoVideoUrl", ev.target.value)} disabled={!open} error={fieldErrors.demoVideoUrl} />
            <TextField label="Live link" type="url" leadingIcon="open_in_new" value={draft.liveUrl} onChange={(ev) => set("liveUrl", ev.target.value)} disabled={!open} error={fieldErrors.liveUrl} />
          </Card>

          <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
            <h2 className="type-title-lg text-on-surface">Media</h2>
            <div className="flex flex-col gap-4 medium:flex-row">
              <div className="overflow-hidden rounded-xl medium:w-72">
                <Cover src={draft.thumbnailUrl} seed={current?.id ?? team.id} label={draft.title} className="h-40 w-full" />
              </div>
              <div className="flex flex-col justify-center gap-2">
                <p className="type-title-sm text-on-surface">Thumbnail</p>
                <p className="type-body-sm text-on-surface-variant">PNG, JPEG, WebP or GIF · max 5 MB. Without one we generate cover art.</p>
                <div className="flex gap-2">
                  <label className={cx("state-layer focus-within:outline focus-within:outline-3 focus-within:outline-secondary inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-secondary-container px-4 type-label-lg text-on-secondary-container", !open && "pointer-events-none opacity-40")}>
                    <Icon name="upload" size={20} className="relative z-[1]" />
                    <span className="relative z-[1]">{upload.isPending ? "Uploading…" : "Upload"}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(ev) => onFile(ev, "thumbnail")} disabled={!open} />
                  </label>
                  {draft.thumbnailUrl ? <Button variant="text" onClick={() => set("thumbnailUrl", "")} disabled={!open}>Remove</Button> : null}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="type-title-sm text-on-surface">Gallery ({draft.gallery.length}/8)</p>
                <label className={cx("state-layer inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 type-label-lg text-primary", (!open || draft.gallery.length >= 8) && "pointer-events-none opacity-40")}>
                  <Icon name="photo_library" size={18} className="relative z-[1]" />
                  <span className="relative z-[1]">Add images</span>
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(ev) => onFile(ev, "gallery")} disabled={!open} />
                </label>
              </div>
              {draft.gallery.length ? (
                <div className="grid grid-cols-2 gap-3 medium:grid-cols-4">
                  {draft.gallery.map((g) => (
                    <div key={g} className="relative overflow-hidden rounded-lg">
                      <img src={g} alt="" className="aspect-video w-full object-cover" />
                      {open ? (
                        <IconButton icon="close" label="Remove image" size="sm" variant="filled" className="absolute right-1 top-1" onClick={() => set("gallery", draft.gallery.filter((x) => x !== g))} />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="type-body-sm text-on-surface-variant">Screenshots and diagrams help judges a lot.</p>
              )}
            </div>
          </Card>

          {e.questions.length ? (
            <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
              <h2 className="type-title-lg text-on-surface">Organizer questions</h2>
              {e.questions.map((q) => {
                const v = draft.answers[q.id];
                const setA = (val: string | boolean) => set("answers", { ...draft.answers, [q.id]: val });
                const err = fieldErrors[`answers.${q.id}`];
                if (q.kind === "boolean") return <Checkbox key={q.id} label={q.label} checked={v === true} onChange={setA} disabled={!open} />;
                if (q.kind === "select")
                  return <Select key={q.id} label={q.label} value={typeof v === "string" ? v : ""} onChange={(ev) => setA(ev.target.value)} options={q.options.map((o) => ({ value: o, label: o }))} placeholder="Choose…" required={q.required} disabled={!open} error={err} supporting={q.help || undefined} />;
                if (q.kind === "textarea") return <TextArea key={q.id} label={q.label} value={typeof v === "string" ? v : ""} onChange={(ev) => setA(ev.target.value)} required={q.required} disabled={!open} error={err} supporting={q.help || undefined} rows={4} />;
                return <TextField key={q.id} label={q.label} type={q.kind === "url" ? "url" : "text"} value={typeof v === "string" ? v : ""} onChange={(ev) => setA(ev.target.value)} required={q.required} disabled={!open} error={err} supporting={q.help || undefined} />;
              })}
            </Card>
          ) : null}
        </form>

        <aside className="flex flex-col gap-4 expanded:sticky expanded:top-20 expanded:self-start">
          <Card variant="elevated" radius="2xl">
            <Countdown target={deadline} label="Hard deadline" />
          </Card>
          <Card variant="filled" radius="2xl">
            <p className="mb-3 type-title-md text-on-surface">Ready to submit?</p>
            <ul className="flex flex-col gap-2" aria-label="Submission checklist">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 type-body-md">
                  <Icon name={c.ok ? "check_circle" : "pending"} filled={c.ok} size={20} className={c.ok ? "text-success" : "text-on-surface-variant"} />
                  <span className={c.ok ? "text-on-surface" : "text-on-surface-variant"}>{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2">
              {status === "submitted" ? (
                <Button variant="outlined" icon="edit" fullWidth disabled={!open} loading={lock.isPending} onClick={() => lock.mutate("unsubmit")}>
                  Return to draft
                </Button>
              ) : (
                <Button size="md" icon="send" fullWidth disabled={!open || !complete} loading={lock.isPending} onClick={() => lock.mutate("submit")}>
                  Submit project
                </Button>
              )}
              {open && dirty ? (
                <Button variant="text" icon="sync" onClick={() => save.mutate(draft)} loading={save.isPending}>
                  Save now
                </Button>
              ) : null}
            </div>
            <p className="mt-3 type-body-sm text-on-surface-variant">Only submitted projects are judged. You can keep editing until the deadline — the server clock decides.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
