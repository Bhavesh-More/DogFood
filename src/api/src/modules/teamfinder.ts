import { can, isBeforeDeadline, recruitingInput, seekerInput, type TeamFinderDto } from "@dogfood/core";
import { many, one } from "../db/pool";
import { audit } from "../lib/audit";
import { conflict, forbidden, notFound } from "../lib/errors";
import { notify } from "../lib/notify";
import { route } from "../http/route";
import { findEvent, judgeScope, loadVisibleEvent, teamOf } from "./access";
import { assertRosterOpen, loadMyTeam } from "./teams";

/**
 * Team finder: solo participants post their skills, teams advertise open
 * spots. Only names and what people chose to write are shown — no emails.
 * The board freezes with the roster at the submission deadline.
 */
export const teamFinderRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/team-finder",
    summary: "People looking for a team and teams with open spots",
    tags: ["Teams"],
    auth: "user",
    async handler({ app, params, actor, user, tx }) {
      return tx(async (t): Promise<TeamFinderDto> => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const open = event.status === "published" && isBeforeDeadline(event.submission_deadline, app.now());
        const onTeam = Boolean(await teamOf(t, user.id, event.id));
        const posted = Boolean(await one(t, "SELECT 1 FROM team_seekers WHERE event_id = $1 AND user_id = $2", [event.id, user.id]));
        const judge = Boolean(await judgeScope(t, user.id, event.id));
        const seekers = await many<TeamFinderDto["seekers"][number]>(
          t,
          `SELECT s.user_id AS "userId", u.name, s.skills, s.note, s.updated_at AS "updatedAt"
             FROM team_seekers s JOIN users u ON u.id = s.user_id
            WHERE s.event_id = $1 AND u.disabled_at IS NULL
            ORDER BY s.updated_at DESC LIMIT 200`,
          [event.id],
        );
        const teams = await many<TeamFinderDto["teams"][number]>(
          t,
          `SELECT t.id AS "teamId", t.name, t.looking_for AS "lookingFor",
                  array_agg(u.name ORDER BY (m.role = 'captain') DESC, m.joined_at, u.id) AS members,
                  ($2::int - count(m.user_id)::int) AS "openSpots"
             FROM teams t JOIN team_members m ON m.team_id = t.id JOIN users u ON u.id = m.user_id
            WHERE t.event_id = $1 AND t.looking_for IS NOT NULL
            GROUP BY t.id HAVING count(m.user_id) < $2
            ORDER BY t.name LIMIT 200`,
          [event.id, event.max_team_size],
        );
        return {
          open,
          me: { onTeam, posted, canPost: open && !onTeam && !judge && can(user.role, "team:manage") },
          seekers,
          teams,
        };
      });
    },
  }),

  route({
    method: "put",
    path: "/api/events/:eventId/team-finder/me",
    summary: "Post (or update) yourself as looking for a team; registers you for the event",
    tags: ["Teams"],
    auth: "team:manage",
    body: seekerInput,
    async handler({ app, params, body, actor, user, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        if (event.status !== "published") throw forbidden("This event is not open", "EVENT_NOT_OPEN");
        assertRosterOpen(app, event);
        if (await judgeScope(t, user.id, event.id)) throw conflict("Judges cannot join teams", "JUDGE_CONFLICT");
        if (await teamOf(t, user.id, event.id)) throw conflict("You are already on a team in this event", "ALREADY_ON_TEAM");
        await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, user.id]);
        await t.query(
          `INSERT INTO team_seekers (event_id, user_id, skills, note) VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, user_id) DO UPDATE SET skills = EXCLUDED.skills, note = EXCLUDED.note, updated_at = now()`,
          [event.id, user.id, [...new Set(body.skills)], body.note],
        );
        return { posted: true };
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/events/:eventId/team-finder/me",
    summary: "Take yourself off the team finder",
    tags: ["Teams"],
    auth: "user",
    async handler({ params, actor, user, tx }) {
      await tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        await t.query("DELETE FROM team_seekers WHERE event_id = $1 AND user_id = $2", [event.id, user.id]);
      });
      return undefined;
    },
  }),

  route({
    method: "put",
    path: "/api/teams/:teamId/recruiting",
    summary: "Advertise your team's open spots (lookingFor) or stop recruiting (null)",
    tags: ["Teams"],
    auth: "team:manage",
    body: recruitingInput,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const { team, event } = await loadMyTeam(t, actor, params.teamId!);
        assertRosterOpen(app, event, team.deadline_extension_until);
        await t.query("UPDATE teams SET looking_for = $2 WHERE id = $1", [team.id, body.lookingFor]);
        return { teamId: team.id, lookingFor: body.lookingFor };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/teams/:teamId/join-requests",
    summary: "Ask to join a recruiting team (notifies its captains and lists you on the finder)",
    description: "For solo participants. Fails with 409 NOT_RECRUITING, ALREADY_ON_TEAM, JUDGE_CONFLICT or TEAM_FULL.",
    tags: ["Teams"],
    auth: "team:manage",
    status: 201,
    async handler({ app, params, actor, user, tx }) {
      return tx(async (t) => {
        const team = await one<{ id: string; event_id: string; name: string; looking_for: string | null; deadline_extension_until: string | null }>(
          t,
          "SELECT id, event_id, name, looking_for, deadline_extension_until FROM teams WHERE id = $1",
          [params.teamId!],
        );
        if (!team) throw notFound("Team");
        const event = (await findEvent(t, team.event_id))!;
        if (event.status !== "published") throw forbidden("This event is not open", "EVENT_NOT_OPEN");
        assertRosterOpen(app, event, team.deadline_extension_until);
        if (!team.looking_for) throw conflict("This team is not recruiting", "NOT_RECRUITING");
        if (await judgeScope(t, user.id, event.id)) throw conflict("Judges cannot join teams", "JUDGE_CONFLICT");
        if (await teamOf(t, user.id, event.id)) throw conflict("You are already on a team in this event", "ALREADY_ON_TEAM");
        const size = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [team.id]);
        if ((size?.n ?? 0) >= event.max_team_size) throw conflict(`Team is full (${event.max_team_size} members max)`, "TEAM_FULL");
        // Put the requester on the board so the captain can invite them from the roster.
        await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, user.id]);
        await t.query(
          `INSERT INTO team_seekers (event_id, user_id, skills, note) VALUES ($1, $2, '{}', '')
           ON CONFLICT (event_id, user_id) DO NOTHING`,
          [event.id, user.id],
        );
        const captains = await many<{ id: string; name: string }>(
          t,
          "SELECT u.id, u.name FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1 AND m.role = 'captain'",
          [team.id],
        );
        const link = `/e/${event.slug}/team`;
        const title = `${user.name} asked to join "${team.name}"`;
        // Dedup on stable ids, not the rendered title (two people can share a name).
        const already = await one(
          t,
          "SELECT 1 FROM audit_log WHERE action = 'team.join_requested' AND entity_id = $1 AND data->>'userId' = $2",
          [team.id, user.id],
        );
        if (!already) {
          await notify(
            t,
            captains.map((c) => ({
              userId: c.id,
              eventId: event.id,
              kind: "team_request" as const,
              title,
              body: `They're on the team finder now — open your team page to invite them.`,
              link,
            })),
          );
          await audit(t, actor, {
            eventId: event.id,
            action: "team.join_requested",
            entityType: "team",
            entityId: team.id,
            summary: `${user.name} asked to join "${team.name}"`,
            data: { userId: user.id },
          });
        }
        return { requested: true };
      });
    },
  }),
];
