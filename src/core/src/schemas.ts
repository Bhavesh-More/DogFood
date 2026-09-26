/**
 * Request schemas shared by the API (authoritative validation) and the web
 * client (instant form feedback). The OpenAPI document is generated from the
 * same schemas, so the spec can never drift from what the server enforces.
 */
import { z } from "zod";
import { VOTING_MODES, VOTING_STYLES } from "./voting";

/** ISO-8601 instant that MUST carry an explicit zone (Z or ±hh:mm). */
export const utcInstant = z
  .string()
  .trim()
  .refine((v) => /(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), {
    message: "Must be an ISO-8601 timestamp with an explicit timezone, e.g. 2026-09-28T18:00:00Z",
  })
  .transform((v) => new Date(v).toISOString());

/** Only http(s) links are accepted — blocks javascript:, data: and friends. */
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be an http(s) URL" },
  );

/** Uploaded media is served from our own origin under /uploads/. */
export const mediaUrl = z.union([
  httpUrl,
  z.string().regex(/^\/uploads\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif)$/, "Invalid upload path"),
]);

const optionalUrl = z.union([httpUrl, z.literal("")]).optional();

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerInput = z.object({
  email,
  password: z.string().min(8, "At least 8 characters").max(200),
  name: z.string().trim().min(1).max(80),
  intent: z.enum(["participant", "visitor"]).default("participant"),
});

export const loginInput = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "3–48 chars: lowercase letters, digits, dashes");

export const normalizationSettings = z.object({
  targetMean: z.number().min(0).max(100).default(70),
  targetSd: z.number().min(0).max(50).default(15),
  minSampleSize: z.number().int().min(1).max(50).default(5),
});

/** Event fields without defaults — used for PATCH so omitted keys stay untouched. */
const eventShape = {
  slug,
  name: z.string().trim().min(3).max(120),
  tagline: z.string().trim().max(200),
  description: z.string().max(20_000),
  rules: z.string().max(20_000),
  location: z.string().trim().max(120),
  startsAt: utcInstant,
  submissionDeadline: utcInstant,
  judgingEndsAt: utcInstant.nullable(),
  votingOpensAt: utcInstant.nullable(),
  votingClosesAt: utcInstant.nullable(),
  minTeamSize: z.number().int().min(1).max(10),
  maxTeamSize: z.number().int().min(1).max(10),
  votingMode: z.enum(VOTING_MODES as [string, ...string[]]),
  votingStyle: z.enum(VOTING_STYLES as [string, ...string[]]),
  /** Single style: projects each voter may back. Quadratic: credit budget. */
  quadraticCredits: z.number().int().min(1).max(1000),
  reviewsPerSubmission: z.number().int().min(1).max(10),
  normalization: normalizationSettings,
};

const eventFields = {
  ...eventShape,
  tagline: eventShape.tagline.default(""),
  description: eventShape.description.default(""),
  rules: eventShape.rules.default(""),
  location: eventShape.location.default("Online"),
  judgingEndsAt: eventShape.judgingEndsAt.default(null),
  votingOpensAt: eventShape.votingOpensAt.default(null),
  votingClosesAt: eventShape.votingClosesAt.default(null),
  minTeamSize: eventShape.minTeamSize.default(1),
  maxTeamSize: eventShape.maxTeamSize.default(4),
  votingMode: eventShape.votingMode.default("off"),
  votingStyle: eventShape.votingStyle.default("single"),
  quadraticCredits: eventShape.quadraticCredits.default(25),
  reviewsPerSubmission: eventShape.reviewsPerSubmission.default(3),
  normalization: normalizationSettings.default({ targetMean: 70, targetSd: 15, minSampleSize: 5 }),
};

function checkEventWindows(
  e: {
    startsAt?: string;
    submissionDeadline?: string;
    votingOpensAt?: string | null;
    votingClosesAt?: string | null;
    minTeamSize?: number;
    maxTeamSize?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (e.startsAt && e.submissionDeadline && e.submissionDeadline <= e.startsAt) {
    ctx.addIssue({
      code: "custom",
      path: ["submissionDeadline"],
      message: "Deadline must be after the start",
    });
  }
  if (e.votingOpensAt && e.votingClosesAt && e.votingClosesAt <= e.votingOpensAt) {
    ctx.addIssue({
      code: "custom",
      path: ["votingClosesAt"],
      message: "Voting must close after it opens",
    });
  }
  if (Boolean(e.votingOpensAt) !== Boolean(e.votingClosesAt)) {
    ctx.addIssue({
      code: "custom",
      path: ["votingClosesAt"],
      message: "Set both voting open and close times, or neither",
    });
  }
  if (e.minTeamSize && e.maxTeamSize && e.minTeamSize > e.maxTeamSize) {
    ctx.addIssue({ code: "custom", path: ["minTeamSize"], message: "Min team size exceeds max" });
  }
}

export const eventInput = z.object(eventFields).superRefine(checkEventWindows);
export const eventPatch = z.object(eventShape).partial().superRefine(checkEventWindows);

const trackShape = {
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000),
};
export const trackInput = z.object({ ...trackShape, description: trackShape.description.default("") });
export const trackPatch = z.object(trackShape).partial();

const prizeShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  value: z.string().trim().max(60),
  trackId: z.string().nullable(),
};
export const prizeInput = z.object({
  ...prizeShape,
  description: prizeShape.description.default(""),
  value: prizeShape.value.default(""),
  trackId: prizeShape.trackId.default(null),
});
export const prizePatch = z.object(prizeShape).partial();

export const QUESTION_KINDS = ["text", "textarea", "url", "select", "boolean"] as const;

const questionShape = {
  label: z.string().trim().min(1).max(200),
  help: z.string().max(500),
  kind: z.enum(QUESTION_KINDS),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(20),
};
export const questionInput = z
  .object({
    ...questionShape,
    help: questionShape.help.default(""),
    kind: questionShape.kind.default("text"),
    required: questionShape.required.default(false),
    options: questionShape.options.default([]),
  })
  .refine((q) => q.kind !== "select" || q.options.length >= 2, {
    message: "Select questions need at least two options",
    path: ["options"],
  });
export const questionPatch = z.object(questionShape).partial();

const criterionShape = {
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000),
  weight: z.number().gt(0).max(100),
  maxScore: z.number().int().min(1).max(100),
  trackId: z.string().nullable(),
};
export const criterionInput = z.object({
  ...criterionShape,
  description: criterionShape.description.default(""),
  maxScore: criterionShape.maxScore.default(10),
  trackId: criterionShape.trackId.default(null),
});
export const criterionPatch = z.object(criterionShape).partial();

export const teamInput = z.object({
  name: z.string().trim().min(2).max(60),
});

export const techTag = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9+#.\- ]{0,23}$/, "Tags: up to 24 chars");

export const submissionDraft = z.object({
  title: z.string().trim().max(120).optional(),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().max(20_000).optional(),
  trackId: z.string().nullable().optional(),
  repoUrl: optionalUrl,
  demoVideoUrl: optionalUrl,
  liveUrl: optionalUrl,
  thumbnailUrl: z.union([mediaUrl, z.literal("")]).optional(),
  gallery: z.array(mediaUrl).max(8).optional(),
  techTags: z.array(techTag).max(12).optional(),
  answers: z.record(z.string(), z.union([z.string().max(5000), z.boolean()])).optional(),
});

export const scoreInput = z.object({
  scores: z.record(z.string(), z.number().min(0).max(100)),
  comment: z.string().max(5000).default(""),
  /** `true` locks the ballot as submitted; `false` saves progress. */
  submit: z.boolean().default(false),
});

export const pairwiseInput = z.object({
  winnerId: z.string().min(1),
  loserId: z.string().min(1),
});

export const judgeInviteInput = z.object({
  trackIds: z.array(z.string()).default([]),
  note: z.string().max(200).default(""),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(24 * 7),
});

export const conflictInput = z.object({
  judgeId: z.string().min(1),
  submissionId: z.string().min(1),
  reason: z.string().max(300).default("Declared conflict"),
});

export const assignmentRunInput = z.object({
  reviewsPerSubmission: z.number().int().min(1).max(10).optional(),
  maxPerJudge: z.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().default(false),
});

export const manualAssignmentInput = z.object({
  judgeId: z.string().min(1),
  submissionId: z.string().min(1),
});

export const eligibilityInput = z.object({
  eligibility: z.enum(["pending", "eligible", "ineligible"]),
  note: z.string().max(500).default(""),
});

export const extensionInput = z.object({
  until: utcInstant.nullable(),
  reason: z.string().trim().min(3).max(300),
});

export const voteInput = z.object({
  votes: z.number().int().min(0).max(100).default(1),
  email: email.optional(),
  code: z.string().trim().max(12).optional(),
});

export const emailCodeRequest = z.object({ email });

export const commentInput = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const roleChangeInput = z.object({
  role: z.enum(["visitor", "participant", "judge", "organizer", "admin"]),
});

export const apiTokenInput = z.object({
  label: z.string().trim().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const ANNOUNCEMENT_AUDIENCES = ["everyone", "participants", "judges"] as const;

const announcementShape = {
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  pinned: z.boolean(),
};
export const announcementInput = z.object({
  ...announcementShape,
  audience: announcementShape.audience.default("everyone"),
  pinned: announcementShape.pinned.default(false),
});
export const announcementPatch = z.object(announcementShape).partial();

export const WEBHOOK_EVENTS = [
  "announcement.published",
  "submission.submitted",
  "submission.unsubmitted",
  "team.member_joined",
  "judging.ballot_submitted",
  "judging.assignments_created",
  "results.normalized",
  "results.published",
  "vote.cast",
] as const;

export const webhookInput = z.object({
  url: httpUrl,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  active: z.boolean().default(true),
});

export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type EventInput = z.infer<typeof eventInput>;
export type EventPatch = z.infer<typeof eventPatch>;
export type TrackInput = z.infer<typeof trackInput>;
export type PrizeInput = z.infer<typeof prizeInput>;
export type QuestionInput = z.infer<typeof questionInput>;
export type CriterionInput = z.infer<typeof criterionInput>;
export type SubmissionDraft = z.infer<typeof submissionDraft>;
export type ScoreInput = z.infer<typeof scoreInput>;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
