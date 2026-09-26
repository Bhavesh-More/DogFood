import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { TeamDto, TeamFinderDto } from "@dogfood/core";
import { ApiError, del, errorMessage, get, post, put } from "../lib/api";
import { cx } from "../lib/format";
import { keys, useMyTeam } from "../lib/queries";
import { useSession } from "../lib/session";
import { relativeTime, useServerNow } from "../lib/time";
import { Avatar, Button, Card, EmptyState, Icon, Pill, TextArea, TextField, useToast } from "../ui";

const finderKey = (eventId: string) => ["team-finder", eventId] as const;

function useTeamFinder(eventId: string) {
  return useQuery({ queryKey: finderKey(eventId), queryFn: () => get<TeamFinderDto>(`/api/events/${eventId}/team-finder`) });
}

function Skills({ skills }: { skills: string[] }) {
  if (!skills.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
      {skills.map((s) => (
        <li key={s} className="rounded-sm bg-secondary-container px-2 py-0.5 font-mono type-label-md text-on-secondary-container">
          {s}
        </li>
      ))}
    </ul>
  );
}

/** Post yourself as looking for a team (or update / remove the post). */
function SeekerForm({ eventId, posted, initial }: { eventId: string; posted: boolean; initial?: { skills: string[]; note: string } }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [skillsText, setSkillsText] = useState(initial?.skills.join(", ") ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const refresh = () => qc.invalidateQueries({ queryKey: finderKey(eventId) });
  const save = useMutation({
    mutationFn: () =>
      put(`/api/events/${eventId}/team-finder/me`, {
        skills: skillsText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        note,
      }),
    onSuccess: () => {
      toast.success(posted ? "Your post is updated" : "You're on the board — teams can find you now");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/api/events/${eventId}/team-finder/me`),
    onSuccess: () => {
      toast.success("Removed from the board");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Look for a team">
      <TextField
        label="Skills (comma-separated)"
        value={skillsText}
        onChange={(ev) => setSkillsText(ev.target.value)}
        supporting="e.g. typescript, design, postgres · up to 8"
        error={Object.entries(errors).find(([k]) => k.startsWith("skills"))?.[1]}
      />
      <TextArea
        label="A line about you"
        rows={3}
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
        maxLength={500}
        counter={`${note.length}/500`}
        supporting="How teams can reach you (e.g. your handle on the event chat). Your email is never shown."
        error={errors.note}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon="person_search" loading={save.isPending}>
          {posted ? "Update my post" : "Post myself"}
        </Button>
        {posted ? (
          <Button variant="text" onClick={() => remove.mutate()} loading={remove.isPending}>
            Take me off the board
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** A team's "we're recruiting" switch and what they are looking for. */
export function RecruitingCard({ team }: { team: TeamDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(team.lookingFor ?? "");
  const full = team.members.length >= team.maxSize;
  const set = useMutation({
    mutationFn: (lookingFor: string | null) => put(`/api/teams/${team.id}/recruiting`, { lookingFor }),
    onSuccess: (_d, lookingFor) => {
      toast.success(lookingFor ? "Your team is listed in the team finder" : "No longer recruiting");
      qc.invalidateQueries({ queryKey: keys.myTeam(team.eventId) });
      qc.invalidateQueries({ queryKey: finderKey(team.eventId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Card variant="filled" radius="2xl" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="handshake" size={22} className="text-primary" />
        <h2 className="type-title-lg text-on-surface">Recruiting</h2>
        {team.lookingFor ? <Pill tone="success" icon="check">Listed</Pill> : null}
      </div>
      {full ? (
        <p className="type-body-md text-on-surface-variant">Your team is full ({team.maxSize} members).</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          aria-label="Recruiting"
          onSubmit={(ev) => {
            ev.preventDefault();
            set.mutate(text.trim());
          }}
        >
          <TextField label="What are you looking for?" value={text} onChange={(ev) => setText(ev.target.value)} maxLength={200} supporting="e.g. a designer who likes data viz" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" icon="campaign" loading={set.isPending && set.variables !== null} disabled={text.trim().length < 3}>
              {team.lookingFor ? "Update listing" : "List my team"}
            </Button>
            {team.lookingFor ? (
              <Button variant="text" onClick={() => set.mutate(null)} loading={set.isPending && set.variables === null}>
                Stop recruiting
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Card>
  );
}

/** People looking for a team and teams with open spots, for one event. */
export function TeamFinderBoard({ eventId, showTeams = true, showSeekers = true }: { eventId: string; showTeams?: boolean; showSeekers?: boolean }) {
  const q = useTeamFinder(eventId);
  const { user } = useSession();
  const team = useMyTeam(eventId, Boolean(user));
  const toast = useToast();
  const now = useServerNow(60_000);
  const invite = useMutation({
    mutationFn: (v: { teamId: string; userId: string; name: string }) =>
      post(`/api/teams/${v.teamId}/invitations`, { userId: v.userId }),
    onSuccess: (_d, v) => toast.success(`Invitation sent to ${v.name}`),
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (q.isPending || !q.data) return null;
  const { seekers, teams, me, open } = q.data;
  const mine = seekers.find((p) => p.userId === user?.id);
  const canInvite = open && Boolean(team.data) && team.data!.members.length < team.data!.maxSize;
  return (
    <section aria-labelledby="team-finder-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="person_search" size={24} className="text-primary" />
        <h2 id="team-finder-heading" className="type-title-lg text-on-surface">Team finder</h2>
        {!open ? <Pill tone="neutral" icon="lock">Closed at the deadline</Pill> : null}
      </div>
      {me.canPost || me.posted ? (
        <Card variant="outlined" radius="2xl">
          <p className="mb-3 type-title-md text-on-surface">{me.posted ? "Your post" : "Looking for teammates? Put yourself on the board"}</p>
          {/* Keyed so the form re-seeds from the saved post after each update. */}
          <SeekerForm key={mine?.updatedAt ?? "new"} eventId={eventId} posted={me.posted} initial={mine} />
        </Card>
      ) : null}
      <div className={cx("grid grid-cols-1 gap-4", showTeams && showSeekers && "expanded:grid-cols-2")}>
        {showTeams ? (
          <div className="min-w-0">
            <p className="mb-2 type-title-sm text-on-surface-variant">Teams with open spots ({teams.length})</p>
            {teams.length ? (
              <ul className="flex flex-col gap-2" aria-label="Teams recruiting">
                {teams.map((t) => (
                  <li key={t.teamId}>
                    <Card variant="filled" radius="lg" className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 type-title-md text-on-surface">{t.name}</p>
                        <Pill tone="secondary" icon="group_add">{t.openSpots} open</Pill>
                      </div>
                      <p className="type-body-md text-on-surface">{t.lookingFor}</p>
                      <p className="type-body-sm text-on-surface-variant">{t.members.join(", ")} · ask the captain for an invite link</p>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="groups" title="No teams recruiting yet" className="py-4" />
            )}
          </div>
        ) : null}
        {showSeekers ? (
          <div className="min-w-0">
            <p className="mb-2 type-title-sm text-on-surface-variant">People looking for a team ({seekers.length})</p>
            {seekers.length ? (
              <ul className="flex flex-col gap-2" aria-label="People looking for a team">
                {seekers.map((p) => (
                  <li key={p.userId}>
                    <Card variant="filled" radius="lg" className="flex gap-3">
                      <Avatar name={p.name} size={40} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="type-title-sm text-on-surface">
                            {p.name} <span className="type-body-sm text-on-surface-variant">· {relativeTime(p.updatedAt, now)}</span>
                          </p>
                          {canInvite ? (
                            <Button
                              size="xs"
                              icon="person_add"
                              loading={invite.isPending && invite.variables?.name === p.name}
                              disabled={invite.isPending}
                              onClick={() => invite.mutate({ teamId: team.data!.id, userId: p.userId, name: p.name })}
                            >
                              Invite
                            </Button>
                          ) : null}
                        </div>
                        {p.note ? <p className="whitespace-pre-line break-words type-body-md text-on-surface">{p.note}</p> : null}
                        <Skills skills={p.skills} />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="person_search" title="Nobody is looking right now" className="py-4" />
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
