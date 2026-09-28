-- Public user profiles: a headline, an about blurb, a tech stack (participants)
-- or qualifications (judges), and links. Email is never part of the profile,
-- and the API only ever returns these fields for another user.
ALTER TABLE users
  ADD COLUMN headline       text NOT NULL DEFAULT '' CHECK (char_length(headline) <= 120),
  ADD COLUMN bio            text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  ADD COLUMN tech_stack     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN qualifications text NOT NULL DEFAULT '' CHECK (char_length(qualifications) <= 1000),
  ADD COLUMN links          jsonb NOT NULL DEFAULT '{}'::jsonb;
