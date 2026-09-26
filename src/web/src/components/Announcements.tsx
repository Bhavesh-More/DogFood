import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AnnouncementDto } from "@dogfood/core";
import { ApiError, del, errorMessage, get, patch, post } from "../lib/api";
import { relativeTime, useServerNow } from "../lib/time";
import { Button, Card, EmptyState, Icon, IconButton, Pill, Select, Switch, TextArea, TextField, useToast } from "../ui";

type Audience = AnnouncementDto["audience"];

const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: "Everyone",
  participants: "Participants only",
  judges: "Judges only",
};

export const announcementKey = (eventId: string) => ["announcements", eventId] as const;

export function useAnnouncements(eventId: string) {
  return useQuery({
    queryKey: announcementKey(eventId),
    queryFn: () => get<AnnouncementDto[]>(`/api/events/${eventId}/announcements`),
    enabled: Boolean(eventId),
  });
}

function AnnouncementItem({ a, manage }: { a: AnnouncementDto; manage: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(60_000);
  const refresh = () => qc.invalidateQueries({ queryKey: announcementKey(a.eventId) });
  const pin = useMutation({
    mutationFn: () => patch(`/api/announcements/${a.id}`, { pinned: !a.pinned }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/api/announcements/${a.id}`),
    onSuccess: () => {
      toast.success("Announcement deleted");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <li>
      <Card variant={a.pinned ? "tonal" : "outlined"} radius="lg" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-2">
          <Icon name="campaign" size={22} className="mt-0.5 shrink-0 text-primary" />
          <h3 className="min-w-0 flex-1 type-title-md text-on-surface">{a.title}</h3>
          {a.pinned ? <Pill tone="primary" icon="star">Pinned</Pill> : null}
          {a.audience !== "everyone" ? <Pill tone="tertiary" icon="lock">{AUDIENCE_LABEL[a.audience]}</Pill> : null}
          {manage ? (
            <span className="flex gap-1">
              <IconButton icon="star" label={a.pinned ? "Unpin" : "Pin to top"} onClick={() => pin.mutate()} disabled={pin.isPending} />
              <IconButton icon="delete" label="Delete announcement" onClick={() => remove.mutate()} disabled={remove.isPending} />
            </span>
          ) : null}
        </div>
        <p className="whitespace-pre-line type-body-md text-on-surface">{a.body}</p>
        <p className="type-label-md text-on-surface-variant">
          {a.authorName ?? "Organizers"} · {relativeTime(a.createdAt, now)}
        </p>
      </Card>
    </li>
  );
}

/** Announcements feed; organizers get pin and delete controls. */
export function AnnouncementList({ eventId, manage = false, limit, emptyHint }: { eventId: string; manage?: boolean; limit?: number; emptyHint?: string }) {
  const q = useAnnouncements(eventId);
  if (q.isPending) return null;
  const list = (q.data ?? []).slice(0, limit);
  if (!list.length) {
    return emptyHint ? <EmptyState icon="campaign" title="No announcements yet" body={emptyHint} className="py-6" /> : null;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Announcements">
      {list.map((a) => (
        <AnnouncementItem key={a.id} a={a} manage={manage} />
      ))}
    </ul>
  );
}

/** Organizer composer: title, message, audience and pin. */
export function AnnouncementComposer({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [pinned, setPinned] = useState(false);
  const publish = useMutation({
    mutationFn: () => post<AnnouncementDto>(`/api/events/${eventId}/announcements`, { title, body, audience, pinned }),
    onSuccess: () => {
      toast.success("Announcement posted and sent to the local outbox");
      setTitle("");
      setBody("");
      setPinned(false);
      qc.invalidateQueries({ queryKey: announcementKey(eventId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const errors = publish.error instanceof ApiError ? publish.error.fieldErrors : {};
  return (
    <form
      className="flex flex-col gap-3"
      aria-label="New announcement"
      onSubmit={(ev) => {
        ev.preventDefault();
        publish.mutate();
      }}
    >
      <TextField label="Title" value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={120} required error={errors.title} />
      <TextArea label="Message" rows={4} value={body} onChange={(ev) => setBody(ev.target.value)} maxLength={5000} required error={errors.body} counter={`${body.length}/5000`} />
      <div className="flex flex-col gap-3">
        <Select
          label="Audience"
          value={audience}
          onChange={(ev) => setAudience(ev.target.value as Audience)}
          options={(Object.keys(AUDIENCE_LABEL) as Audience[]).map((v) => ({ value: v, label: AUDIENCE_LABEL[v] }))}
        />
        <Switch checked={pinned} onChange={setPinned} label="Pin to top" description="Pinned news stays first on the event page." />
      </div>
      <div>
        <Button type="submit" icon="campaign" loading={publish.isPending} disabled={title.trim().length < 3 || !body.trim()}>
          Post announcement
        </Button>
      </div>
    </form>
  );
}
