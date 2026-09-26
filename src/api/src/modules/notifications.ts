import type { NotificationDto, NotificationsDto } from "@dogfood/core";
import { many, one } from "../db/pool";
import { notFound } from "../lib/errors";
import { route } from "../http/route";

/**
 * In-app notifications for the signed-in user: announcements, new judging
 * work and team invitations. Every query is scoped to the caller's own rows.
 */
export const notificationRoutes = [
  route({
    method: "get",
    path: "/api/notifications",
    summary: "Your notifications, newest first, with the unread count",
    tags: ["Notifications"],
    auth: "user",
    async handler({ user, tx }) {
      return tx(async (t): Promise<NotificationsDto> => {
        const items = await many<NotificationDto>(
          t,
          `SELECT id, event_id AS "eventId", kind, title, body, link, read_at AS "readAt", created_at AS "createdAt"
             FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [user.id],
        );
        const unread = await one<{ n: number }>(
          t,
          "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
          [user.id],
        );
        return { items, unread: unread?.n ?? 0 };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/notifications/:notificationId/read",
    summary: "Mark one of your notifications as read",
    tags: ["Notifications"],
    auth: "user",
    async handler({ params, user, tx }) {
      await tx(async (t) => {
        const res = await t.query(
          "UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
          [params.notificationId, user.id],
        );
        if (res.rowCount === 0) {
          const exists = await one(t, "SELECT 1 FROM notifications WHERE id = $1 AND user_id = $2", [
            params.notificationId,
            user.id,
          ]);
          if (!exists) throw notFound("Notification");
        }
      });
      return undefined;
    },
  }),

  route({
    method: "post",
    path: "/api/notifications/read-all",
    summary: "Mark all of your notifications as read",
    tags: ["Notifications"],
    auth: "user",
    async handler({ user, tx }) {
      await tx((t) =>
        t.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]),
      );
      return { ok: true };
    },
  }),
];
