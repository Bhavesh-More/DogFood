-- Team finder: a solo participant can ask to join a recruiting team. The
-- request is delivered to the team's captains as an in-app notification
-- (kind 'team_request') and puts the requester on the finder board so a
-- captain can invite them with the existing targeted-invite flow.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('announcement', 'assignment', 'invite', 'team_request'));
