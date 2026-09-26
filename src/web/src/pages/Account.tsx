import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router";
import { errorMessage, get, post, del } from "../lib/api";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
import { formatDate, relativeTime } from "../lib/time";
import { Avatar, Banner, Button, ButtonGroup, Card, EmptyState, IconButton, PageLoader, RoleBadge, SectionHeader, TextField, useToast } from "../ui";

interface TokenRow {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

export function AccountPage() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [theme, , setTheme] = useTheme();
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => get<TokenRow[]>("/api/auth/tokens"), enabled: Boolean(user) });
  const create = useMutation({
    mutationFn: () => post<{ token: string }>("/api/auth/tokens", { label, expiresInDays: 90 }),
    onSuccess: (r) => {
      setFresh(r.token);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/api/auth/tokens/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens"] }) });
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/settings" replace />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6 animate-enter">
      <Card variant="filled" radius="2xl" className="flex items-center gap-4">
        <Avatar name={user.name} size={64} />
        <div>
          <h1 className="type-headline-sm text-on-surface">{user.name}</h1>
          <p className="type-body-md text-on-surface-variant">{user.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <RoleBadge role={user.role} />
            <span className="type-body-sm text-on-surface-variant">since {formatDate(user.createdAt)}</span>
          </div>
        </div>
      </Card>
      <Card variant="filled" radius="2xl">
        <SectionHeader title="Appearance" level={3} />
        <ButtonGroup label="Theme" value={theme} onChange={setTheme} options={[{ value: "light", label: "Light", icon: "light_mode" }, { value: "dark", label: "Dark", icon: "dark_mode" }]} />
      </Card>
      <Card variant="filled" radius="2xl">
        <SectionHeader title="API tokens" subtitle="Personal tokens act as you on the REST API (Authorization: Bearer …). Shown once; stored hashed." level={3} />
        <div className="flex flex-col gap-3 medium:flex-row medium:items-start">
          <TextField label="Token label" value={label} onChange={(ev) => setLabel(ev.target.value)} className="flex-1" supporting="e.g. results-bot" />
          <Button icon="key" loading={create.isPending} disabled={!label.trim()} onClick={() => create.mutate()} className="medium:mt-2">
            Create token
          </Button>
        </div>
        {fresh ? (
          <Banner tone="success" icon="key" title="Copy your token now" className="mt-4" action={<IconButton icon="content_copy" label="Copy token" onClick={() => navigator.clipboard?.writeText(fresh).then(() => toast.success("Copied"))} />}>
            <code className="break-all font-mono">{fresh}</code>
          </Banner>
        ) : null}
        <div className="mt-4">
          {tokens.data?.length ? (
            <ul className="divide-y divide-outline-variant">
              {tokens.data.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-3">
                  <div>
                    <p className="type-title-sm text-on-surface">{t.label}</p>
                    <p className="type-body-sm text-on-surface-variant">
                      expires {formatDate(t.expiresAt)} · {t.lastUsedAt ? `last used ${relativeTime(t.lastUsedAt)}` : "never used"}
                    </p>
                  </div>
                  <Button variant="text" size="xs" onClick={() => revoke.mutate(t.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="key" title="No tokens" className="py-6" />
          )}
        </div>
      </Card>
    </div>
  );
}
