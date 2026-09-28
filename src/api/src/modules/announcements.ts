import { announcementInput, announcementPatch, type AnnouncementDto } from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { notify } from "../lib/notify";
import type { Actor } from "../http/context";
import { route } from "../http/route";
import { isEventOrganizer, judgeScope, loadManagedEvent, loadVisibleEvent, type EventRow } from "./access";

type Audience = AnnouncementDto["audience"];

const SELECT = `SELECT a.id, a.event_id AS "eventId", a.title, a.body, a.audience, a.pinned,
                       u.name AS "authorName", a.created_at AS "createdAt", a.updated_at AS "updatedAt"
                  FROM announcements a LEFT JOIN users u ON u.id = a.author_id`;

/** Which audiences the caller may read for this event. Organizers and admins see everything. */
export async function visibleAudiences(tx: Tx, actor: Actor, event: EventRow): Promise<Audience[]> {
  const user = actor.user;
  if (!user) return ["everyone"];
  if (user.role === "admin" || (await isEventOrganizer(tx, user, event.id))) return ["everyone", "participants", "judges"];
  const audiences: Audience[] = ["everyone"];
  const registered = await one(
    tx,
    `SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2
     UNION SELECT 1 FROM team_members WHERE event_id = $1 AND user_id = $2`,
    [event.id, user.id],
  );
  if (registered) audiences.push("participants");
  if (await judgeScope(tx, user.id, event.id)) audiences.push("judges");
  return audiences;
}

/** People who get a copy in the local mail outbox for an audience. */
async function recipients(tx: Tx, eventId: string, audience: Audience): Promise<{ id: string; email: string }[]> {
  const participants = `SELECT u.id, u.email FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = $1 AND u.disabled_at IS NULL`;
  const judges = `SELECT u.id, u.email FROM event_judges j JOIN users u ON u.id = j.user_id WHERE j.event_id = $1 AND u.disabled_at IS NULL`;
  const sql = audience === "participants" ? participants : audience === "judges" ? judges : `${participants} UNION ${judges}`;
  return many<{ id: string; email: string }>(tx, sql, [eventId]);
}

async function loadForManagement(tx: Tx, actor: Actor, id: string) {
  const row = await one<{ event_id: string; title: string }>(tx, "SELECT event_id, title FROM announcements WHERE id = $1", [id]);
  if (!row) throw notFound("Announcement");
  const event = await loadManagedEvent(tx, actor, row.event_id);
  return { row, event };
}

export const announcementRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/announcements",
    summary: "Announcements you can see for this event, pinned first then newest",
    description: "Everyone sees public announcements; registered participants and panel judges also see the ones addressed to them.",
    tags: ["Announcements"],
    auth: "public",
    async handler({ params, actor, tx }) {
      return tx(async (t): Promise<AnnouncementDto[]> => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const audiences = await visibleAudiences(t, actor, event);
        return many<AnnouncementDto>(
          t,
          `${SELECT} WHERE a.event_id = $1 AND a.audience = ANY($2) ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100`,
          [event.id, audiences],
        );
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/announcements",
    summary: "Post an announcement (copied to the local mail outbox of its audience; emits announcement.published)",
    tags: ["Announcements"],
    auth: "event:manage",
    body: announcementInput,
    status: 201,
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t): Promise<AnnouncementDto> => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const id = newId("ann");
        await t.query(
          "INSERT INTO announcements (id, event_id, author_id, title, body, audience, pinned) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [id, event.id, actor.user!.id, body.title, body.body, body.audience, body.pinned],
        );
        const to = await recipients(t, event.id, body.audience);
        for (const r of to) {
          await t.query("INSERT INTO outbox (id, to_email, subject, body) VALUES ($1, $2, $3, $4)", [
            newId("mail"),
            r.email,
            `[${event.name}] ${body.title}`,
            `${body.body}\n\n— ${event.name} organizers\n${app.config.publicUrl}/e/${event.slug}`,
          ]);
        }
        await notify(
          t,
          to.map((r) => ({
            userId: r.id,
            eventId: event.id,
            kind: "announcement" as const,
            title: body.title,
            // The feed caps at 2000 chars; the full text lives on the event page.
            body: body.body.length > 2000 ? `${body.body.slice(0, 1999)}…` : body.body,
            link: `/e/${event.slug}`,
          })),
        );
        await audit(t, actor, {
          eventId: event.id,
          action: "announcement.published",
          entityType: "announcement",
          entityId: id,
          summary: `Announcement "${body.title}" to ${body.audience} (${to.length} notified)`,
          data: { audience: body.audience, pinned: body.pinned, notified: to.length },
        });
        await app.webhooks.emit(event.id, "announcement.published", { announcementId: id, title: body.title, audience: body.audience }, t);
        return (await one<AnnouncementDto>(t, `${SELECT} WHERE a.id = $1`, [id]))!;
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/announcements/:announcementId",
    summary: "Edit, pin or unpin an announcement",
    tags: ["Announcements"],
    auth: "event:manage",
    body: announcementPatch,
    async handler({ params, body, actor, tx }) {
      return tx(async (t): Promise<AnnouncementDto> => {
        const { event } = await loadForManagement(t, actor, params.announcementId!);
        const cols = Object.entries({ title: body.title, body: body.body, audience: body.audience, pinned: body.pinned }).filter(
          ([, v]) => v !== undefined,
        );
        if (cols.length) {
          await t.query(
            `UPDATE announcements SET ${cols.map(([k], i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
            [params.announcementId, ...cols.map(([, v]) => v)],
          );
          await audit(t, actor, {
            eventId: event.id,
            action: "announcement.updated",
            entityType: "announcement",
            entityId: params.announcementId,
            summary: `Announcement updated (${cols.map(([k]) => k).join(", ")})`,
            data: Object.fromEntries(cols),
          });
        }
        return (await one<AnnouncementDto>(t, `${SELECT} WHERE a.id = $1`, [params.announcementId]))!;
      });
    },
  }),

  route({
    method: "delete",
    path: "/api/announcements/:announcementId",
    summary: "Delete an announcement",
    tags: ["Announcements"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const { row, event } = await loadForManagement(t, actor, params.announcementId!);
        await t.query("DELETE FROM announcements WHERE id = $1", [params.announcementId]);
        await audit(t, actor, {
          eventId: event.id,
          action: "announcement.deleted",
          entityType: "announcement",
          entityId: params.announcementId,
          summary: `Announcement "${row.title}" deleted`,
        });
      });
      return undefined;
    },
  }),
];
