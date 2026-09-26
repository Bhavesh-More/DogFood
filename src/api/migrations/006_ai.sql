-- Optional AI sidecar artifacts.
--
-- AI is off by default (see config.aiEnabled). These tables cache advisory
-- outputs so the portal never re-queries the sidecar on every request and the
-- UI can show results instantly. They hold no scores and never affect
-- normalization: routing affinity is only ever a tie-break.

CREATE TABLE project_classifications (
  submission_id text PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  event_id      text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tags          text[] NOT NULL DEFAULT '{}',
  primary_tag   text NOT NULL DEFAULT 'general',
  confidence    numeric NOT NULL DEFAULT 0,
  source        text NOT NULL DEFAULT 'heuristic',
  model         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_classifications_event_idx ON project_classifications (event_id);

CREATE TABLE judge_expertise (
  event_id   text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  judge_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tags       text[] NOT NULL DEFAULT '{}',
  source     text NOT NULL DEFAULT 'heuristic',
  model      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, judge_id)
);

CREATE TABLE project_summaries (
  submission_id text PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  event_id      text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  summary       text NOT NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  primary_tag   text NOT NULL DEFAULT 'general',
  source        text NOT NULL DEFAULT 'heuristic',
  model         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_summaries_event_idx ON project_summaries (event_id);

CREATE TABLE judge_feedback (
  assignment_id text PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  event_id      text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  judge_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft         text NOT NULL,
  source        text NOT NULL DEFAULT 'heuristic',
  model         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON project_classifications, judge_expertise, project_summaries, judge_feedback TO dogfood_app;

-- Classifications: organizers (and admins) manage them; the sidecar uses `system`.
ALTER TABLE project_classifications FORCE ROW LEVEL SECURITY;
CREATE POLICY project_classifications_staff ON project_classifications FOR ALL
  USING (app_is_event_organizer(event_id)) WITH CHECK (app_is_event_organizer(event_id));
CREATE POLICY project_classifications_system ON project_classifications FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

-- Expertise: organizers manage; a judge can read their own; the sidecar uses `system`.
ALTER TABLE judge_expertise FORCE ROW LEVEL SECURITY;
CREATE POLICY judge_expertise_staff ON judge_expertise FOR ALL
  USING (app_is_event_organizer(event_id)) WITH CHECK (app_is_event_organizer(event_id));
CREATE POLICY judge_expertise_self_read ON judge_expertise FOR SELECT
  USING (judge_id = app_user_id());
CREATE POLICY judge_expertise_system ON judge_expertise FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

-- Summaries are public (they appear on public project pages) and staff-managed.
ALTER TABLE project_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY project_summaries_read ON project_summaries FOR SELECT USING (true);
CREATE POLICY project_summaries_staff ON project_summaries FOR ALL
  USING (app_is_event_organizer(event_id)) WITH CHECK (app_is_event_organizer(event_id));
CREATE POLICY project_summaries_system ON project_summaries FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');

-- Feedback drafts: only the owning judge writes, organizers may read.
ALTER TABLE judge_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY judge_feedback_judge ON judge_feedback FOR ALL
  USING (judge_id = app_user_id()) WITH CHECK (judge_id = app_user_id());
CREATE POLICY judge_feedback_staff_read ON judge_feedback FOR SELECT
  USING (app_is_event_organizer(event_id));
CREATE POLICY judge_feedback_system ON judge_feedback FOR ALL
  USING (app_role() = 'system') WITH CHECK (app_role() = 'system');
