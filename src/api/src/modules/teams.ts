import { invitationInput, isBeforeDeadline, teamInput, type InviteDto, type TeamDto } from "@dogfood/core";
import { many, mapSeq, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { randomToken, sha256Hex } from "../lib/crypto";
import { HttpError, conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { notify } from "../lib/notify";
import type { Actor, AppContext } from "../http/context";
import { route } from "../http/route";
import { findEvent, judgeScope, loadManagedEvent, loadVisibleEvent, teamOf, type EventRow } from "./access";

interface TeamRow {
  id: string;
  event_id: string;
  name: string;
  deadline_extension_until: string | null;
}

export async function buildTeamDto(tx: Tx, teamId: string): Promise<TeamDto> {
  const team = await one<TeamRow & { max_team_size: number; submission_id: string | null; looking_for: string | null }>(
    tx,
    `SELECT t.id, t.event_id, t.name, t.deadline_extension_until, t.looking_for, e.max_team_size,
            (SELECT s.id FROM submissions s WHERE s.team_id = t.id) AS submission_id
       FROM teams t JOIN events e ON e.id = t.event_id WHERE t.id = $1`,
    [teamId],
  );
  if (!team) throw notFound("Team");
  const members = await many<{ userId: string; name: string; role: "captain" | "member"; joinedAt: string }>(
    tx,
    `SELECT m.user_id AS "userId", u.name, m.role, m.joined_at AS "joinedAt"
       FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1 ORDER BY (m.role = 'captain') DESC, m.joined_at`,
    [teamId],
  );
  return {
    id: team.id,
    eventId: team.event_id,
    name: team.name,
    members,
    maxSize: team.max_team_size,
    deadlineExtensionUntil: team.deadline_extension_until,
    submissionId: team.submission_id,
    lookingFor: team.looking_for,
  };
}

/** Roster changes are locked at the (team-specific) deadline, like submissions. */
export function assertRosterOpen(app: AppContext, event: EventRow, extensionUntil: string | null = null) {
  if (!isBeforeDeadline(event.submission_deadline, app.now(), extensionUntil)) {
    throw new HttpError(403, "DEADLINE_PASSED", "Teams are locked: the submission deadline has passed", {
      deadline: event.submission_deadline,
    });
  }
}

export async function loadMyTeam(tx: Tx, actor: Actor, teamId: string) {
  const team = await one<TeamRow>(tx, "SELECT id, event_id, name, deadline_extension_until FROM teams WHERE id = $1", [teamId]);
  if (!team) throw notFound("Team");
  const member = await one<{ role: string }>(tx, "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2", [
    teamId,
    actor.user!.id,
  ]);
  if (!member) throw forbidden("You are not a member of this team", "NOT_TEAM_MEMBER");
  const event = (await findEvent(tx, team.event_id))!;
  return { team, event, role: member.role as "captain" | "member" };
}

function inviteUrl(app: AppContext, token: string) {
  return `${app.config.publicUrl}/invite/${token}`;
}

const INVITE_TTL_HOURS = 72;

export const teamRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/my-team",
    summary: "Your team in this event (null if none)",
    tags: ["Teams"],
    auth: "user",
    async handler({ params, actor, user, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const teamId = await teamOf(t, user.id, event.id);
        return teamId ? buildTeamDto(t, teamId) : null;
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/teams",
    summary: "Create a team (you become captain; registers you if needed)",
    tags: ["Teams"],
    auth: "team:manage",
    body: teamInput,
    status: 201,
    async handler({ app, params, body, actor, user, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        if (event.status !== "published") throw forbidden("This event is not open", "EVENT_NOT_OPEN");
        assertRosterOpen(app, event);
        if (await judgeScope(t, user.id, event.id)) throw conflict("Judges cannot join teams", "JUDGE_CONFLICT");
        if (await teamOf(t, user.id, event.id)) throw conflict("You are already on a team in this event", "ALREADY_ON_TEAM");
        const id = newId("team");
        await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, user.id]);
        await t.query("INSERT INTO teams (id, event_id, name, created_by) VALUES ($1, $2, $3, $4)", [
          id,
          event.id,
          body.name,
          user.id,
        ]);
        await t.query(
          "INSERT INTO team_members (team_id, event_id, user_id, role) VALUES ($1, $2, $3, 'captain')",
          [id, event.id, user.id],
        );
        await audit(t, actor, {
          eventId: event.id,
          action: "team.created",
          entityType: "team",
          entityId: id,
          summary: `Team "${body.name}" created by ${user.name}`,
        });
        return buildTeamDto(t, id);
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/teams/:teamId",
    summary: "Rename your team",
    tags: ["Teams"],
    auth: "team:manage",
    body: teamInput,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const { team, event } = await loadMyTeam(t, actor, params.teamId!);
        assertRosterOpen(app, event, team.deadline_extension_until);
        await t.query("UPDATE teams SET name = $2 WHERE id = $1", [team.id, body.name]);
        await audit(t, actor, {
          eventId: event.id,
          action: "team.renamed",
          entityType: "team",
          entityId: team.id,
          summary: `Team renamed from "${team.name}" to "${body.name}"`,
        });
        return buildTeamDto(t, team.id);
      });
    },
  }),

  route({
    method: "post",
    path: "/api/teams/:teamId/invites",
    summary: "Create a single-use invite link (expires in 72h)",
    description: "The raw token is returned once; only its SHA-256 hash is stored.",
    tags: ["Teams"],
    auth: "team:manage",
    status: 201,
    async handler({ app, params, actor, tx }) {
      return tx(async (t): Promise<InviteDto> => {
        const { team, event } = await loadMyTeam(t, actor, params.teamId!);
        assertRosterOpen(app, event, team.deadline_extension_until);
        const size = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [team.id]);
        if ((size?.n ?? 0) >= event.max_team_size) throw conflict("Your team is already full", "TEAM_FULL");
        const token = randomToken(24);
        const id = newId("inv");
        const row = await one<{ expires_at: string }>(
          t,
          `INSERT INTO team_invites (id, team_id, token_hash, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING expires_at`,
          [id, team.id, sha256Hex(token), actor.user!.id, new Date(app.now() + INVITE_TTL_HOURS * 3_600_000).toISOString()],
        );
        await audit(t, actor, {
          eventId: event.id,
          action: "team.invite_created",
          entityType: "team_invite",
          entityId: id,
          summary: `Invite link created for "${team.name}"`,
        });
        return { id, token, url: inviteUrl(app, token), expiresAt: row!.expires_at, usedAt: null };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/teams/:teamId/invitations",
    summary: "Invite one specific person to your team (they get an in-app notification)",
    description: "Creates a single-use invite link and delivers it to the invitee as a notification. Fails with 409 if they already have a team or judge this event.",
    tags: ["Teams"],
    auth: "team:manage",
    body: invitationInput,
    status: 201,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t): Promise<InviteDto> => {
        const { team, event } = await loadMyTeam(t, actor, params.teamId!);
        assertRosterOpen(app, event, team.deadline_extension_until);
        const size = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [team.id]);
        if ((size?.n ?? 0) >= event.max_team_size) throw conflict("Your team is already full", "TEAM_FULL");
        const target = await one<{ id: string; name: string }>(
          t,
          "SELECT id, name FROM users WHERE id = $1 AND disabled_at IS NULL",
          [body.userId],
        );
        if (!target) throw notFound("Person");
        if (await teamOf(t, target.id, event.id)) throw conflict("They are already on a team in this event", "ALREADY_ON_TEAM");
        if (await judgeScope(t, target.id, event.id)) throw conflict("They are judging this event", "JUDGE_CONFLICT");
        const token = randomToken(24);
        const id = newId("inv");
        const row = await one<{ expires_at: string }>(
          t,
          `INSERT INTO team_invites (id, team_id, token_hash, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING expires_at`,
          [id, team.id, sha256Hex(token), actor.user!.id, new Date(app.now() + INVITE_TTL_HOURS * 3_600_000).toISOString()],
        );
        await notify(t, {
          userId: target.id,
          eventId: event.id,
          kind: "invite",
          title: `${actor.user!.name} invited you to join "${team.name}"`,
          body: `You're invited to join ${team.name} for ${event.name}. Open the invitation to accept.`,
          link: `/invite/${token}`,
        });
        await audit(t, actor, {
          eventId: event.id,
          action: "team.invited",
          entityType: "team_invite",
          entityId: id,
          summary: `Invited ${target.name} to "${team.name}"`,
        });
        return { id, token, url: inviteUrl(app, token), expiresAt: row!.expires_at, usedAt: null };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/teams/:teamId/invites",
    summary: "List your team's invite links (tokens are never shown again)",
    tags: ["Teams"],
    auth: "team:manage",
    async handler({ params, actor, tx }) {      return tx(async (t) => {
        const { team } = await loadMyTeam(t, actor, params.teamId!);
        return many(
          t,
          `SELECT i.id, i.created_at AS "createdAt", i.expires_at AS "expiresAt", i.used_at AS "usedAt",
                  i.revoked_at AS "revokedAt", u.name AS "usedBy"
             FROM team_invites i LEFT JOIN users u ON u.id = i.used_by
            WHERE i.team_id = $1 ORDER BY i.created_at DESC`,
          [team.id],
        );
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/teams/:teamId/invites/:inviteId",
    summary: "Revoke an unused invite link",
    tags: ["Teams"],
    auth: "team:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const { team, event } = await loadMyTeam(t, actor, params.teamId!);
        const res = await t.query(
          "UPDATE team_invites SET revoked_at = now() WHERE id = $1 AND team_id = $2 AND used_at IS NULL AND revoked_at IS NULL",
          [params.inviteId, team.id],
        );
        if (res.rowCount === 0) throw notFound("Invite");
        await audit(t, actor, {
          eventId: event.id,
          action: "team.invite_revoked",
          entityType: "team_invite",
          entityId: params.inviteId,
          summary: "Invite link revoked",
        });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/invites/:token",
    summary: "Preview a team invite before accepting",
    tags: ["Teams"],
    auth: "public",
    async handler({ app, params, tx }) {
      return tx(async (t) => {
        const invite = await one<{
          id: string;
          team_id: string;
          expires_at: string;
          used_at: string | null;
          revoked_at: string | null;
        }>(t, "SELECT id, team_id, expires_at, used_at, revoked_at FROM team_invites WHERE token_hash = $1", [
          sha256Hex(params.token!),
        ]);
        if (!invite) throw notFound("Invite");
        const team = await buildTeamDto(t, invite.team_id);
        const event = (await findEvent(t, team.eventId))!;
        const status = invite.revoked_at
          ? "revoked"
          : invite.used_at
            ? "used"
            : Date.parse(invite.expires_at) <= app.now()
              ? "expired"
              : team.members.length >= team.maxSize
                ? "full"
                : "valid";
        return {
          status,
          expiresAt: invite.expires_at,
          team: { id: team.id, name: team.name, memberCount: team.members.length, maxSize: team.maxSize },
          event: { id: event.id, slug: event.slug, name: event.name },
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/invites/:token/accept",
    summary: "Join a team with an invite link (single use)",
    description:
      "Consumes the invite atomically. Fails with 409 TEAM_FULL, ALREADY_ON_TEAM or INVITE_USED, 410 INVITE_EXPIRED, 403 DEADLINE_PASSED.",
    tags: ["Teams"],
    auth: "team:manage",
    async handler({ app, params, actor, user, tx }) {
      return tx(async (t) => {
        // Lock the invite row so two people cannot consume it concurrently.
        const invite = await one<{
          id: string;
          team_id: string;
          expires_at: string;
          used_at: string | null;
          revoked_at: string | null;
        }>(
          t,
          "SELECT id, team_id, expires_at, used_at, revoked_at FROM team_invites WHERE token_hash = $1 FOR UPDATE",
          [sha256Hex(params.token!)],
        );
        if (!invite) throw notFound("Invite");
        if (invite.revoked_at) throw new HttpError(410, "INVITE_REVOKED", "This invite link was revoked");
        if (invite.used_at) throw conflict("This invite link has already been used", "INVITE_USED");
        if (Date.parse(invite.expires_at) <= app.now()) throw new HttpError(410, "INVITE_EXPIRED", "This invite link has expired");
        // Lock the team row: capacity check + insert are serialised per team.
        const team = await one<TeamRow>(
          t,
          "SELECT id, event_id, name, deadline_extension_until FROM teams WHERE id = $1 FOR UPDATE",
          [invite.team_id],
        );
        if (!team) throw notFound("Team");
        const event = (await findEvent(t, team.event_id))!;
        assertRosterOpen(app, event, team.deadline_extension_until);
        if (await judgeScope(t, user.id, event.id)) throw conflict("Judges cannot join teams", "JUDGE_CONFLICT");
        if (await teamOf(t, user.id, event.id)) throw conflict("You are already on a team in this event", "ALREADY_ON_TEAM");
        const size = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [team.id]);
        if ((size?.n ?? 0) >= event.max_team_size) throw conflict(`Team is full (${event.max_team_size} members max)`, "TEAM_FULL");
        await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, user.id]);
        await t.query("INSERT INTO team_members (team_id, event_id, user_id, role) VALUES ($1, $2, $3, 'member')", [
          team.id,
          event.id,
          user.id,
        ]);
        await t.query("UPDATE team_invites SET used_at = now(), used_by = $2 WHERE id = $1", [invite.id, user.id]);
        await audit(t, actor, {
          eventId: event.id,
          action: "team.member_joined",
          entityType: "team",
          entityId: team.id,
          summary: `${user.name} joined "${team.name}"`,
          data: { inviteId: invite.id },
        });
        await app.webhooks.emit(event.id, "team.member_joined", { teamId: team.id, userId: user.id }, t);
        return buildTeamDto(t, team.id);
      });
    },
  }),

  route({
    method: "post",
    path: "/api/teams/:teamId/leave",
    summary: "Leave your team (the last member leaving dissolves it)",
    tags: ["Teams"],
    auth: "team:manage",
    async handler({ app, params, actor, user, tx }) {
      await tx(async (t) => {
        const { team, event, role } = await loadMyTeam(t, actor, params.teamId!);
        assertRosterOpen(app, event, team.deadline_extension_until);
        await t.query("SELECT 1 FROM teams WHERE id = $1 FOR UPDATE", [team.id]);
        await t.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [team.id, user.id]);
        const remaining = await many<{ user_id: string }>(
          t,
          "SELECT user_id FROM team_members WHERE team_id = $1 ORDER BY joined_at",
          [team.id],
        );
        if (remaining.length === 0) {
          await t.query("DELETE FROM teams WHERE id = $1", [team.id]);
        } else if (role === "captain") {
          await t.query("UPDATE team_members SET role = 'captain' WHERE team_id = $1 AND user_id = $2", [
            team.id,
            remaining[0]!.user_id,
          ]);
        }
        await audit(t, actor, {
          eventId: event.id,
          action: remaining.length === 0 ? "team.dissolved" : "team.member_left",
          entityType: "team",
          entityId: team.id,
          summary: `${user.name} left "${team.name}"`,
        });
      });
      return undefined;
    },
  }),

  route({
    method: "delete",
    path: "/api/teams/:teamId/members/:userId",
    summary: "Captain removes a member",
    tags: ["Teams"],
    auth: "team:manage",
    async handler({ app, params, actor, tx }) {
      await tx(async (t) => {
        const { team, event, role } = await loadMyTeam(t, actor, params.teamId!);
        if (role !== "captain") throw forbidden("Only the captain can remove members", "NOT_CAPTAIN");
        if (params.userId === actor.user!.id) throw conflict("Use leave to remove yourself", "USE_LEAVE");
        assertRosterOpen(app, event, team.deadline_extension_until);
        const res = await t.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [team.id, params.userId]);
        if (res.rowCount === 0) throw notFound("Member");
        await audit(t, actor, {
          eventId: event.id,
          action: "team.member_removed",
          entityType: "team",
          entityId: team.id,
          summary: `Member removed from "${team.name}"`,
          data: { userId: params.userId },
        });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/teams",
    summary: "All teams of an event (organizers)",
    tags: ["Teams"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const ids = await many<{ id: string }>(t, "SELECT id FROM teams WHERE event_id = $1 ORDER BY name", [event.id]);
        return mapSeq(ids, (r) => buildTeamDto(t, r.id));
      });
    },
  }),
];
