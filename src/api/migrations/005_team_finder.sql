-- Team finder: solo participants advertise their skills; teams advertise
-- open spots and what they are looking for.
CREATE TABLE team_seekers (
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  skills     text[] NOT NULL DEFAULT '{}',
  note       text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX team_seekers_event_idx ON team_seekers (event_id, updated_at DESC);

-- NULL = not recruiting; text = what the team is looking for.
ALTER TABLE teams ADD COLUMN looking_for text CHECK (looking_for IS NULL OR char_length(looking_for) <= 200);

-- Joining or founding a team takes you off the board, whichever code path adds the membership.
CREATE FUNCTION team_seekers_clear_on_join() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM team_seekers WHERE event_id = NEW.event_id AND user_id = NEW.user_id;
  RETURN NEW;
END
$$;
CREATE TRIGGER team_members_clear_seeker AFTER INSERT ON team_members
  FOR EACH ROW EXECUTE FUNCTION team_seekers_clear_on_join();

GRANT SELECT, INSERT, UPDATE, DELETE ON team_seekers TO dogfood_app;
