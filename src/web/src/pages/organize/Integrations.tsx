import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { WEBHOOK_EVENTS } from "@dogfood/core";
import { errorMessage, get, post, del } from "../../lib/api";
import { relativeTime } from "../../lib/time";
import { Banner, Button, Card, Checkbox, Dialog, EmptyState, IconButton, LinkButton, Pill, SectionHeader, TextArea, TextField, useToast } from "../../ui";
import { useOrganize } from "./common";

interface Hook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  delivered: number;
  failed: number;
  pending: number;
}
interface Delivery {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
}

function Deliveries({ eventId, hookId }: { eventId: string; hookId: string }) {
  const q = useQuery({ queryKey: ["deliveries", hookId], queryFn: () => get<Delivery[]>(`/api/events/${eventId}/webhooks/${hookId}/deliveries`), refetchInterval: 4000 });
  if (!q.data?.length) return <p className="type-body-sm text-on-surface-variant">No deliveries yet.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {q.data.slice(0, 8).map((d) => (
        <li key={d.id} className="flex items-center gap-2 type-body-sm">
          <Pill tone={d.status === "delivered" ? "success" : d.status === "failed" ? "error" : "warning"}>{d.status}</Pill>
          <span className="font-mono text-on-surface">{d.eventType}</span>
          <span className="text-on-surface-variant">
            {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
            {d.lastStatus ? ` · HTTP ${d.lastStatus}` : ""}
            {d.lastError ? ` · ${d.lastError}` : ""} · {relativeTime(d.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function IntegrationsPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const hooks = useQuery({ queryKey: ["webhooks", e.id], queryFn: () => get<Hook[]>(`/api/events/${e.id}/webhooks`) });
  const [form, setForm] = useState<{ url: string; events: string[] } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [csv, setCsv] = useState("email,name,team\n");
  const [imported, setImported] = useState<{ registered: number; teams: number; created: { email: string; name: string; temporaryPassword: string }[] } | null>(null);

  const create = useMutation({
    mutationFn: () => post<{ secret: string }>(`/api/events/${e.id}/webhooks`, { url: form!.url, events: form!.events }),
    onSuccess: (r) => {
      setForm(null);
      setSecret(r.secret);
      qc.invalidateQueries({ queryKey: ["webhooks", e.id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/events/${e.id}/webhooks/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", e.id] }) });
  const ping = useMutation({ mutationFn: (id: string) => post(`/api/events/${e.id}/webhooks/${id}/test`), onSuccess: () => toast.show("Ping queued") });
  const importCsv = useMutation({
    mutationFn: () => post<NonNullable<typeof imported>>(`/api/events/${e.id}/registrations/import`, { csv }),
    onSuccess: (r) => {
      setImported(r);
      qc.invalidateQueries();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const embed = `<iframe src="${window.location.origin}/embed/${e.slug}" width="100%" height="520" style="border:0;border-radius:16px" title="${e.name} projects"></iframe>`;

  return (
    <div className="flex flex-col gap-6">
      <Card variant="filled" radius="2xl">
        <SectionHeader
          title="Webhooks"
          subtitle="Signed with HMAC-SHA256 over `${timestamp}.${body}` (X-Dogfood-Signature); retried with exponential backoff."
          level={3}
          action={<Button icon="add" variant="tonal" onClick={() => setForm({ url: "", events: ["submission.submitted", "results.published"] })}>Add webhook</Button>}
        />
        {secret ? (
          <Banner tone="success" icon="key" title="Signing secret — copy it now" className="mb-4">
            <code className="break-all font-mono">{secret}</code>
          </Banner>
        ) : null}
        {hooks.data?.length ? (
          <ul className="flex flex-col gap-3">
            {hooks.data.map((h) => (
              <li key={h.id} className="rounded-lg bg-surface-container-low p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono type-body-md text-on-surface">{h.url}</p>
                  <Pill tone="success">{h.delivered} ok</Pill>
                  <Pill tone={h.failed ? "error" : "neutral"}>{h.failed} failed</Pill>
                  <IconButton icon="send" label="Send test ping" onClick={() => ping.mutate(h.id)} />
                  <IconButton icon="delete" label="Delete webhook" onClick={() => remove.mutate(h.id)} />
                </div>
                <p className="mt-1 type-body-sm text-on-surface-variant">{h.events.join(" · ")}</p>
                <Deliveries eventId={e.id} hookId={h.id} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="webhook" title="No webhooks" body="Push lifecycle events to your own services (on your network — no cloud needed)." className="py-6" />
        )}
      </Card>

      <div className="grid gap-6 expanded:grid-cols-2">
        <Card variant="filled" radius="2xl" className="flex flex-col gap-3">
          <SectionHeader title="Export & clone" subtitle="Full event bundle as JSON; import it to clone the configuration." level={3} className="mb-0" />
          <div className="flex flex-wrap gap-2">
            <LinkButton to={`/api/events/${e.id}/export.json`} download icon="download">Event bundle (JSON)</LinkButton>
            <LinkButton to={`/api/events/${e.id}/exports/submissions.csv`} download variant="tonal" icon="download">Submissions CSV</LinkButton>
            <LinkButton to={`/api/events/${e.id}/exports/audit.csv`} download variant="tonal" icon="download">Audit CSV</LinkButton>
          </div>
        </Card>
        <Card variant="filled" radius="2xl" className="flex flex-col gap-3">
          <SectionHeader title="Embeddable gallery" subtitle="Drop this widget into any site; it only needs this server." level={3} className="mb-0" />
          <code className="block overflow-x-auto rounded-md bg-inverse-surface p-3 font-mono type-body-sm text-inverse-on-surface">{embed}</code>
          <div className="flex gap-2">
            <Button variant="tonal" icon="content_copy" onClick={() => navigator.clipboard?.writeText(embed).then(() => toast.success("Copied"))}>Copy</Button>
            <LinkButton to={`/embed/${e.slug}`} variant="text" icon="open_in_new">Preview</LinkButton>
          </div>
        </Card>
      </div>

      <Card variant="filled" radius="2xl" className="flex flex-col gap-3">
        <SectionHeader title="Bulk registration import" subtitle="CSV with email,name[,team]. New accounts get a one-time password shown here once." level={3} className="mb-0" />
        <TextArea label="CSV" value={csv} onChange={(ev) => setCsv(ev.target.value)} rows={6} className="font-mono" />
        <div>
          <Button icon="upload" loading={importCsv.isPending} onClick={() => importCsv.mutate()}>Import</Button>
        </div>
        {imported ? (
          <Banner tone="success" title={`${imported.registered} registered · ${imported.teams} teams · ${imported.created.length} new accounts`}>
            {imported.created.length ? (
              <ul className="mt-2 font-mono type-body-sm">
                {imported.created.map((c) => (
                  <li key={c.email}>
                    {c.email} → {c.temporaryPassword}
                  </li>
                ))}
              </ul>
            ) : null}
          </Banner>
        ) : null}
      </Card>

      <Card variant="outlined" radius="2xl" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-title-md text-on-surface">REST API</p>
          <p className="type-body-md text-on-surface-variant">Every UI action is an API call. Create a personal token in Settings and use it as a Bearer token.</p>
        </div>
        <div className="flex gap-2">
          <LinkButton to="/api-docs" icon="api">API reference</LinkButton>
          <LinkButton to="/settings" variant="tonal" icon="key">Tokens</LinkButton>
        </div>
      </Card>

      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title="Add webhook"
        icon="webhook"
        actions={
          <>
            <Button variant="text" onClick={() => setForm(null)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!form?.url || !form.events.length} onClick={() => create.mutate()}>Create</Button>
          </>
        }
      >
        {form ? (
          <div className="flex flex-col gap-2">
            <TextField label="Endpoint URL" type="url" value={form.url} onChange={(ev) => setForm({ ...form, url: ev.target.value })} supporting="e.g. http://my-bot.lan:9000/hooks" />
            {WEBHOOK_EVENTS.map((evt) => (
              <Checkbox key={evt} label={<span className="font-mono type-body-md">{evt}</span>} checked={form.events.includes(evt)} onChange={(v) => setForm({ ...form, events: v ? [...form.events, evt] : form.events.filter((x) => x !== evt) })} />
            ))}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
