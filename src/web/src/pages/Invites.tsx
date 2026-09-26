import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { errorMessage, get, post } from "../lib/api";
import { useSession } from "../lib/session";
import { formatDateTime } from "../lib/time";
import { Banner, Button, Card, ErrorState, LinkButton, PageLoader, Pill, Shape, Icon } from "../ui";

const STATUS_COPY: Record<string, { tone: "success" | "error" | "warning"; text: string }> = {
  valid: { tone: "success", text: "Valid invitation" },
  used: { tone: "error", text: "Already used — invite links work once" },
  expired: { tone: "error", text: "Expired" },
  revoked: { tone: "error", text: "Revoked by the sender" },
  full: { tone: "warning", text: "Team is full" },
};

function InviteFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-10 animate-enter">
      <Card variant="elevated" radius="2xl" className="flex flex-col items-center gap-4 text-center">
        <Shape name="clover8" className="h-24 w-24 text-primary-container">
          <Icon name="group_add" size={40} className="text-on-primary-container" />
        </Shape>
        <h1 className="type-headline-md text-on-surface">{title}</h1>
        {children}
      </Card>
    </div>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const { user, role } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["invite", token],
    queryFn: () =>
      get<{ status: string; expiresAt: string; team: { name: string; memberCount: number; maxSize: number }; event: { slug: string; name: string } }>(`/api/invites/${token}`),
  });
  const accept = useMutation({
    mutationFn: () => post(`/api/invites/${token}/accept`),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate(`/e/${preview.data!.event.slug}/team`);
    },
  });
  if (preview.isPending) return <PageLoader label="Checking invite" />;
  if (preview.error) return <ErrorState error={preview.error} />;
  const p = preview.data;
  const s = STATUS_COPY[p.status] ?? STATUS_COPY.valid!;
  return (
    <InviteFrame title={`Join “${p.team.name}”`}>
      <p className="type-body-lg text-on-surface-variant">
        for <strong className="text-on-surface">{p.event.name}</strong> · {p.team.memberCount}/{p.team.maxSize} members
      </p>
      <Pill tone={s.tone}>{s.text}</Pill>
      <p className="type-body-sm text-on-surface-variant">Expires {formatDateTime(p.expiresAt)}</p>
      {accept.error ? <Banner tone="error">{errorMessage(accept.error)}</Banner> : null}
      {p.status !== "valid" ? null : !user ? (
        <LinkButton to={`/login?next=/invite/${token}`} size="md" icon="login">
          Sign in to accept
        </LinkButton>
      ) : role !== "participant" ? (
        <Banner tone="warning">Only participant accounts can join teams (you are signed in as {role}).</Banner>
      ) : (
        <Button size="md" icon="check" loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept & join team
        </Button>
      )}
    </InviteFrame>
  );
}

export function JudgeInvitePage() {
  const { token } = useParams();
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["judge-invite", token],
    queryFn: () => get<{ status: string; expiresAt: string; note: string; tracks: string[]; event: { slug: string; name: string } }>(`/api/judge-invites/${token}`),
  });
  const accept = useMutation({
    mutationFn: () => post<{ slug: string }>(`/api/judge-invites/${token}/accept`),
    onSuccess: async (r) => {
      await refresh();
      qc.invalidateQueries();
      navigate(`/judge/${r.slug}`);
    },
  });
  if (preview.isPending) return <PageLoader label="Checking invitation" />;
  if (preview.error) return <ErrorState error={preview.error} />;
  const p = preview.data;
  const s = STATUS_COPY[p.status] ?? STATUS_COPY.valid!;
  return (
    <InviteFrame title={`Judge ${p.event.name}`}>
      {p.note ? <p className="type-body-md text-on-surface-variant">{p.note}</p> : null}
      <Pill tone={s.tone}>{s.text}</Pill>
      <p className="type-body-md text-on-surface-variant">{p.tracks.length ? `Scope: ${p.tracks.join(", ")}` : "Scope: all tracks"}</p>
      <Banner tone="info" className="text-left">
        Judges see only their assigned projects and their own ballots. Accepting switches a participant account to the judge role.
      </Banner>
      {accept.error ? <Banner tone="error">{errorMessage(accept.error)}</Banner> : null}
      {p.status !== "valid" ? null : !user ? (
        <LinkButton to={`/login?next=/judge-invite/${token}`} size="md" icon="login">
          Sign in to accept
        </LinkButton>
      ) : (
        <Button size="md" icon="gavel" loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept invitation
        </Button>
      )}
    </InviteFrame>
  );
}
