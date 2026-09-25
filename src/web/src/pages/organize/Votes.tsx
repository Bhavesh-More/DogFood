import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarList } from "../../components/charts/Charts";
import { errorMessage, get, patch } from "../../lib/api";
import { relativeTime } from "../../lib/time";
import { Banner, Button, Card, Chip, Dialog, EmptyState, IconButton, LinkButton, PageLoader, Pill, SectionHeader, Select, TextField, useToast } from "../../ui";
import { useOrganize } from "./common";

interface Summary {
  mode: string;
  style: string;
  tallies: { submissionId: string; title: string; counted: number; flagged: number; voters: number }[];
}
interface VoteRow {
  id: string;
  submissionId: string;
  title: string;
  voter: string;
  ipHash: string;
  votes: number;
  status: "counted" | "flagged" | "rejected";
  flagReason: string | null;
  createdAt: string;
  votersOnIp: number;
}

export function VotesPage() {
  const { event: e } = useOrganize();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<"" | "counted" | "flagged" | "rejected">("flagged");
  const [override, setOverride] = useState<{ vote: VoteRow; to: VoteRow["status"]; reason: string } | null>(null);
  const summary = useQuery({ queryKey: ["vote-summary", e.id], queryFn: () => get<Summary>(`/api/events/${e.id}/votes/summary`), enabled: e.votingMode !== "off" });
  const votes = useQuery({ queryKey: ["org-votes", e.id, status], queryFn: () => get<VoteRow[]>(`/api/events/${e.id}/votes`, { status: status || undefined }), enabled: e.votingMode !== "off" });
  const save = useMutation({
    mutationFn: () => patch(`/api/votes/${override!.vote.id}`, { status: override!.to, reason: override!.reason }),
    onSuccess: () => {
      setOverride(null);
      qc.invalidateQueries({ queryKey: ["org-votes", e.id] });
      qc.invalidateQueries({ queryKey: ["vote-summary", e.id] });
      toast.success("Vote updated (audit-logged)");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (e.votingMode === "off") {
    return <EmptyState icon="how_to_vote" title="Community voting is off" body="Enable it in Settings: open link, email-gated or signed-in voting." action={<LinkButton to="../settings">Settings</LinkButton>} />;
  }
  if (summary.isPending) return <PageLoader label="Loading votes" />;
  const tallies = summary.data?.tallies ?? [];
  const flaggedTotal = tallies.reduce((a, t) => a + t.flagged, 0);
  return (
    <div className="flex flex-col gap-6">
      <Banner tone="info" icon="visibility_off" title="Tallies are hidden from the public until voting closes">
        Mode: <strong>{e.votingMode}</strong> · style: <strong>{e.votingStyle}</strong> · budget {e.quadraticCredits}. Duplicate detection is per voter identity (device cookie,
        verified email or account); more than 3 distinct voters behind one IP are recorded as flagged and not counted.
      </Banner>
      <div className="grid gap-6 expanded:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card variant="filled" radius="2xl">
          <SectionHeader title="Counted votes" subtitle={`${tallies.reduce((a, t) => a + t.voters, 0)} voter-project pairs · ${flaggedTotal} flagged votes excluded`} level={3} action={<LinkButton to={`/api/events/${e.id}/exports/votes.csv`} download variant="text" icon="download">CSV</LinkButton>} />
          <BarList
            ariaLabel="Counted community votes per project"
            data={tallies.slice(0, 15).map((t) => ({ key: t.submissionId, label: t.title, value: t.counted, hint: t.flagged ? `${t.flagged} flagged (excluded)` : undefined }))}
          />
        </Card>
        <Card variant="filled" radius="2xl">
          <SectionHeader title="Vote log" level={3} />
          <div className="mb-3 flex flex-wrap gap-2">
            {(["flagged", "counted", "rejected", ""] as const).map((s) => (
              <Chip key={s || "all"} selected={status === s} onClick={() => setStatus(s)}>
                {s || "all"}
              </Chip>
            ))}
          </div>
          {votes.isPending ? (
            <PageLoader />
          ) : votes.data?.length ? (
            <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
              {votes.data.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-title-sm text-on-surface">{v.title}</p>
                    <p className="type-body-sm text-on-surface-variant">
                      <span className="font-mono">{v.voter}</span> · ip <span className="font-mono">{v.ipHash}</span> ({v.votersOnIp} voters) · {relativeTime(v.createdAt)}
                    </p>
                    {v.flagReason ? <p className="type-body-sm text-error">{v.flagReason}</p> : null}
                  </div>
                  <Pill tone={v.status === "counted" ? "success" : v.status === "flagged" ? "warning" : "error"}>{v.status}</Pill>
                  <IconButton icon="edit" label="Override" onClick={() => setOverride({ vote: v, to: v.status === "counted" ? "rejected" : "counted", reason: "" })} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="how_to_vote" title="Nothing here" className="py-6" />
          )}
        </Card>
      </div>
      <Dialog
        open={override !== null}
        onClose={() => setOverride(null)}
        title="Override vote status"
        icon="gavel"
        actions={
          <>
            <Button variant="text" onClick={() => setOverride(null)}>Cancel</Button>
            <Button disabled={(override?.reason.trim().length ?? 0) < 3} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </>
        }
      >
        {override ? (
          <div className="flex flex-col gap-3">
            <Select label="New status" value={override.to} onChange={(ev) => setOverride({ ...override, to: ev.target.value as VoteRow["status"] })} options={["counted", "flagged", "rejected"].map((s) => ({ value: s, label: s }))} />
            <TextField label="Reason (recorded in the audit trail)" value={override.reason} onChange={(ev) => setOverride({ ...override, reason: ev.target.value })} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
