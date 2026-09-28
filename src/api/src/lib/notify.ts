import type { Tx } from "../db/pool";
import { newId } from "./ids";

export interface NotificationInput {
  /** Who receives it. */
  userId: string;
  eventId?: string | null;
  kind: "announcement" | "assignment" | "invite" | "team_request";
  title: string;
  body?: string;
  /** In-app path (relative) the notification opens. */
  link?: string | null;
}

/**
 * Insert one notification, or one per input, inside the caller's transaction.
 * Notification rows are written by trusted code paths only; reads always
 * filter on `user_id`.
 */
export async function notify(tx: Tx, input: NotificationInput | NotificationInput[]): Promise<void> {
  for (const n of Array.isArray(input) ? input : [input]) {
    await tx.query(
      `INSERT INTO notifications (id, user_id, event_id, kind, title, body, link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newId("ntf"), n.userId, n.eventId ?? null, n.kind, n.title, n.body ?? "", n.link ?? null],
    );
  }
}
