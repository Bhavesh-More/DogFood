/**
 * Response DTOs shared by the API and the web client.
 * All timestamps are ISO-8601 UTC strings.
 */
import type { Role } from "./roles";
import type { EventPhase, EventStatus, TimelineStep } from "./timeline";
import type { VotingMode, VotingStyle } from "./voting";
import type { NormalizationMethod } from "./normalization";

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: unknown;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface SessionDto {
  user: UserDto | null;
  capabilities: string[];
  /** Server clock at response time — the UI shows countdowns against this. */
  serverTime: string;
}

export interface TrackDto {
  id: string;
  name: string;
  description: string;
  position: number;
}

export interface PrizeDto {
  id: string;
  name: string;
  description: string;
  value: string;
  trackId: string | null;
  position: number;
}

export interface QuestionDto {
  id: string;
  label: string;
  help: string;
  kind: "text" | "textarea" | "url" | "select" | "boolean";
  required: boolean;
  options: string[];
  position: number;
}

export interface EventSummaryDto {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  location: string;
  status: EventStatus;
  phase: EventPhase;
  startsAt: string;
  submissionDeadline: string;
  votingOpensAt: string | null;
  votingClosesAt: string | null;
  resultsPublishedAt: string | null;
  stats: { registrations: number; teams: number; submissions: number };
}

export interface EventDto extends EventSummaryDto {
  description: string;
  rules: string;
  judgingEndsAt: string | null;
  minTeamSize: number;
  maxTeamSize: number;
  votingMode: VotingMode;
  votingStyle: VotingStyle;
  quadraticCredits: number;
  reviewsPerSubmission: number;
  normalization: { targetMean: number; targetSd: number; minSampleSize: number };
  tracks: TrackDto[];
  prizes: PrizeDto[];
  questions: QuestionDto[];
  timeline: TimelineStep[];
  votingOpen: boolean;
  /** Relationship of the caller to this event. */
  viewer: {
    registered: boolean;
    teamId: string | null;
    isOrganizer: boolean;
    isJudge: boolean;
  };
}

export interface TeamMemberDto {
  userId: string;
  name: string;
  role: "captain" | "member";
  joinedAt: string;
}

export interface TeamDto {
  id: string;
  eventId: string;
  name: string;
  members: TeamMemberDto[];
  maxSize: number;
  deadlineExtensionUntil: string | null;
  submissionId: string | null;
}

export interface InviteDto {
  id: string;
  url: string;
  token?: string;
  expiresAt: string;
  usedAt: string | null;
}

export type SubmissionStatus = "draft" | "submitted";
export type Eligibility = "pending" | "eligible" | "ineligible";

export interface SubmissionDto {
  id: string;
  eventId: string;
  teamId: string;
  teamName: string;
  members: { userId: string; name: string }[];
  title: string;
  tagline: string;
  description: string;
  trackId: string | null;
  trackName: string | null;
  repoUrl: string;
  demoVideoUrl: string;
  liveUrl: string;
  thumbnailUrl: string;
  gallery: string[];
  techTags: string[];
  answers: Record<string, string | boolean>;
  status: SubmissionStatus;
  submittedAt: string | null;
  updatedAt: string;
  eligibility: Eligibility;
  eligibilityNote?: string;
  commentCount?: number;
}

export interface GalleryItemDto {
  id: string;
  title: string;
  tagline: string;
  thumbnailUrl: string;
  teamName: string;
  trackId: string | null;
  trackName: string | null;
  techTags: string[];
  submittedAt: string | null;
  commentCount: number;
  /** Present only after the voting window closes. */
  voteTally?: number;
  /** Present only after results are published. */
  rank?: number;
}

export interface CriterionDto {
  id: string;
  name: string;
  description: string;
  weight: number;
  maxScore: number;
  trackId: string | null;
  position: number;
}

export interface AssignmentDto {
  id: string;
  submissionId: string;
  submissionTitle: string;
  teamName: string;
  trackId: string | null;
  trackName: string | null;
  status: "pending" | "in_progress" | "submitted";
  updatedAt: string;
}

export interface BallotDto {
  assignmentId: string;
  scores: Record<string, number>;
  comment: string;
  submittedAt: string | null;
  rawTotal: number | null;
}

export interface JudgeProgressDto {
  judgeId: string;
  name: string;
  email: string;
  trackIds: string[] | null;
  assigned: number;
  submitted: number;
  inProgress: number;
}

export interface NormalizedResultDto {
  submissionId: string;
  title: string;
  teamName: string;
  trackId: string | null;
  trackName: string | null;
  judgeCount: number;
  rawMean: number;
  normalizedMean: number;
  normalizedSd: number;
  rank: number;
  rawRank: number;
  pairwiseRank?: number | null;
  voteTally?: number | null;
}

export interface JudgeStatDto {
  judgeId: string;
  name: string;
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  method: NormalizationMethod;
  bias: number;
}

export interface NormalizationRunDto {
  id: string;
  eventId: string;
  createdAt: string;
  createdBy: string | null;
  config: { targetMean: number; targetSd: number; minSampleSize: number; epsilon: number };
  globalMean: number;
  judges: JudgeStatDto[];
  results: NormalizedResultDto[];
  entries: {
    judgeId: string;
    submissionId: string;
    raw: number;
    z: number;
    normalized: number;
    method: NormalizationMethod;
  }[];
  spearmanRawVsNormalized: number;
  invariants: {
    judgeId: string;
    method: NormalizationMethod;
    normalizedMean: number;
    normalizedSd: number;
    expectedMean: number;
    expectedSd: number;
    holds: boolean;
  }[];
}

export interface AuditEntryDto {
  id: number;
  eventId: string | null;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  data: unknown;
  createdAt: string;
  hash: string;
}

export interface CommentDto {
  id: string;
  submissionId: string;
  authorName: string;
  body: string;
  createdAt: string;
  hidden: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
