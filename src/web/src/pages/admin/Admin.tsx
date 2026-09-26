import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router";
import { CAPABILITIES, ROLE_LABEL, ROLES, type Capability, type Role } from "@dogfood/core";
import { errorMessage, get, patch } from "../../lib/api";
import { useSession } from "../../lib/session";
import { formatDateTime, relativeTime } from "../../lib/time";
import { Avatar, Card, EmptyState, Icon, PageLoader, RoleBadge, SectionHeader, Select, StatTile, Switch, Tabs, TextField, useToast } from "../../ui";
import { AuditTable } from "../organize/Audit";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  disabledAt: string | null;
}
interface Stats {
  usersByRole: Record<string, number>;
  events: number;
  teams: number;
  submissions: number;
  votes: number;
  auditEntries: number;
  roleMatrix: { role: Role; capabilities: Record<Capability, boolean> }[];
}

function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useSession();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => get<UserRow[]>("/api/admin/users", { q }) });
  const role = useMutation({
    mutationFn: (v: { id: string; role: Role }) => patch(`/api/admin/users/${v.id}/role`, { role: v.role }),
    onSuccess: () => {
      toast.success("Role changed — their sessions were signed out");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const status = useMutation({
    mutationFn: (v: { id: string; disabled: boolean }) => patch(`/api/admin/users/${v.id}/status`, { disabled: v.disabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <div className="flex flex-col gap-4">
      <TextField label="Search users" leadingIcon="search" value={q} onChange={(ev) => setQ(ev.target.value)} className="max-w-md" />
      <div className="overflow-x-auto rounded-xl bg-surface-container-low">
        <table className="w-full min-w-[720px] text-left">
          <caption className="sr-only">Users</caption>
          <thead>
            <tr className="border-b border-outline-variant type-label-lg text-on-surface-variant">
              <th scope="col" className="px-4 py-3">User</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3">Joined</th>
              <th scope="col" className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-b border-outline-variant/60 last:border-0">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} size={36} />
                    <div>
                      <p className="type-title-sm text-on-surface">{u.name}</p>
                      <p className="type-body-sm text-on-surface-variant">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Select
                    label="Role"
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(ev) => role.mutate({ id: u.id, role: ev.target.value as Role })}
                    options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                    className="w-44"
                  />
                </td>
                <td className="px-4 py-2 type-body-sm text-on-surface-variant">{relativeTime(u.createdAt)}</td>
                <td className="px-4 py-2">
                  <Switch label="" checked={!u.disabledAt} disabled={u.id === me?.id} onChange={(v) => status.mutate({ id: u.id, disabled: !v })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Outbox() {
  const q = useQuery({ queryKey: ["outbox"], queryFn: () => get<{ id: string; to: string; subject: string; body: string; createdAt: string }[]>("/api/admin/outbox"), refetchInterval: 5000 });
  if (q.isPending) return <PageLoader />;
  if (!q.data?.length) return <EmptyState icon="mail" title="Outbox is empty" body="Email-gated voting codes appear here. The platform never contacts an external email service." />;
  return (
    <ul className="flex flex-col gap-2">
      {q.data.map((m) => (
        <li key={m.id} className="rounded-lg bg-surface-container-low p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-title-sm text-on-surface">{m.subject}</p>
            <span className="type-body-sm text-on-surface-variant">{formatDateTime(m.createdAt)}</span>
          </div>
          <p className="type-body-sm text-on-surface-variant">to {m.to}</p>
          <p className="mt-2 font-mono type-body-md text-on-surface">{m.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function AdminPage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<"overview" | "users" | "audit" | "outbox">("overview");
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => get<Stats>("/api/admin/stats"), enabled: user?.role === "admin" });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== "admin") return <EmptyState icon="block" title="Admins only" />;
  return (
    <div className="animate-enter">
      <header className="py-6">
        <h1 className="type-display-sm type-emphasized text-on-surface">Administration</h1>
        <p className="mt-2 type-body-lg text-on-surface-variant">Accounts, roles, the platform-wide audit trail and the local mail outbox.</p>
      </header>
      <Tabs
        label="Admin sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview", icon: "dashboard" },
          { value: "users", label: "Users & roles", icon: "groups" },
          { value: "audit", label: "Audit trail", icon: "receipt_long" },
          { value: "outbox", label: "Mail outbox", icon: "mail" },
        ]}
      />
      <div className="py-6">
        {tab === "overview" ? (
          stats.isPending ? (
            <PageLoader />
          ) : stats.data ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 expanded:grid-cols-5">
                <StatTile label="Events" value={stats.data.events} icon="event" />
                <StatTile label="Teams" value={stats.data.teams} icon="groups" tone="secondary" />
                <StatTile label="Submissions" value={stats.data.submissions} icon="rocket_launch" tone="tertiary" />
                <StatTile label="Votes" value={stats.data.votes} icon="how_to_vote" tone="success" />
                <StatTile label="Audit entries" value={stats.data.auditEntries} icon="receipt_long" tone="warning" />
              </div>
              <Card variant="filled" radius="2xl">
                <SectionHeader title="Role matrix" subtitle="Enforced by the API on every request; the UI only mirrors it." level={3} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <caption className="sr-only">Capabilities per role</caption>
                    <thead>
                      <tr className="border-b border-outline-variant type-label-md text-on-surface-variant">
                        <th scope="col" className="py-2 pr-3">Role</th>
                        {CAPABILITIES.map((c) => (
                          <th key={c} scope="col" className="px-1 py-2 text-center font-mono">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.data.roleMatrix.map((row) => (
                        <tr key={row.role} className="border-b border-outline-variant/60 last:border-0">
                          <th scope="row" className="py-2 pr-3 text-left">
                            <RoleBadge role={row.role} />{" "}
                            <span className="type-body-sm text-on-surface-variant">({stats.data!.usersByRole[row.role] ?? 0})</span>
                          </th>
                          {CAPABILITIES.map((c) => (
                            <td key={c} className="px-1 py-2 text-center">
                              {row.capabilities[c] ? <Icon name="check_circle" filled size={18} className="inline text-success" title="allowed" /> : <Icon name="remove" size={18} className="inline text-outline" title="denied" />}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="flex items-start gap-2 type-body-md text-on-surface-variant">
                <Icon name="cloud_off" size={18} className="mt-0.5 shrink-0" />
                Offline deployment · no telemetry · no external services
              </p>
            </div>
          ) : null
        ) : tab === "users" ? (
          <Users />
        ) : tab === "audit" ? (
          <AuditTable endpoint="/api/audit" />
        ) : (
          <Outbox />
        )}
      </div>
    </div>
  );
}
