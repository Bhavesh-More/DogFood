import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AuditEntryDto, Paginated } from "@dogfood/core";
import { get } from "../../lib/api";
import { formatDateTime } from "../../lib/time";
import { Avatar, Banner, Button, Chip, EmptyState, Icon, LinkButton, PageLoader, TextField } from "../../ui";
import { useOrganize } from "./common";

interface AuditResponse extends Paginated<AuditEntryDto> {
  actions: string[];
}

export function AuditTable({ endpoint, csvHref }: { endpoint: string; csvHref?: string }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const pickAction = (a: string) => {
    setAction(a);
    setPage(1);
  };
  const log = useQuery({
    queryKey: ["audit", endpoint, dq, action, page],
    queryFn: () => get<AuditResponse>(endpoint, { q: dq, action, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  const verify = useQuery({ queryKey: ["audit-verify"], queryFn: () => get<{ valid: boolean; entries: number; headHash: string | null; problems: { seq: number; problem: string }[] }>("/api/audit/verify") });
  const families = [...new Set((log.data?.actions ?? []).map((a) => a.split(".")[0]!))];
  return (
    <div className="flex flex-col gap-4">
      {verify.data ? (
        <Banner tone={verify.data.valid ? "success" : "error"} icon={verify.data.valid ? "verified" : "gpp_maybe"} title={verify.data.valid ? "Hash chain intact" : "Hash chain broken"}>
          {verify.data.entries} entries · head <span className="font-mono">{verify.data.headHash?.slice(0, 16)}…</span>
          {verify.data.problems.length ? ` · problems at seq ${verify.data.problems.map((p) => p.seq).join(", ")}` : " · every row's SHA-256 links to the previous one"}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-3 medium:flex-row medium:items-center">
        <TextField label="Search summaries and people" leadingIcon="search" value={q} onChange={(ev) => setQ(ev.target.value)} className="medium:w-80" />
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          <Chip selected={!action} onClick={() => pickAction("")}>all</Chip>
          {families.map((f) => (
            <Chip key={f} selected={action === f} onClick={() => pickAction(action === f ? "" : f)}>
              {f}
            </Chip>
          ))}
        </div>
        <div className="flex-1" />
        {csvHref ? <LinkButton to={csvHref} download variant="outlined" icon="download">CSV</LinkButton> : null}
      </div>
      {log.isPending ? (
        <PageLoader />
      ) : log.data?.items.length ? (
        <>
          <ol className={log.isFetching ? "flex flex-col gap-2 opacity-70" : "flex flex-col gap-2"}>
            {log.data.items.map((a) => (
              <li key={a.id} className="flex gap-3 rounded-lg bg-surface-container-low p-3">
                {a.actorName ? <Avatar name={a.actorName} size={36} /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-container-highest"><Icon name="settings" size={18} className="text-on-surface-variant" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="type-body-md text-on-surface">{a.summary}</p>
                  <p className="type-body-sm text-on-surface-variant">
                    <span className="font-mono">{a.action}</span> · {a.actorName ?? "system"} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <span className="hidden shrink-0 font-mono type-label-sm text-on-surface-variant medium:block" title={a.hash}>
                  #{a.id} · {a.hash.slice(0, 8)}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between">
            <span className="type-body-sm text-on-surface-variant">
              {log.data.total} entries · page {page} of {Math.max(1, Math.ceil(log.data.total / 50))}
            </span>
            <div className="flex gap-2">
              <Button variant="outlined" size="xs" icon="chevron_left" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
              <Button variant="outlined" size="xs" trailingIcon="chevron_right" disabled={page * 50 >= log.data.total} onClick={() => setPage((p) => p + 1)}>Older</Button>
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon="receipt_long" title="No audit entries match" />
      )}
    </div>
  );
}

export function AuditPage() {
  const { event: e } = useOrganize();
  return <AuditTable endpoint={`/api/events/${e.id}/audit`} csvHref={`/api/events/${e.id}/exports/audit.csv`} />;
}
