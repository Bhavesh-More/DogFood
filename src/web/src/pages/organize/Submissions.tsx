import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Eligibility, SubmissionDto } from "@dogfood/core";
import { errorMessage, get, patch, post } from "../../lib/api";
import { formatUtc } from "../../lib/time";
import { Button, ButtonGroup, Chip, Dialog, EmptyState, IconButton, LinkButton, PageLoader, Pill, TextField, useToast } from "../../ui";
import { fromLocalInput, toLocalInput, useOrganize, utcHint } from "./common";

const ELIG_TONE = { pending: "warning", eligible: "success", ineligible: "error" } as const;

export function SubmissionsPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const subs = useQuery({ queryKey: ["org-subs", e.id], queryFn: () => get<SubmissionDto[]>(`/api/events/${e.id}/submissions`) });
  const [status, setStatus] = useState<"all" | "submitted" | "draft">("all");
  const [elig, setElig] = useState<"" | Eligibility>("");
  const [q, setQ] = useState("");
  const [eligDialog, setEligDialog] = useState<{ sub: SubmissionDto; to: Eligibility; note: string } | null>(null);
  const [extDialog, setExtDialog] = useState<{ sub: SubmissionDto; until: string; reason: string } | null>(null);

  const setEligibility = useMutation({
    mutationFn: (v: { id: string; eligibility: Eligibility; note: string }) => patch(`/api/submissions/${v.id}/eligibility`, { eligibility: v.eligibility, note: v.note }),
    onSuccess: () => {
      setEligDialog(null);
      qc.invalidateQueries({ queryKey: ["org-subs", e.id] });
      toast.success("Eligibility updated (audit-logged)");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const extend = useMutation({
    mutationFn: (v: { teamId: string; until: string | null; reason: string }) => post(`/api/teams/${v.teamId}/extension`, { until: v.until, reason: v.reason }),
    onSuccess: () => {
      setExtDialog(null);
      qc.invalidateQueries({ queryKey: ["org-subs", e.id] });
      toast.success("Extension saved (audit-logged)");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = useMemo(
    () =>
      (subs.data ?? []).filter(
        (s) =>
          (status === "all" || s.status === status) &&
          (!elig || s.eligibility === elig) &&
          `${s.title} ${s.teamName}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [subs.data, status, elig, q],
  );
  if (subs.isPending) return <PageLoader label="Loading submissions" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 medium:flex-row medium:items-center">
        <TextField label="Search" leadingIcon="search" value={q} onChange={(ev) => setQ(ev.target.value)} className="medium:w-72" />
        <ButtonGroup label="Status" size="xs" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "submitted", label: "Submitted" }, { value: "draft", label: "Drafts" }]} />
        <div className="flex gap-2">
          {(["pending", "eligible", "ineligible"] as const).map((x) => (
            <Chip key={x} selected={elig === x} onClick={() => setElig(elig === x ? "" : x)}>
              {x}
            </Chip>
          ))}
        </div>
        <div className="flex-1" />
        <LinkButton to={`/api/events/${e.id}/exports/submissions.csv`} download variant="outlined" icon="download">
          CSV
        </LinkButton>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="assignment" title="No submissions match" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface-container-low">
          <table className="w-full min-w-[820px] text-left">
            <caption className="sr-only">Submissions</caption>
            <thead>
              <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
                <th scope="col" className="px-4 py-3">Project</th>
                <th scope="col" className="px-4 py-3">Track</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Eligibility</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-outline-variant/60 last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/e/${e.slug}/p/${s.id}`} className="type-title-sm text-on-surface hover:text-primary">
                      {s.title || "Untitled"}
                    </Link>
                    <p className="type-body-sm text-on-surface-variant">
                      {s.teamName} · {s.members.length} member{s.members.length === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-4 py-3 type-body-md text-on-surface-variant">{s.trackName ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.status === "submitted" ? (
                      <div>
                        <Pill tone="success" icon="check_circle">Submitted</Pill>
                        <p className="mt-1 font-mono type-body-sm text-on-surface-variant">{formatUtc(s.submittedAt)}</p>
                      </div>
                    ) : (
                      <Pill tone="neutral" icon="edit">Draft</Pill>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={ELIG_TONE[s.eligibility]}>{s.eligibility}</Pill>
                    {s.eligibilityNote ? <p className="mt-1 max-w-56 truncate type-body-sm text-on-surface-variant" title={s.eligibilityNote}>{s.eligibilityNote}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton icon="check_circle" label="Mark eligible" onClick={() => setEligDialog({ sub: s, to: "eligible", note: "" })} />
                      <IconButton icon="block" label="Mark ineligible" onClick={() => setEligDialog({ sub: s, to: "ineligible", note: "" })} />
                      <IconButton icon="timer" label="Deadline extension" onClick={() => setExtDialog({ sub: s, until: toLocalInput(new Date(Date.parse(e.submissionDeadline) + 3_600_000).toISOString()), reason: "" })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={eligDialog !== null}
        onClose={() => setEligDialog(null)}
        title={eligDialog?.to === "ineligible" ? "Mark ineligible?" : "Mark eligible?"}
        icon={eligDialog?.to === "ineligible" ? "block" : "check_circle"}
        actions={
          <>
            <Button variant="text" onClick={() => setEligDialog(null)}>Cancel</Button>
            <Button variant={eligDialog?.to === "ineligible" ? "danger" : "filled"} loading={setEligibility.isPending} onClick={() => eligDialog && setEligibility.mutate({ id: eligDialog.sub.id, eligibility: eligDialog.to, note: eligDialog.note })}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="mb-3">
          {eligDialog?.to === "ineligible" ? "Ineligible projects are hidden from the gallery and removed from judging queues (submitted ballots are kept)." : "Eligible projects can be routed to judges."}
        </p>
        <TextField label="Reason (shown to organizers)" value={eligDialog?.note ?? ""} onChange={(ev) => eligDialog && setEligDialog({ ...eligDialog, note: ev.target.value })} />
      </Dialog>

      <Dialog
        open={extDialog !== null}
        onClose={() => setExtDialog(null)}
        title={`Extension for ${extDialog?.sub.teamName ?? ""}`}
        icon="timer"
        actions={
          <>
            <Button variant="text" onClick={() => setExtDialog(null)}>Cancel</Button>
            <Button variant="text" onClick={() => extDialog && extend.mutate({ teamId: extDialog.sub.teamId, until: null, reason: extDialog.reason || "Extension cleared" })}>
              Clear
            </Button>
            <Button loading={extend.isPending} disabled={(extDialog?.reason.trim().length ?? 0) < 3} onClick={() => extDialog && extend.mutate({ teamId: extDialog.sub.teamId, until: fromLocalInput(extDialog.until), reason: extDialog.reason })}>
              Grant
            </Button>
          </>
        }
      >
        <p className="mb-3">Moves the hard deadline for this team only. The reason and both times are recorded in the audit trail.</p>
        <div className="flex flex-col gap-3">
          <TextField label="Extend until" type="datetime-local" value={extDialog?.until ?? ""} onChange={(ev) => extDialog && setExtDialog({ ...extDialog, until: ev.target.value })} supporting={utcHint(extDialog?.until ?? "")} />
          <TextField label="Reason" value={extDialog?.reason ?? ""} onChange={(ev) => extDialog && setExtDialog({ ...extDialog, reason: ev.target.value })} supporting="e.g. power outage verified by organizers" />
        </div>
      </Dialog>
    </div>
  );
}
