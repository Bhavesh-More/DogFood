-- Defence in depth: database-enforced isolation, deadline lock and an
-- append-only, hash-chained audit trail.
--
-- The API runs request traffic as the non-owner role `dogfood_app` (via
-- SET ROLE on every pooled connection) so that Row-Level Security applies.
-- Each request transaction sets:
--   app.user_id  – authenticated user id ('' for anonymous)
--   app.role     – user role, or 'system' for trusted internal jobs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dogfood_app') THEN
    CREATE ROLE dogfood_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT dogfood_app TO %I', current_user);
EXCEPTION WHEN others THEN
  -- Already a member, or a superuser (who can SET ROLE to anything).
  NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO dogfood_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dogfood_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dogfood_app;
-- Audit log is append-only for the application.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM dogfood_app;
-- Migrations bookkeeping is not the application's business.
REVOKE ALL ON schema_migrations FROM dogfood_app;

-- ---------------------------------------------------------------------------
-- Request context helpers
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION app_role() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'anonymous') $$;

CREATE FUNCTION app_is_privileged() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_role() IN ('admin', 'system') $$;

CREATE FUNCTION app_is_event_organizer(p_event_id text) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT app_is_privileged() OR EXISTS (
      SELECT 1 FROM event_organizers eo
      WHERE eo.event_id = p_event_id AND eo.user_id = app_user_id()
    )
  $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: WHERE judge_id = auth.uid, enforced by Postgres.
-- ---------------------------------------------------------------------------
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY assignments_judge_read ON assignments FOR SELECT
  USING (judge_id = app_user_id());
CREATE POLICY assignments_judge_progress ON assignments FOR UPDATE
  USING (judge_id = app_user_id())
  WITH CHECK (judge_id = app_user_id());
CREATE POLICY assignments_staff ON assignments FOR ALL
  USING (app_is_event_organizer(event_id))
  WITH CHECK (app_is_event_organizer(event_id));

ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots FORCE ROW LEVEL SECURITY;
CREATE POLICY ballots_judge ON ballots FOR ALL
  USING (judge_id = app_user_id())
  WITH CHECK (
    judge_id = app_user_id() AND EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id AND a.judge_id = app_user_id()
    )
  );
CREATE POLICY ballots_staff_read ON ballots FOR SELECT
  USING (app_is_event_organizer(event_id));
CREATE POLICY ballots_system ON ballots FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores FORCE ROW LEVEL SECURITY;
CREATE POLICY scores_judge ON scores FOR ALL
  USING (judge_id = app_user_id())
  WITH CHECK (
    judge_id = app_user_id() AND EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.id = assignment_id AND a.judge_id = app_user_id()
    )
  );
CREATE POLICY scores_staff_read ON scores FOR SELECT
  USING (app_is_event_organizer(event_id));
CREATE POLICY scores_system ON scores FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

ALTER TABLE pairwise_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairwise_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY pairwise_judge_read ON pairwise_votes FOR SELECT
  USING (judge_id = app_user_id());
CREATE POLICY pairwise_judge_insert ON pairwise_votes FOR INSERT
  WITH CHECK (judge_id = app_user_id());
CREATE POLICY pairwise_staff ON pairwise_votes FOR ALL
  USING (app_is_event_organizer(event_id))
  WITH CHECK (app_is_event_organizer(event_id));

-- Normalization snapshots contain every judge's raw totals: staff only.
ALTER TABLE normalization_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalization_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY normalization_staff ON normalization_runs FOR ALL
  USING (app_is_event_organizer(event_id))
  WITH CHECK (app_is_event_organizer(event_id));

-- Judges may only move their own assignment through its status workflow.
REVOKE UPDATE ON assignments FROM dogfood_app;
GRANT UPDATE (status, updated_at) ON assignments TO dogfood_app;

-- Ballot/score ownership columns are derived from the assignment, never
-- trusted from the writer, so a judge cannot re-point a ballot elsewhere.
CREATE FUNCTION derive_ballot_ownership() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_event text;
  v_judge text;
  v_submission text;
BEGIN
  SELECT event_id, judge_id, submission_id INTO v_event, v_judge, v_submission
    FROM assignments WHERE id = NEW.assignment_id;
  IF v_judge IS NULL THEN
    RAISE EXCEPTION 'assignment % not visible to caller', NEW.assignment_id USING ERRCODE = '42501';
  END IF;
  NEW.event_id := v_event;
  NEW.judge_id := v_judge;
  IF TG_TABLE_NAME = 'ballots' THEN
    NEW.submission_id := v_submission;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER ballots_00_ownership BEFORE INSERT OR UPDATE ON ballots
  FOR EACH ROW EXECUTE FUNCTION derive_ballot_ownership();
CREATE TRIGGER scores_00_ownership BEFORE INSERT OR UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION derive_ballot_ownership();

