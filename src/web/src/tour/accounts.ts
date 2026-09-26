/**
 * Seeded demo accounts and event slugs used by the guided demo.
 * The password matches `fixtures.json` (`defaultPassword`) and the login page.
 */
export const DEMO_PASSWORD = "dogfood-demo-2026";

export const ACCOUNTS = {
  organizer: "organizer@dogfood.local",
  participant: "participant@dogfood.local",
  judge: "judge.a@dogfood.local",
  admin: "admin@dogfood.local",
  visitor: "visitor@dogfood.local",
} as const;

/** Event slugs shipped in the seed data. */
export const SLUGS = {
  /** evt_01 — in judging, open single voting live. */
  judging: "sample-hack-2026",
  /** evt_02 — submissions open, participant owns a team. */
  open: "autumn-build-week",
  /** evt_03 — archived with published results and issued records. */
  archived: "spring-hack-2026",
  /** evt_04 — private draft owned by organizer2 (admins can manage it). */
  draft: "winter-jam-2027",
} as const;

/** A few seeded submission ids the demo links to directly. */
export const SUBMISSIONS = {
  /** evt_01 project with comments and votes. */
  commented: "sub_01_08",
  /** evt_01 first project. */
  first: "sub_01_01",
} as const;
