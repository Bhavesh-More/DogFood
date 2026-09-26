-- In-app notifications: a per-user feed for announcements, new judging work
-- and invitations. Every read filters `user_id = <caller>` in the module; the
-- table is only written by server-side code paths that already authorised the
-- actor (event organiser, team member), so it carries no RLS of its own —
-- matching the announcements table it is fed from.
CREATE TABLE notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_id   text REFERENCES events (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('announcement', 'assignment', 'invite')),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body       text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO dogfood_app;
