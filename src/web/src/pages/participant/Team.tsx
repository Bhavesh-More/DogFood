import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { isBeforeDeadline, type InviteDto } from "@dogfood/core";
import { Countdown } from "../../components/Countdown";
import { JoinRequestsCard, RecruitingCard, TeamFinderBoard } from "../../components/TeamFinder";
import { errorMessage, get, post, del } from "../../lib/api";
import { keys, useEvent, useMyTeam } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { formatDateTime, relativeTime, useServerNow } from "../../lib/time";
import { Avatar, Banner, Button, Card, Dialog, EmptyState, ErrorState, Icon, IconButton, LinkButton, PageLoader, Pill, TextField, useToast } from "../../ui";

interface InviteRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  usedBy: string | null;
}

export function TeamPage() {
  const { slug } = useParams();
  const { user, role, loading } = useSession();
  const event = useEvent(slug);
  const team = useMyTeam(event.data?.id, Boolean(user));
  const qc = useQueryClient();
  const toast = useToast();
  const now = useServerNow(5000);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<InviteDto | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const invites = useQuery({
    queryKey: ["invites", team.data?.id],
    queryFn: () => get<InviteRow[]>(`/api/teams/${team.data!.id}/invites`),
    enabled: Boolean(team.data),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.myTeam(event.data!.id) });
    qc.invalidateQueries({ queryKey: keys.event(slug!) });
    qc.invalidateQueries({ queryKey: ["invites"] });
  };
  const create = useMutation({
    mutationFn: () => post(`/api/events/${event.data!.id}/teams`, { name }),
    onSuccess: () => {
      toast.success("Team created — invite your teammates.");
      refresh();
    },
  });
  const invite = useMutation({
    mutationFn: () => post<InviteDto>(`/api/teams/${team.data!.id}/invites`),
    onSuccess: (i) => {
      setFresh(i);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/teams/${team.data!.id}/invites/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const leave = useMutation({
    mutationFn: () => post(`/api/teams/${team.data!.id}/leave`),
    onSuccess: () => {
      setConfirmLeave(false);
      toast.show("You left the team.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => del(`/api/teams/${team.data!.id}/members/${userId}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (loading || event.isPending) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=/e/${slug}/team`} replace />;
  if (event.error) return <ErrorState error={event.error} />;
  const e = event.data;
  const t = team.data;
  const open = isBeforeDeadline(e.submissionDeadline, now, t?.deadlineExtensionUntil);
  const me = t?.members.find((m) => m.userId === user.id);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-5xl animate-enter">
      <header className="flex flex-wrap items-end justify-between gap-4 py-6">
        <div>
          <Link to={`/e/${e.slug}`} className="inline-flex items-center gap-1 type-label-lg text-primary hover:underline">
            <Icon name="arrow_back" size={18} /> {e.name}
          </Link>
          <h1 className="mt-2 type-display-sm type-emphasized text-on-surface">{t ? t.name : "Your team"}</h1>
        </div>
        {t ? <LinkButton to={`/e/${e.slug}/submit`} icon="edit" size="md">Submission</LinkButton> : null}
      </header>

      {!open ? (
        <Banner tone="error" icon="lock" title="Teams are locked" className="mb-6">
          The submission deadline has passed (server time). Rosters can no longer change.
        </Banner>
      ) : null}

      {role !== "participant" ? (
        <Banner tone="warning">Teams are for participant accounts. You are signed in as {role}.</Banner>
      ) : team.isPending ? (
        <PageLoader />
      ) : !t ? (
        <div className="grid grid-cols-1 gap-6 medium:grid-cols-2">
          <Card variant="primary" radius="2xl">
            <h2 className="type-headline-sm">Start a team</h2>
            <p className="mt-1 type-body-md opacity-90">You'll be captain. Up to {e.maxTeamSize} people per team; one team per person.</p>
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <TextField label="Team name" value={name} onChange={(ev) => setName(ev.target.value)} required minLength={2} maxLength={60} disabled={!open} />
              {create.error ? <Banner tone="error">{errorMessage(create.error)}</Banner> : null}
              <Button type="submit" size="md" icon="group_add" loading={create.isPending} disabled={!open || name.trim().length < 2}>
                Create team
              </Button>
            </form>
          </Card>
          <Card variant="filled" radius="2xl">
            <h2 className="type-headline-sm text-on-surface">Joining someone?</h2>
            <p className="mt-2 type-body-md text-on-surface-variant">
              Ask your captain for an invite link. Links are <strong>single-use</strong> and <strong>expire after 72 hours</strong> — each teammate needs their own.
            </p>
            <div className="mt-5">
              <Countdown target={e.submissionDeadline} label="Teams lock at the deadline" />
            </div>
          </Card>
          <div className="medium:col-span-2">
            <TeamFinderBoard eventId={e.id} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 expanded:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col gap-6">
            {open && me?.role === "captain" ? <JoinRequestsCard eventId={e.id} teamId={t.id} /> : null}
            <Card variant="filled" radius="2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="type-title-lg text-on-surface">Roster</h2>
                <Pill tone={t.members.length >= t.maxSize ? "warning" : "secondary"} icon="groups">
                  {t.members.length}/{t.maxSize}
                </Pill>
              </div>
              <ul className="flex flex-col gap-3">
                {t.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                    <Avatar name={m.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="type-title-sm text-on-surface">
                        {m.name} {m.userId === user.id ? <span className="text-on-surface-variant">(you)</span> : null}
                      </p>
                      <p className="type-body-sm text-on-surface-variant">Joined {relativeTime(m.joinedAt)}</p>
                    </div>
                    {m.role === "captain" ? <Pill tone="primary" icon="star">Captain</Pill> : null}
                    {me?.role === "captain" && m.userId !== user.id && open ? (
                      <IconButton icon="person_off" label={`Remove ${m.name}`} onClick={() => removeMember.mutate(m.userId)} />
                    ) : null}
                  </li>
                ))}
              </ul>
              {open ? (
                <div className="mt-4 flex justify-end">
                  <Button variant="text" icon="logout" onClick={() => setConfirmLeave(true)}>
                    Leave team
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card variant="outlined" radius="2xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="type-title-lg text-on-surface">Invite links</h2>
                  <p className="type-body-sm text-on-surface-variant">Single-use · expire after 72h · stored hashed</p>
                </div>
                <Button icon="add_link" loading={invite.isPending} disabled={!open || t.members.length >= t.maxSize} onClick={() => invite.mutate()}>
                  New link
                </Button>
              </div>
              {fresh ? (
                <div className="mb-4 rounded-lg bg-primary-container p-4 text-on-primary-container animate-pop">
                  <p className="type-label-lg">Copy this now — it won't be shown again</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-sm bg-surface px-3 py-2 font-mono type-body-sm text-on-surface">{fresh.url}</code>
                    <IconButton
                      icon="content_copy"
                      label="Copy invite link"
                      variant="filled"
                      onClick={() => {
                        navigator.clipboard?.writeText(fresh.url).then(() => toast.success("Link copied"), () => toast.error("Copy failed — select the text instead"));
                      }}
                    />
                  </div>
                </div>
              ) : null}
              {invites.data?.length ? (
                <ul className="divide-y divide-outline-variant">
                  {invites.data.map((i) => {
                    const expired = Date.parse(i.expiresAt) <= now;
                    const status = i.revokedAt ? "Revoked" : i.usedAt ? `Used by ${i.usedBy ?? "someone"}` : expired ? "Expired" : `Expires ${relativeTime(i.expiresAt)}`;
                    return (
                      <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                        <div>
                          <p className="font-mono type-body-sm text-on-surface">{i.id}</p>
                          <p className="type-body-sm text-on-surface-variant">
                            {status} · created {formatDateTime(i.createdAt)}
                          </p>
                        </div>
                        {!i.usedAt && !i.revokedAt && !expired ? <Button variant="text" size="xs" onClick={() => revoke.mutate(i.id)}>Revoke</Button> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon="link" title="No invite links yet" className="py-6" />
              )}
            </Card>
            {open ? <TeamFinderBoard eventId={e.id} showTeams={false} /> : null}
          </section>
          <aside className="flex flex-col gap-4">
            {open ? <RecruitingCard key={t.lookingFor ?? ""} team={t} /> : null}
            <Card variant="elevated" radius="2xl">
              <Countdown target={t.deadlineExtensionUntil && t.deadlineExtensionUntil > e.submissionDeadline ? t.deadlineExtensionUntil : e.submissionDeadline} label="Submission deadline" />
              {t.deadlineExtensionUntil ? <p className="mt-2 type-body-sm text-on-surface-variant">Your team has an organizer-granted extension.</p> : null}
            </Card>
            <Card variant="tonal" radius="2xl">
              <p className="type-title-md">Submission</p>
              <p className="mt-1 type-body-md opacity-90">{t.submissionId ? "Your draft is saved. Keep it up to date until the deadline." : "No draft yet — start one now."}</p>
              <LinkButton to={`/e/${e.slug}/submit`} className="mt-4" icon="edit">
                {t.submissionId ? "Open editor" : "Start submission"}
              </LinkButton>
            </Card>
          </aside>
        </div>
      )}
      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave this team?"
        icon="logout"
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmLeave(false)}>Stay</Button>
            <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>Leave</Button>
          </>
        }
      >
        If you're the last member, the team and its draft are dissolved. You'll need a new invite link to rejoin.
      </Dialog>
    </div>
  );
}
