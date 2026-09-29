-- Team join requests: a solo participant asks to join a specific recruiting
-- team. The captain answers accept/reject on the team page; accepting adds
-- the member directly (no second invite round-trip).
CREATE TABLE team_join_requests (
  team_id    text NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_join_requests_team_idx ON team_join_requests (team_id, created_at);

-- Joining a team (by any path: invite link, direct accept, founding one)
-- clears the person's pending requests for that event.
CREATE FUNCTION team_join_requests_clear_on_join() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM team_join_requests WHERE event_id = NEW.event_id AND user_id = NEW.user_id;
  RETURN NEW;
END
$$;
CREATE TRIGGER team_members_clear_join_requests AFTER INSERT ON team_members
  FOR EACH ROW EXECUTE FUNCTION team_join_requests_clear_on_join();

GRANT SELECT, INSERT, UPDATE, DELETE ON team_join_requests TO dogfood_app;
