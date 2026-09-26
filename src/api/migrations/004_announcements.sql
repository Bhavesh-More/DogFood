-- Organizer announcements: news posted to an event's page, targeted at
-- everyone, registered participants, or the judging panel.
CREATE TABLE announcements (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  author_id  text REFERENCES users (id) ON DELETE SET NULL,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  audience   text NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'participants', 'judges')),
  pinned     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_event_idx ON announcements (event_id, pinned DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO dogfood_app;
