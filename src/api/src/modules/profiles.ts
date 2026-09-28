import { profileInput, type Role, type UserProfileDto } from "@dogfood/core";
import { one } from "../db/pool";
import { audit } from "../lib/audit";
import { notFound } from "../lib/errors";
import { route } from "../http/route";

/**
 * Public profiles. A profile never carries an email address, and any signed-in
 * user may read another's (a team captain vetting a join request, for example).
 * Only the owner can edit theirs.
 */
interface ProfileRow {
  id: string;
  name: string;
  role: Role;
  headline: string;
  bio: string;
  tech_stack: string[];
  qualifications: string;
  links: Record<string, string> | null;
  created_at: string;
}

const PROFILE_SELECT = `SELECT id, name, role, headline, bio, tech_stack, qualifications,
         coalesce(links, '{}'::jsonb) AS links, created_at
    FROM users`;

function toProfile(row: ProfileRow, isSelf: boolean): UserProfileDto {
  const links = row.links ?? {};
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    headline: row.headline,
    bio: row.bio,
    techStack: row.tech_stack ?? [],
    qualifications: row.qualifications,
    links: { website: links.website ?? "", github: links.github ?? "", linkedin: links.linkedin ?? "" },
    createdAt: row.created_at,
    isSelf,
  };
}

export const profileRoutes = [
  route({
    method: "get",
    path: "/api/profile/me",
    summary: "Your profile",
    tags: ["Profile"],
    auth: "user",
    async handler({ user, tx }) {
      return tx(async (t): Promise<UserProfileDto> => {
        const row = await one<ProfileRow>(t, `${PROFILE_SELECT} WHERE id = $1`, [user.id]);
        if (!row) throw notFound("User");
        return toProfile(row, true);
      });
    },
  }),

  route({
    method: "put",
    path: "/api/profile/me",
    summary: "Update your profile (headline, bio, tech stack, qualifications, links)",
    tags: ["Profile"],
    auth: "user",
    body: profileInput,
    async handler({ actor, body, user, tx }) {
      return tx(async (t): Promise<UserProfileDto> => {
        await t.query(
          `UPDATE users SET headline = $2, bio = $3, tech_stack = $4, qualifications = $5, links = $6
            WHERE id = $1`,
          [user.id, body.headline, body.bio, [...new Set(body.techStack)], body.qualifications, JSON.stringify(body.links)],
        );
        await audit(t, actor, {
          action: "user.profile_updated",
          entityType: "user",
          entityId: user.id,
          summary: `${user.name} updated their profile`,
        });
        const row = (await one<ProfileRow>(t, `${PROFILE_SELECT} WHERE id = $1`, [user.id]))!;
        return toProfile(row, true);
      });
    },
  }),

  route({
    method: "get",
    path: "/api/users/:userId/profile",
    summary: "Another user's public profile (no email)",
    tags: ["Profile"],
    auth: "user",
    async handler({ params, user, tx }) {
      return tx(async (t): Promise<UserProfileDto> => {
        const row = await one<ProfileRow>(t, `${PROFILE_SELECT} WHERE id = $1 AND disabled_at IS NULL`, [params.userId!]);
        if (!row) throw notFound("User");
        return toProfile(row, row.id === user.id);
      });
    },
  }),
];
