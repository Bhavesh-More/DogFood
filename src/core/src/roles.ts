/**
 * Five-level role model and the capability matrix derived from it.
 *
 * Roles are ordered by privilege for display ("level"), but capabilities are
 * NOT strictly inherited: a judge must not be able to form a team (conflict of
 * interest) and an organizer must not be able to score ballots unless they are
 * also invited as a judge for that event. The matrix below is the single
 * source of truth used by API guards and by the UI to decide what to show.
 */

export const ROLES = ["visitor", "participant", "judge", "organizer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LEVEL: Record<Role, number> = {
  visitor: 0,
  participant: 1,
  judge: 2,
  organizer: 3,
  admin: 4,
};

export const ROLE_LABEL: Record<Role, string> = {
  visitor: "Visitor",
  participant: "Participant",
  judge: "Judge",
  organizer: "Organizer",
  admin: "Admin",
};

export const CAPABILITIES = [
  "gallery:read",
  "vote:cast",
  "comment:write",
  "event:register",
  "team:manage",
  "submission:write",
  "judging:score",
  "event:create",
  "event:manage",
  "users:manage",
  "audit:system",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<Role, readonly Capability[]> = {
  visitor: ["gallery:read", "vote:cast", "comment:write"],
  participant: [
    "gallery:read",
    "vote:cast",
    "comment:write",
    "event:register",
    "team:manage",
    "submission:write",
  ],
  judge: ["gallery:read", "vote:cast", "comment:write", "judging:score"],
  organizer: ["gallery:read", "comment:write", "event:create", "event:manage"],
  admin: [
    "gallery:read",
    "comment:write",
    "event:create",
    "event:manage",
    "users:manage",
    "audit:system",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Capability check for an authenticated role; anonymous callers are `null`. */
export function can(role: Role | null, capability: Capability): boolean {
  if (role === null) return capability === "gallery:read" || capability === "vote:cast";
  return MATRIX[role].includes(capability);
}

export function capabilitiesOf(role: Role | null): Capability[] {
  return CAPABILITIES.filter((c) => can(role, c));
}

export function atLeast(role: Role | null, minimum: Role): boolean {
  if (role === null) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

/** Role matrix rendered in docs and in the admin UI. */
export function roleMatrix(): { role: Role; capabilities: Record<Capability, boolean> }[] {
  return ROLES.map((role) => ({
    role,
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, can(role, c)])) as Record<
      Capability,
      boolean
    >,
  }));
}
