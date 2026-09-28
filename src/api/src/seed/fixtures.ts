import { z } from "zod";

/**
 * `fixtures.json` format (dogfood.fixtures.v1).
 *
 * Timestamps may be absolute ISO-8601 instants or relative to seed time:
 * "now", "now-6h", "now+3d", "now-1d12h", "now+45m". Relative times keep the
 * demo meaningful whenever the stack is started (e.g. one event is always
 * accepting submissions and another is always in judging), while every id,
 * name, score and vote stays deterministic.
 */
const RELATIVE = /^now(?:([+-])((?:\d+[dhm])+))?$/;

export function resolveTime(value: string, now: number): string {
  const m = value.match(RELATIVE);
  if (!m) {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) throw new Error(`Invalid fixture time: ${value}`);
    return new Date(ms).toISOString();
  }
  let offset = 0;
  if (m[2]) {
    for (const part of m[2].matchAll(/(\d+)([dhm])/g)) {
      const n = Number(part[1]);
      offset += n * (part[2] === "d" ? 86_400_000 : part[2] === "h" ? 3_600_000 : 60_000);
    }
  }
  return new Date(now + (m[1] === "-" ? -offset : offset)).toISOString();
}

const time = z.string().min(3);
const id = z.string().regex(/^[a-z]+_[a-z0-9_]+$/i, "ids look like usr_ada or evt_01");

export const fixtureUser = z.object({
  id,
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["visitor", "participant", "judge", "organizer", "admin"]),
  password: z.string().min(8).optional(),
  headline: z.string().default(""),
  bio: z.string().default(""),
  techStack: z.array(z.string()).default([]),
  qualifications: z.string().default(""),
  links: z.record(z.string(), z.string()).default({}),
});

export const fixtureSubmission = z.object({
  id,
  title: z.string(),
  tagline: z.string().default(""),
  description: z.string().default(""),
  trackId: z.string().nullable().default(null),
  repoUrl: z.string().default(""),
  demoVideoUrl: z.string().default(""),
  liveUrl: z.string().default(""),
  thumbnailUrl: z.string().default(""),
  techTags: z.array(z.string()).default([]),
  answers: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
  status: z.enum(["draft", "submitted"]).default("submitted"),
  submittedAt: time.optional(),
  eligibility: z.enum(["pending", "eligible", "ineligible"]).default("eligible"),
  eligibilityNote: z.string().default(""),
  /** Latent project quality in [0, 1] driving generated ballots, pairwise and votes. */
  quality: z.number().min(0).max(1).default(0.5),
});

export const fixtureTeam = z.object({
  id,
  name: z.string(),
  members: z.array(z.string()).min(1),
  extensionUntil: time.optional(),
  submission: fixtureSubmission.optional(),
});

export const fixtureJudgeProfile = z.object({
  /** Points added to every criterion score (negative = strict). */
  leniency: z.number().default(0),
  /** Multiplier on the quality signal (below 1 = compresses the range). */
  spread: z.number().default(1),
  /** Fraction of assignments with a submitted ballot. */
  completion: z.number().min(0).max(1).default(1),
});

export const fixtureEvent = z.object({
  id,
  slug: z.string(),
  name: z.string(),
  tagline: z.string().default(""),
  description: z.string().default(""),
  rules: z.string().default(""),
  location: z.string().default("Online"),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  startsAt: time,
  submissionDeadline: time,
  judgingEndsAt: time.nullable().default(null),
  votingOpensAt: time.nullable().default(null),
  votingClosesAt: time.nullable().default(null),
  minTeamSize: z.number().int().default(1),
  maxTeamSize: z.number().int().default(4),
  votingMode: z.enum(["off", "open", "email", "authenticated"]).default("off"),
  votingStyle: z.enum(["single", "quadratic"]).default("single"),
  voteBudget: z.number().int().default(3),
  reviewsPerSubmission: z.number().int().default(3),
  normalization: z
    .object({ targetMean: z.number(), targetSd: z.number(), minSampleSize: z.number().int() })
    .default({ targetMean: 70, targetSd: 15, minSampleSize: 5 }),
  organizers: z.array(z.string()).default([]),
  registrations: z.array(z.string()).default([]),
  tracks: z.array(z.object({ id, name: z.string(), description: z.string().default("") })).default([]),
  prizes: z
    .array(z.object({ name: z.string(), description: z.string().default(""), value: z.string().default(""), trackId: z.string().nullable().default(null) }))
    .default([]),
  questions: z
    .array(
      z.object({
        id,
        label: z.string(),
        help: z.string().default(""),
        kind: z.enum(["text", "textarea", "url", "select", "boolean"]).default("text"),
        required: z.boolean().default(false),
        options: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  criteria: z
    .array(
      z.object({
        id,
        name: z.string(),
        description: z.string().default(""),
        weight: z.number().positive(),
        maxScore: z.number().int().positive().default(10),
        trackId: z.string().nullable().default(null),
      }),
    )
    .default([]),
  judges: z.array(z.object({ userId: z.string(), trackIds: z.array(z.string()).nullable().default(null) })).default([]),
  teams: z.array(fixtureTeam).default([]),
  judging: z
    .object({
      assign: z.boolean().default(false),
      noise: z.number().min(0).default(0.6),
      judgeProfiles: z.record(z.string(), fixtureJudgeProfile).default({}),
      pairwise: z.object({ judges: z.array(z.string()), comparisonsPerJudge: z.number().int().min(0) }).optional(),
      conflicts: z.array(z.object({ judgeId: z.string(), submissionId: z.string(), reason: z.string() })).default([]),
    })
    .default({ assign: false, noise: 0.6, judgeProfiles: {}, conflicts: [] }),
  votes: z
    .object({
      voters: z.number().int().min(0).default(0),
      perVoter: z.number().int().min(1).default(2),
      sybil: z.object({ submissionId: z.string(), voters: z.number().int().min(1) }).optional(),
    })
    .optional(),
  comments: z.array(z.object({ submissionId: z.string(), userId: z.string(), body: z.string(), at: time.optional() })).default([]),
  pendingJudgeInvites: z.array(z.object({ note: z.string(), trackIds: z.array(z.string()).default([]) })).default([]),
  publishResultsAt: time.optional(),
  issueRecords: z.boolean().default(false),
});

export const fixturesFile = z.object({
  format: z.literal("dogfood.fixtures.v1"),
  description: z.string().default(""),
  defaultPassword: z.string().min(8),
  users: z.array(fixtureUser),
  checkerSessions: z
    .array(z.object({ userId: z.string(), token: z.string().min(16), label: z.string().default("acceptance checker") }))
    .default([]),
  events: z.array(fixtureEvent),
});

export type Fixtures = z.output<typeof fixturesFile>;
export type FixtureEvent = z.output<typeof fixtureEvent>;
