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

/** Public profile shown to other users (never carries an email address). */
export interface UserProfileDto {
  id: string;
  name: string;
  role: Role;
  headline: string;
  bio: string;
  /** Participant tech stack (lowercased tags). */
  techStack: string[];
  /** Judge qualifications / experience. */
  qualifications: string;
  links: { website: string; github: string; linkedin: string };
  createdAt: string;
  isSelf: boolean;
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
  /** Non-null while the team advertises open spots in the team finder. */
  lookingFor: string | null;
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

export interface AnnouncementDto {
  id: string;
  eventId: string;
  title: string;
  body: string;
  audience: "everyone" | "participants" | "judges";
  pinned: boolean;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind = "announcement" | "assignment" | "invite" | "team_request";

export interface NotificationDto {
  id: string;
  eventId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsDto {
  items: NotificationDto[];
  unread: number;
}

export interface TeamJoinRequestDto {
  userId: string;
  name: string;
  skills: string[];
  note: string;
  createdAt: string;
}

export interface TeamFinderDto {
  /** Whether new posts and joins are still possible (roster open). */
  open: boolean;
  me: { onTeam: boolean; posted: boolean; canPost: boolean };
  seekers: { userId: string; name: string; skills: string[]; note: string; updatedAt: string }[];
  teams: { teamId: string; name: string; members: string[]; openSpots: number; lookingFor: string }[];
  /** Pending joins for the viewer's own team (empty when they have no team). */
  requests: TeamJoinRequestDto[];
}

/* ---------------------------------- AI (optional sidecar) ----------------- */

export interface AiStatusDto {
  enabled: boolean;
  service: "disabled" | "up" | "down";
  device: string;
  classifierBackend: string;
  generatorBackend: string;
  classifierModel: string;
  summaryModel: string;
  feedbackModel: string;
}

export interface AiClassificationDto {
  submissionId: string;
  tags: string[];
  primaryTag: string;
  confidence: number;
  source: string;
  model: string;
  updatedAt: string;
}

export interface AiExpertiseDto {
  judgeId: string;
  tags: string[];
  source: string;
  model: string;
}

export interface AiAffinityDto {
  judgeId: string;
  submissionId: string;
  score: number;
}

export interface AiMatrixDto {
  projects: AiClassificationDto[];
  judges: AiExpertiseDto[];
  pairs: AiAffinityDto[];
}

export interface AiSummaryDto {
  enabled: boolean;
  submissionId: string;
  summary: string | null;
  tags: string[];
  primaryTag: string | null;
  model: string | null;
  source: string | null;
  generatedAt: string | null;
}

export interface AiFeedbackDto {
  assignmentId: string;
  draft: string;
  model: string;
  source: string;
  generatedAt: string;
}
