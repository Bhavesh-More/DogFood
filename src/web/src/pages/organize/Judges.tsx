import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { JudgeProgressDto, SubmissionDto } from "@dogfood/core";
import { AiRoutingPanel } from "../../components/AiRoutingPanel";
import { BarList } from "../../components/charts/Charts";
import { errorMessage, get, post, patch, del } from "../../lib/api";
import { formatDateTime, relativeTime, useServerNow } from "../../lib/time";
import { Avatar, Banner, Button, Card, Checkbox, Dialog, EmptyState, IconButton, LinearProgress, PageLoader, Pill, SectionHeader, Select, TextField, useToast } from "../../ui";
import { useOrganize } from "./common";

interface AssignmentsResponse {
  reviewsPerSubmission: number;
  assignments: { id: string; judgeId: string; judgeName: string; submissionId: string; submissionTitle: string; status: string }[];
  coverage: { id: string; title: string; reviews: number }[];
  gaps: { id: string; title: string; reviews: number }[];
}

interface Plan {
  dryRun: boolean;
  reviewsPerSubmission: number;
  created: { judgeId: string; submissionId: string }[];
  loads: Record<string, number>;
  shortfalls: { submissionId: string; needed: number; assigned: number; reason: string }[];
  stats: { minLoad: number; maxLoad: number; spread: number; totalAssignments: number };
}

interface InviteRow {
  id: string;
  note: string;
  trackIds: string[] | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  usedBy: string | null;
}

