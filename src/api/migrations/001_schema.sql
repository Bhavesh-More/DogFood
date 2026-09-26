-- Dogfood portal schema, version 1.
-- Conventions: text primary keys with a readable prefix (usr_, evt_, …),
-- timestamptz everywhere (stored UTC), snake_case columns.

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('visitor', 'participant', 'judge', 'organizer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  kind         text NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'api', 'checker')),
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_used_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                     text PRIMARY KEY,
  slug                   text NOT NULL UNIQUE,
  name                   text NOT NULL,
  tagline                text NOT NULL DEFAULT '',
  description            text NOT NULL DEFAULT '',
  rules                  text NOT NULL DEFAULT '',
  location               text NOT NULL DEFAULT 'Online',
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  starts_at              timestamptz NOT NULL,
  submission_deadline    timestamptz NOT NULL,
  judging_ends_at        timestamptz,
  voting_opens_at        timestamptz,
  voting_closes_at       timestamptz,
  results_published_at   timestamptz,
  min_team_size          int NOT NULL DEFAULT 1 CHECK (min_team_size BETWEEN 1 AND 10),
  max_team_size          int NOT NULL DEFAULT 4 CHECK (max_team_size BETWEEN 1 AND 10),
  voting_mode            text NOT NULL DEFAULT 'off' CHECK (voting_mode IN ('off', 'open', 'email', 'authenticated')),
  voting_style           text NOT NULL DEFAULT 'single' CHECK (voting_style IN ('single', 'quadratic')),
  vote_budget            int NOT NULL DEFAULT 3 CHECK (vote_budget BETWEEN 1 AND 1000),
  reviews_per_submission int NOT NULL DEFAULT 3 CHECK (reviews_per_submission BETWEEN 1 AND 10),
  norm_target_mean       double precision NOT NULL DEFAULT 70,
  norm_target_sd         double precision NOT NULL DEFAULT 15,
  norm_min_sample        int NOT NULL DEFAULT 5 CHECK (norm_min_sample >= 1),
  created_by             text REFERENCES users (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (submission_deadline > starts_at),
  CHECK (min_team_size <= max_team_size),
  CHECK ((voting_opens_at IS NULL) = (voting_closes_at IS NULL)),
  CHECK (voting_closes_at IS NULL OR voting_closes_at > voting_opens_at)
);
CREATE INDEX events_status_idx ON events (status, starts_at);

CREATE TABLE event_organizers (
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE tracks (
  id          text PRIMARY KEY,
  event_id    text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  position    int NOT NULL DEFAULT 0,
  UNIQUE (event_id, name),
  UNIQUE (id, event_id)
);

CREATE TABLE prizes (
  id          text PRIMARY KEY,
  event_id    text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  track_id    text REFERENCES tracks (id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  value       text NOT NULL DEFAULT '',
  position    int NOT NULL DEFAULT 0
);
CREATE INDEX prizes_event_idx ON prizes (event_id);

CREATE TABLE questions (
  id       text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  label    text NOT NULL,
  help     text NOT NULL DEFAULT '',
  kind     text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'textarea', 'url', 'select', 'boolean')),
  required boolean NOT NULL DEFAULT false,
  options  jsonb NOT NULL DEFAULT '[]'::jsonb,
  position int NOT NULL DEFAULT 0
);
CREATE INDEX questions_event_idx ON questions (event_id);

CREATE TABLE registrations (
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE teams (
  id                       text PRIMARY KEY,
  event_id                 text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name                     text NOT NULL,
  created_by               text REFERENCES users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  deadline_extension_until timestamptz,
  extension_reason         text,
  UNIQUE (event_id, name),
  UNIQUE (id, event_id)
);

CREATE TABLE team_members (
  team_id   text NOT NULL,
  event_id  text NOT NULL,
  user_id   text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  -- One team per person per event, enforced by the database.
  UNIQUE (event_id, user_id),
  FOREIGN KEY (team_id, event_id) REFERENCES teams (id, event_id) ON DELETE CASCADE
);

CREATE TABLE team_invites (
  id         text PRIMARY KEY,
  team_id    text NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  used_by    text REFERENCES users (id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX team_invites_team_idx ON team_invites (team_id);

-- text[] -> text is only STABLE in core Postgres; for text[] it is safe to
-- declare immutable, which lets us index tags inside the generated tsvector.
CREATE FUNCTION immutable_tags_text(tags text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string(tags, ' ') $$;

CREATE TABLE submissions (
  id                text PRIMARY KEY,
  event_id          text NOT NULL,
  team_id           text NOT NULL UNIQUE,
  track_id          text,
  title             text NOT NULL DEFAULT '',
  tagline           text NOT NULL DEFAULT '',
  description       text NOT NULL DEFAULT '',
  repo_url          text NOT NULL DEFAULT '',
  demo_video_url    text NOT NULL DEFAULT '',
  live_url          text NOT NULL DEFAULT '',
  thumbnail_url     text NOT NULL DEFAULT '',
  gallery           jsonb NOT NULL DEFAULT '[]'::jsonb,
  tech_tags         text[] NOT NULL DEFAULT '{}',
  answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at      timestamptz,
  eligibility       text NOT NULL DEFAULT 'pending' CHECK (eligibility IN ('pending', 'eligible', 'ineligible')),
  eligibility_note  text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  search            tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                      setweight(to_tsvector('simple', coalesce(tagline, '')), 'B') ||
                      setweight(to_tsvector('simple', immutable_tags_text(tech_tags)), 'B') ||
                      setweight(to_tsvector('simple', coalesce(description, '')), 'C')
                    ) STORED,
  FOREIGN KEY (team_id, event_id) REFERENCES teams (id, event_id) ON DELETE CASCADE,
  FOREIGN KEY (track_id, event_id) REFERENCES tracks (id, event_id) ON DELETE SET NULL (track_id),
  CHECK ((status = 'submitted') = (submitted_at IS NOT NULL))
);
CREATE INDEX submissions_gallery_idx ON submissions (event_id, status, track_id);
CREATE INDEX submissions_search_idx ON submissions USING gin (search);
CREATE INDEX submissions_tags_idx ON submissions USING gin (tech_tags);

CREATE TABLE uploads (
  id           text PRIMARY KEY,
  owner_id     text REFERENCES users (id) ON DELETE SET NULL,
  filename     text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size_bytes   int NOT NULL,
  sha256       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Weighted rubric. track_id NULL = applies to every track of the event.
CREATE TABLE criteria (
  id          text PRIMARY KEY,
  event_id    text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  track_id    text,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  weight      double precision NOT NULL CHECK (weight > 0),
  max_score   int NOT NULL DEFAULT 10 CHECK (max_score BETWEEN 1 AND 100),
  position    int NOT NULL DEFAULT 0,
  FOREIGN KEY (track_id, event_id) REFERENCES tracks (id, event_id) ON DELETE CASCADE
);
CREATE INDEX criteria_event_idx ON criteria (event_id, track_id);

-- Judges of an event. track_ids NULL = all tracks; otherwise the judge is
-- scoped to those tracks and may not read anything outside them.
CREATE TABLE event_judges (
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_ids  text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE judge_invites (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  track_ids  text[],
  note       text NOT NULL DEFAULT '',
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  used_by    text REFERENCES users (id) ON DELETE SET NULL,
  revoked_at timestamptz
);
CREATE INDEX judge_invites_event_idx ON judge_invites (event_id);

CREATE TABLE conflicts (
  event_id      text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  judge_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  submission_id text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  reason        text NOT NULL DEFAULT '',
  created_by    text REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (judge_id, submission_id)
);

CREATE TABLE assignments (
  id            text PRIMARY KEY,
  event_id      text NOT NULL,
  judge_id      text NOT NULL,
  submission_id text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted')),
  created_by    text REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (judge_id, submission_id),
  FOREIGN KEY (event_id, judge_id) REFERENCES event_judges (event_id, user_id) ON DELETE CASCADE
);
-- Supports the isolation predicate WHERE judge_id = auth.uid.
CREATE INDEX assignments_judge_idx ON assignments (judge_id, event_id);
CREATE INDEX assignments_submission_idx ON assignments (submission_id);

CREATE TABLE ballots (
  assignment_id text PRIMARY KEY REFERENCES assignments (id) ON DELETE CASCADE,
  event_id      text NOT NULL,
  judge_id      text NOT NULL,
  submission_id text NOT NULL,
  comment       text NOT NULL DEFAULT '',
  raw_total     double precision,
  submitted_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ballots_judge_idx ON ballots (judge_id, event_id);
CREATE INDEX ballots_event_idx ON ballots (event_id);

CREATE TABLE scores (
  assignment_id text NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  criterion_id  text NOT NULL REFERENCES criteria (id) ON DELETE CASCADE,
  judge_id      text NOT NULL,
  event_id      text NOT NULL,
  value         double precision NOT NULL CHECK (value >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, criterion_id)
);
CREATE INDEX scores_judge_idx ON scores (judge_id, event_id);

CREATE TABLE pairwise_votes (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  judge_id   text NOT NULL,
  winner_id  text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  loser_id   text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (winner_id <> loser_id),
  FOREIGN KEY (event_id, judge_id) REFERENCES event_judges (event_id, user_id) ON DELETE CASCADE
);
CREATE INDEX pairwise_event_idx ON pairwise_votes (event_id);
CREATE INDEX pairwise_judge_idx ON pairwise_votes (judge_id, event_id);

-- Full snapshot of each normalization run (per-judge stats + per-ballot values)
-- so every published ranking can be re-derived and audited later.
CREATE TABLE normalization_runs (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  config     jsonb NOT NULL,
  outcome    jsonb NOT NULL
);
CREATE INDEX normalization_runs_event_idx ON normalization_runs (event_id, created_at DESC);

-- Public projection of a published run: no per-judge data.
CREATE TABLE published_results (
  event_id         text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  submission_id    text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  run_id           text NOT NULL REFERENCES normalization_runs (id) ON DELETE CASCADE,
  rank             int NOT NULL,
  normalized_score double precision NOT NULL,
  raw_mean         double precision NOT NULL,
  judge_count      int NOT NULL,
  pairwise_rank    int,
  published_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, submission_id)
);

CREATE TABLE votes (
  id            text PRIMARY KEY,
  event_id      text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  submission_id text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  voter_key     text NOT NULL,
  user_id       text REFERENCES users (id) ON DELETE SET NULL,
  email_hash    text,
  ip_hash       text NOT NULL,
  ua_hash       text,
  votes         int NOT NULL CHECK (votes >= 1),
  status        text NOT NULL DEFAULT 'counted' CHECK (status IN ('counted', 'flagged', 'rejected')),
  flag_reason   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Duplicate detection: one row per voter per project.
  UNIQUE (event_id, voter_key, submission_id)
);
CREATE INDEX votes_ip_idx ON votes (event_id, ip_hash);
CREATE INDEX votes_submission_idx ON votes (submission_id, status);

CREATE TABLE vote_email_codes (
  id          text PRIMARY KEY,
  event_id    text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  email_hash  text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vote_email_codes_lookup_idx ON vote_email_codes (event_id, email_hash);

-- Local mail outbox: the platform never talks to an external email API.
CREATE TABLE outbox (
  id         text PRIMARY KEY,
  to_email   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id            text PRIMARY KEY,
  submission_id text NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  event_id      text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  hidden_at     timestamptz,
  hidden_by     text REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX comments_submission_idx ON comments (submission_id, created_at);

CREATE TABLE webhooks (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  url        text NOT NULL,
  secret     text NOT NULL,
  events     text[] NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_by text REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id              text PRIMARY KEY,
  webhook_id      text NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        int NOT NULL DEFAULT 0,
  last_status     int,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (status, next_attempt_at);

-- Signed, publicly verifiable records (judge participation, certificates).
CREATE TABLE records (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    text REFERENCES users (id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('judge_participation', 'participant', 'winner')),
  payload    jsonb NOT NULL,
  signature  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (event_id, user_id, kind)
);

-- Tamper-evident audit trail. `seq` and `hash` are assigned by trigger
-- (see 002_security.sql); the application role may only INSERT and SELECT.
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  seq         bigint NOT NULL UNIQUE,
  event_id    text,
  actor_id    text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  summary     text NOT NULL DEFAULT '',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  prev_hash   text NOT NULL,
  hash        text NOT NULL
);
CREATE INDEX audit_log_event_idx ON audit_log (event_id, seq DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action);