-- ---------------------------------------------------------------------------
-- Score bounds: a criterion score can never exceed the criterion max.
-- ---------------------------------------------------------------------------
CREATE FUNCTION enforce_score_bounds() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_max int;
BEGIN
  SELECT max_score INTO v_max FROM criteria
   WHERE id = NEW.criterion_id AND event_id = NEW.event_id;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'unknown criterion %', NEW.criterion_id USING ERRCODE = '23503';
  END IF;
  IF NEW.value > v_max THEN
    RAISE EXCEPTION 'score % exceeds criterion max %', NEW.value, v_max USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER scores_10_bounds BEFORE INSERT OR UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION enforce_score_bounds();

-- ---------------------------------------------------------------------------
-- Hard deadline, second line of defence. The API checks the server clock
-- first; this trigger guarantees no code path can bypass it.
-- ---------------------------------------------------------------------------
CREATE FUNCTION enforce_submission_deadline() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_deadline  timestamptz;
  v_extension timestamptz;
BEGIN
  IF app_role() = 'system' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND
     (NEW.title, NEW.tagline, NEW.description, NEW.repo_url, NEW.demo_video_url, NEW.live_url,
      NEW.thumbnail_url, NEW.gallery, NEW.tech_tags, NEW.answers, NEW.track_id, NEW.status)
     IS NOT DISTINCT FROM
     (OLD.title, OLD.tagline, OLD.description, OLD.repo_url, OLD.demo_video_url, OLD.live_url,
      OLD.thumbnail_url, OLD.gallery, OLD.tech_tags, OLD.answers, OLD.track_id, OLD.status) THEN
    -- Organizer-side fields (eligibility) stay editable after the deadline.
    RETURN NEW;
  END IF;
  SELECT e.submission_deadline, t.deadline_extension_until
    INTO v_deadline, v_extension
    FROM events e JOIN teams t ON t.id = NEW.team_id
   WHERE e.id = NEW.event_id;
  IF now() >= greatest(v_deadline, coalesce(v_extension, v_deadline)) THEN
    RAISE EXCEPTION 'submission deadline has passed'
      USING ERRCODE = 'P0001', HINT = 'DEADLINE_PASSED';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER submissions_deadline BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_submission_deadline();

-- ---------------------------------------------------------------------------
-- Audit trail: sequence + SHA-256 hash chain assigned under an advisory lock,
-- and no UPDATE/DELETE ever (even for the table owner via trigger).
-- ---------------------------------------------------------------------------
CREATE FUNCTION audit_row_digest(
  p_seq bigint, p_prev text, p_event text, p_actor text, p_action text,
  p_entity_type text, p_entity_id text, p_summary text, p_data jsonb, p_created timestamptz
) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT encode(sha256(convert_to(concat_ws('|',
      p_seq::text, p_prev, coalesce(p_event, ''), coalesce(p_actor, ''), p_action,
      p_entity_type, coalesce(p_entity_id, ''), p_summary, p_data::text,
      (extract(epoch FROM p_created) * 1000000)::bigint::text
    ), 'UTF8')), 'hex')
  $$;

CREATE FUNCTION audit_log_chain() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_prev_seq  bigint;
  v_prev_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock(727274001);
  SELECT seq, hash INTO v_prev_seq, v_prev_hash FROM audit_log ORDER BY seq DESC LIMIT 1;
  NEW.seq := coalesce(v_prev_seq, 0) + 1;
  NEW.prev_hash := coalesce(v_prev_hash, 'GENESIS');
  NEW.created_at := clock_timestamp();
  NEW.hash := audit_row_digest(NEW.seq, NEW.prev_hash, NEW.event_id, NEW.actor_id, NEW.action,
                               NEW.entity_type, NEW.entity_id, NEW.summary, NEW.data, NEW.created_at);
  RETURN NEW;
END
$$;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

CREATE FUNCTION audit_log_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Recompute the chain; returns the rows whose hash or link is wrong.
CREATE FUNCTION audit_log_verify() RETURNS TABLE (seq bigint, problem text)
  LANGUAGE sql STABLE
  AS $$
    WITH ordered AS (
      SELECT a.*, lag(a.hash) OVER (ORDER BY a.seq) AS expected_prev,
             lag(a.seq) OVER (ORDER BY a.seq) AS prev_seq
        FROM audit_log a
    )
    SELECT o.seq,
           CASE
             WHEN o.hash <> audit_row_digest(o.seq, o.prev_hash, o.event_id, o.actor_id, o.action,
                                             o.entity_type, o.entity_id, o.summary, o.data, o.created_at)
               THEN 'hash mismatch'
             WHEN o.prev_hash <> coalesce(o.expected_prev, 'GENESIS') THEN 'broken link'
             ELSE 'sequence gap'
           END
      FROM ordered o
     WHERE o.hash <> audit_row_digest(o.seq, o.prev_hash, o.event_id, o.actor_id, o.action,
                                      o.entity_type, o.entity_id, o.summary, o.data, o.created_at)
        OR o.prev_hash <> coalesce(o.expected_prev, 'GENESIS')
        OR o.seq <> coalesce(o.prev_seq, 0) + 1
     ORDER BY o.seq
  $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dogfood_app;