export function JudgesPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(30_000);
  const judges = useQuery({ queryKey: ["org-judges", e.id], queryFn: () => get<JudgeProgressDto[]>(`/api/events/${e.id}/judges`) });
  const invites = useQuery({ queryKey: ["org-judge-invites", e.id], queryFn: () => get<InviteRow[]>(`/api/events/${e.id}/judge-invites`) });
  const assignments = useQuery({ queryKey: ["org-assignments", e.id], queryFn: () => get<AssignmentsResponse>(`/api/events/${e.id}/assignments`) });
  const conflicts = useQuery({
    queryKey: ["org-conflicts", e.id],
    queryFn: () => get<{ judgeId: string; judgeName: string; submissionId: string; submissionTitle: string; reason: string }[]>(`/api/events/${e.id}/conflicts`),
  });
  const subs = useQuery({ queryKey: ["org-subs", e.id], queryFn: () => get<SubmissionDto[]>(`/api/events/${e.id}/submissions`, { status: "submitted" }) });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTracks, setInviteTracks] = useState<string[]>([]);
  const [inviteNote, setInviteNote] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [scope, setScope] = useState<{ judge: JudgeProgressDto; tracks: string[] } | null>(null);
  const [k, setK] = useState(String(e.reviewsPerSubmission));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [conflictForm, setConflictForm] = useState<{ judgeId: string; submissionId: string; reason: string } | null>(null);

  const invalidate = () => {
    for (const key of ["org-judges", "org-judge-invites", "org-assignments", "org-conflicts"]) qc.invalidateQueries({ queryKey: [key, e.id] });
  };
  const createInvite = useMutation({
    mutationFn: () => post<{ url: string }>(`/api/events/${e.id}/judge-invites`, { trackIds: inviteTracks, note: inviteNote }),
    onSuccess: (r) => {
      setInviteUrl(r.url);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revokeInvite = useMutation({ mutationFn: (id: string) => del(`/api/events/${e.id}/judge-invites/${id}`), onSuccess: invalidate, onError: (err) => toast.error(errorMessage(err)) });
  const saveScope = useMutation({
    mutationFn: (v: { userId: string; trackIds: string[] }) => patch(`/api/events/${e.id}/judges/${v.userId}`, { trackIds: v.trackIds }),
    onSuccess: () => {
      setScope(null);
      invalidate();
      toast.success("Scope updated");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const route = useMutation({
    mutationFn: (dryRun: boolean) => post<Plan>(`/api/events/${e.id}/assignments/auto`, { reviewsPerSubmission: Number(k), dryRun }),
    onSuccess: (p) => {
      setPlan(p);
      if (!p.dryRun) {
        invalidate();
        toast.success(`${p.created.length} assignments created`);
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const removeAssignment = useMutation({ mutationFn: (id: string) => del(`/api/events/${e.id}/assignments/${id}`), onSuccess: invalidate, onError: (err) => toast.error(errorMessage(err)) });
  const addConflict = useMutation({
    mutationFn: () => post(`/api/events/${e.id}/conflicts`, conflictForm),
    onSuccess: () => {
      setConflictForm(null);
      invalidate();
      toast.success("Conflict recorded");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const removeConflict = useMutation({
    mutationFn: (c: { judgeId: string; submissionId: string }) => del(`/api/events/${e.id}/conflicts/${c.judgeId}/${c.submissionId}`),
    onSuccess: invalidate,
  });

  if (judges.isPending || assignments.isPending) return <PageLoader label="Loading judges" />;
  const nameOf = (id: string) => judges.data?.find((j) => j.judgeId === id)?.name ?? id;
  const titleOf = (id: string) => subs.data?.find((s) => s.id === id)?.title ?? id;
  const trackName = (id: string) => e.tracks.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader
          title="Judges"
          subtitle="Each judge sees only assigned projects inside their track scope."
          level={3}
          action={<Button icon="person_add" onClick={() => { setInviteOpen(true); setInviteUrl(null); setInviteTracks([]); setInviteNote(""); }}>Invite judge</Button>}
        />
        {judges.data?.length ? (
          <div className="grid grid-cols-1 gap-3 medium:grid-cols-2 expanded:grid-cols-3">
            {judges.data.map((j) => (
              <Card key={j.judgeId} variant="filled" radius="xl" className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={j.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-title-sm text-on-surface">{j.name}</p>
                    <p className="truncate type-body-sm text-on-surface-variant">{j.email}</p>
                  </div>
                  <IconButton icon="tune" label="Edit track scope" onClick={() => setScope({ judge: j, tracks: j.trackIds ?? [] })} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {j.trackIds ? j.trackIds.map((t) => <Pill key={t} tone="secondary">{trackName(t)}</Pill>) : <Pill tone="neutral">All tracks</Pill>}
                </div>
                <div>
                  <div className="mb-1 flex justify-between type-label-md text-on-surface-variant">
                    <span>{j.submitted} submitted · {j.inProgress} in progress</span>
                    <span>{j.assigned} assigned</span>
                  </div>
                  <LinearProgress value={j.submitted} max={j.assigned || 1} label={`${j.name} progress`} tone={j.assigned && j.submitted === j.assigned ? "success" : "primary"} />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="gavel" title="No judges yet" body="Create an invitation link and share it with each judge." />
        )}
        {invites.data?.length ? (
          <details className="mt-4 rounded-lg bg-surface-container-low p-4">
            <summary className="cursor-pointer type-title-sm text-on-surface">Invitation links ({invites.data.length})</summary>
            <ul className="mt-3 divide-y divide-outline-variant">
              {invites.data.map((i) => {
                const expired = Date.parse(i.expiresAt) <= now;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="type-body-md text-on-surface">{i.note || "Judge invitation"} {i.trackIds ? `· ${i.trackIds.map(trackName).join(", ")}` : "· all tracks"}</p>
                      <p className="type-body-sm text-on-surface-variant">
                        {i.revokedAt ? "Revoked" : i.usedAt ? `Accepted by ${i.usedBy}` : expired ? "Expired" : `Expires ${relativeTime(i.expiresAt)}`} · created {formatDateTime(i.createdAt)}
                      </p>
                    </div>
                    {!i.usedAt && !i.revokedAt && !expired ? <Button variant="text" size="xs" onClick={() => revokeInvite.mutate(i.id)}>Revoke</Button> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </section>

      <AiRoutingPanel eventId={e.id} />

      <section>
        <SectionHeader title="Algorithmic routing" subtitle="Most-constrained project first, least-loaded judge first. Deterministic; existing assignments are kept." level={3} />
        <Card variant="filled" radius="2xl" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="Reviews per project" type="number" min={1} max={10} value={k} onChange={(ev) => setK(ev.target.value)} className="w-48" />
            <Button variant="tonal" icon="visibility" loading={route.isPending && route.variables === true} onClick={() => route.mutate(true)}>
              Preview
            </Button>
            <Button icon="hub" loading={route.isPending && route.variables === false} onClick={() => route.mutate(false)}>
              Run routing
            </Button>
          </div>
          {plan ? (
            <div className="grid grid-cols-1 gap-4 medium:grid-cols-2">
              <div className="rounded-xl bg-surface-container-low p-4">
                <p className="mb-1 type-title-sm text-on-surface">{plan.dryRun ? "Preview" : "Result"}: {plan.created.length} new assignments</p>
                <p className="mb-4 type-body-sm text-on-surface-variant">
                  Load per judge {plan.stats.minLoad}–{plan.stats.maxLoad} (spread {plan.stats.spread})
                </p>
                <BarList ariaLabel="Assignments per judge" data={Object.entries(plan.loads).map(([id, n]) => ({ key: id, label: nameOf(id), value: n }))} />
              </div>
              <div className="rounded-xl bg-surface-container-low p-4">
                <p className="mb-2 type-title-sm text-on-surface">Coverage</p>
                {plan.shortfalls.length ? (
                  <ul className="flex flex-col gap-2">
                    {plan.shortfalls.map((s) => (
                      <li key={s.submissionId}>
                        <Banner tone="warning" icon="warning">
                          <strong>{titleOf(s.submissionId)}</strong>: {s.assigned}/{s.needed} judges ({s.reason === "no_eligible_judges" ? "no judge covers its track" : "not enough eligible judges"})
                        </Banner>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Banner tone="success" icon="task_alt">Every eligible project reaches {plan.reviewsPerSubmission} reviews.</Banner>
                )}
              </div>
            </div>
          ) : null}
          {assignments.data?.gaps.length && !plan ? (
            <Banner tone="warning" icon="hub" title={`${assignments.data.gaps.length} projects have fewer than ${assignments.data.reviewsPerSubmission} reviews`}>
              Run routing to top them up.
            </Banner>
          ) : null}
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Conflicts of interest"
          subtitle="Conflicted pairs are never routed. Team members are excluded automatically."
          level={3}
          action={<Button variant="tonal" icon="add" onClick={() => setConflictForm({ judgeId: judges.data?.[0]?.judgeId ?? "", submissionId: subs.data?.[0]?.id ?? "", reason: "" })}>Declare conflict</Button>}
        />
        {conflicts.data?.length ? (
          <ul className="flex flex-col gap-2">
            {conflicts.data.map((c) => (
              <li key={`${c.judgeId}:${c.submissionId}`} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                <Avatar name={c.judgeName} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="type-title-sm text-on-surface">
                    {c.judgeName} ✕ {c.submissionTitle}
                  </p>
                  <p className="type-body-sm text-on-surface-variant">{c.reason}</p>
                </div>
                <IconButton icon="delete" label="Remove conflict" onClick={() => removeConflict.mutate(c)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body-md text-on-surface-variant">No declared conflicts.</p>
        )}
      </section>

      <section>
        <SectionHeader title="Assignments" subtitle={`${assignments.data?.assignments.length ?? 0} total`} level={3} />
        <div className="overflow-x-auto rounded-xl bg-surface-container-low">
          <table className="w-full min-w-[640px] text-left">
            <caption className="sr-only">Assignments</caption>
            <thead>
              <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
                <th scope="col" className="px-4 py-3">Project</th>
                <th scope="col" className="px-4 py-3">Judge</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Remove</th>
              </tr>
            </thead>
            <tbody>
              {assignments.data?.assignments.map((a) => (
                <tr key={a.id} className="border-b border-outline-variant/60 last:border-0">
                  <td className="px-4 py-2 type-body-md text-on-surface">{a.submissionTitle}</td>
                  <td className="px-4 py-2 type-body-md text-on-surface-variant">{a.judgeName}</td>
                  <td className="px-4 py-2">
                    <Pill tone={a.status === "submitted" ? "success" : a.status === "in_progress" ? "warning" : "neutral"}>{a.status.replace("_", " ")}</Pill>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <IconButton icon="delete" label="Remove assignment" size="sm" onClick={() => removeAssignment.mutate(a.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a judge"
        icon="gavel"
        actions={
          inviteUrl ? (
            <Button onClick={() => setInviteOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="text" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button loading={createInvite.isPending} onClick={() => createInvite.mutate()}>Create link</Button>
            </>
          )
        }
      >
        {inviteUrl ? (
          <div className="flex flex-col gap-3">
            <Banner tone="success" icon="link">Single-use link (7 days). Copy it now — it won't be shown again.</Banner>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-sm bg-surface px-3 py-2 font-mono type-body-sm text-on-surface">{inviteUrl}</code>
              <IconButton icon="content_copy" label="Copy" variant="filled" onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => toast.success("Copied"))} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <TextField label="Note (e.g. who it's for)" value={inviteNote} onChange={(ev) => setInviteNote(ev.target.value)} />
            <p className="type-label-lg text-on-surface">Track scope (none = all tracks)</p>
            {e.tracks.map((t) => (
              <Checkbox key={t.id} label={t.name} checked={inviteTracks.includes(t.id)} onChange={(v) => setInviteTracks(v ? [...inviteTracks, t.id] : inviteTracks.filter((x) => x !== t.id))} />
            ))}
          </div>
        )}
      </Dialog>

      <Dialog
        open={scope !== null}
        onClose={() => setScope(null)}
        title={`Track scope · ${scope?.judge.name ?? ""}`}
        icon="tune"
        actions={
          <>
            <Button variant="text" onClick={() => setScope(null)}>Cancel</Button>
            <Button loading={saveScope.isPending} onClick={() => scope && saveScope.mutate({ userId: scope.judge.judgeId, trackIds: scope.tracks })}>Save</Button>
          </>
        }
      >
        <p className="mb-2">Leave everything unchecked for all tracks. Existing assignments outside the new scope stay until you remove them.</p>
        {e.tracks.map((t) => (
          <Checkbox key={t.id} label={t.name} checked={scope?.tracks.includes(t.id) ?? false} onChange={(v) => scope && setScope({ ...scope, tracks: v ? [...scope.tracks, t.id] : scope.tracks.filter((x) => x !== t.id) })} />
        ))}
      </Dialog>

      <Dialog
        open={conflictForm !== null}
        onClose={() => setConflictForm(null)}
        title="Declare a conflict"
        icon="report"
        actions={
          <>
            <Button variant="text" onClick={() => setConflictForm(null)}>Cancel</Button>
            <Button loading={addConflict.isPending} disabled={!conflictForm?.judgeId || !conflictForm.submissionId} onClick={() => addConflict.mutate()}>Save</Button>
          </>
        }
      >
        {conflictForm ? (
          <div className="flex flex-col gap-3">
            <Select label="Judge" value={conflictForm.judgeId} onChange={(ev) => setConflictForm({ ...conflictForm, judgeId: ev.target.value })} options={(judges.data ?? []).map((j) => ({ value: j.judgeId, label: j.name }))} />
            <Select label="Project" value={conflictForm.submissionId} onChange={(ev) => setConflictForm({ ...conflictForm, submissionId: ev.target.value })} options={(subs.data ?? []).map((s) => ({ value: s.id, label: s.title }))} />
            <TextField label="Reason" value={conflictForm.reason} onChange={(ev) => setConflictForm({ ...conflictForm, reason: ev.target.value })} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
