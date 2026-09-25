import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  areResultsPublic,
  areVoteTalliesVisible,
  eligibilityInput,
  extensionInput,
  isBeforeDeadline,
  isVotingOpen,
  seededShuffle,
  submissionDraft,
  type GalleryItemDto,
  type Paginated,
  type SubmissionDto,
} from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { sha256Hex } from "../lib/crypto";
import { HttpError, deadlinePassed, forbidden, notFound, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor, AppContext } from "../http/context";
import { DEVICE_COOKIE, parseCookies } from "../http/middleware";
import { LIMITS } from "../http/rate-limit";
import { route } from "../http/route";
import { findEvent, isEventOrganizer, loadManagedEvent, loadVisibleEvent, type EventRow } from "./access";
import { eventTimes } from "./events";

export interface SubmissionRow {
  id: string;
  event_id: string;
  team_id: string;
  track_id: string | null;
  title: string;
  tagline: string;
  description: string;
  repo_url: string;
  demo_video_url: string;
  live_url: string;
  thumbnail_url: string;
  gallery: string[];
  tech_tags: string[];
  answers: Record<string, string | boolean>;
  status: "draft" | "submitted";
  submitted_at: string | null;
  eligibility: "pending" | "eligible" | "ineligible";
  eligibility_note: string;
  updated_at: string;
  team_name: string;
  track_name: string | null;
  deadline_extension_until: string | null;
}

const SUBMISSION_SELECT = `
  SELECT s.id, s.event_id, s.team_id, s.track_id, s.title, s.tagline, s.description, s.repo_url,
         s.demo_video_url, s.live_url, s.thumbnail_url, s.gallery, s.tech_tags, s.answers, s.status,
         s.submitted_at, s.eligibility, s.eligibility_note, s.updated_at,
         t.name AS team_name, tr.name AS track_name, t.deadline_extension_until
    FROM submissions s
    JOIN teams t ON t.id = s.team_id
    LEFT JOIN tracks tr ON tr.id = s.track_id`;

export async function loadSubmission(tx: Tx, id: string): Promise<SubmissionRow | null> {
  return one<SubmissionRow>(tx, `${SUBMISSION_SELECT} WHERE s.id = $1`, [id]);
}

export async function toSubmissionDto(tx: Tx, row: SubmissionRow, full: boolean): Promise<SubmissionDto> {
  const members = await many<{ userId: string; name: string }>(
    tx,
    `SELECT m.user_id AS "userId", u.name FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1 ORDER BY (m.role = 'captain') DESC, m.joined_at`,
    [row.team_id],
  );
  const comments = await one<{ n: number }>(
    tx,
    "SELECT count(*)::int AS n FROM comments WHERE submission_id = $1 AND hidden_at IS NULL",
    [row.id],
  );
  return {
    id: row.id,
    eventId: row.event_id,
    teamId: row.team_id,
    teamName: row.team_name,
    members,
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    trackId: row.track_id,
    trackName: row.track_name,
    repoUrl: row.repo_url,
    demoVideoUrl: row.demo_video_url,
    liveUrl: row.live_url,
    thumbnailUrl: row.thumbnail_url,
    gallery: row.gallery,
    techTags: row.tech_tags,
    answers: full ? row.answers : {},
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    eligibility: row.eligibility,
    ...(full ? { eligibilityNote: row.eligibility_note } : {}),
    commentCount: comments?.n ?? 0,
  };
}

async function isTeamMember(tx: Tx, teamId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  return (await one(tx, "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId])) !== null;
}

/** Server clock only. The request's Date header or any client value is never consulted. */
function assertBeforeDeadline(app: AppContext, event: EventRow, extensionUntil: string | null) {
  if (event.status !== "published") throw forbidden("This event is not accepting submissions", "EVENT_NOT_OPEN");
  if (!isBeforeDeadline(event.submission_deadline, app.now(), extensionUntil)) {
    throw deadlinePassed(extensionUntil && extensionUntil > event.submission_deadline ? extensionUntil : event.submission_deadline);
  }
}

async function loadTeamForWrite(tx: Tx, actor: Actor, teamId: string) {
  const team = await one<{ id: string; event_id: string; name: string; deadline_extension_until: string | null }>(
    tx,
    "SELECT id, event_id, name, deadline_extension_until FROM teams WHERE id = $1",
    [teamId],
  );
  if (!team) throw notFound("Team");
  if (!(await isTeamMember(tx, team.id, actor.user?.id))) {
    throw forbidden("Only members of this team can edit its submission", "NOT_TEAM_MEMBER");
  }
  const event = (await findEvent(tx, team.event_id))!;
  return { team, event };
}

type Draft = z.output<typeof submissionDraft>;

async function validateDraftRefs(tx: Tx, event: EventRow, draft: Draft) {
  if (draft.trackId) {
    const ok = await one(tx, "SELECT 1 FROM tracks WHERE id = $1 AND event_id = $2", [draft.trackId, event.id]);
    if (!ok) throw unprocessable("Unknown track", [{ path: "trackId", message: "Not a track of this event" }]);
  }
  if (draft.answers) {
    const ids = new Set(
      (await many<{ id: string }>(tx, "SELECT id FROM questions WHERE event_id = $1", [event.id])).map((q) => q.id),
    );
    const unknown = Object.keys(draft.answers).filter((k) => !ids.has(k));
    if (unknown.length) {
      throw unprocessable("Unknown questions", unknown.map((k) => ({ path: `answers.${k}`, message: "Unknown question" })));
    }
  }
}

/** Everything a submission needs before it can be locked in. */
async function completenessIssues(tx: Tx, event: EventRow, row: SubmissionRow) {
  const issues: { path: string; message: string }[] = [];
  if (row.title.trim().length < 3) issues.push({ path: "title", message: "Add a project name (3+ characters)" });
  if (row.description.trim().length < 20) issues.push({ path: "description", message: "Describe the project (20+ characters)" });
  if (!row.repo_url) issues.push({ path: "repoUrl", message: "Add the repository URL" });
  const trackCount = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM tracks WHERE event_id = $1", [event.id]);
  if ((trackCount?.n ?? 0) > 0 && !row.track_id) issues.push({ path: "trackId", message: "Choose a track" });
  const required = await many<{ id: string; label: string }>(
    tx,
    "SELECT id, label FROM questions WHERE event_id = $1 AND required",
    [event.id],
  );
  for (const q of required) {
    const a = row.answers[q.id];
    if (a === undefined || a === "" || a === false) issues.push({ path: `answers.${q.id}`, message: `Answer "${q.label}"` });
  }
  const size = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [row.team_id]);
  if ((size?.n ?? 0) < event.min_team_size) {
    issues.push({ path: "team", message: `Teams need at least ${event.min_team_size} members` });
  }
  return issues;
}

function viewerSeed(actor: Actor, cookieHeader: string | undefined): string {
  return actor.user?.id ?? parseCookies(cookieHeader)[DEVICE_COOKIE] ?? actor.ipHash;
}

const galleryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  track: z.string().max(64).optional(),
  tag: z.string().trim().toLowerCase().max(24).optional(),
  sort: z.enum(["recent", "title", "random", "rank"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(24),
});

const IMAGE_SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: "png", type: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", type: "image/gif", test: (b) => b.subarray(0, 6).toString("ascii").startsWith("GIF8") },
  {
    ext: "webp",
    type: "image/webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

export const submissionRoutes = [
  route({
    method: "get",
    path: "/api/teams/:teamId/submission",
    summary: "Your team's submission (draft or submitted), or null",
    tags: ["Submissions"],
    auth: "user",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const team = await one<{ id: string; event_id: string }>(t, "SELECT id, event_id FROM teams WHERE id = $1", [params.teamId]);
        if (!team) throw notFound("Team");
        const allowed =
          (await isTeamMember(t, team.id, actor.user?.id)) || (await isEventOrganizer(t, actor.user, team.event_id));
        if (!allowed) throw forbidden("Only the team and organizers can see this draft", "NOT_TEAM_MEMBER");
        const row = await one<SubmissionRow>(t, `${SUBMISSION_SELECT} WHERE s.team_id = $1`, [team.id]);
        return row ? toSubmissionDto(t, row, true) : null;
      });
    },
  }),

  route({
    method: "put",
    path: "/api/teams/:teamId/submission",
    summary: "Create or update your team's draft (locked at the server-side UTC deadline)",
    description:
      "Rejected with 403 DEADLINE_PASSED once the server clock passes the event deadline (or the team's extension). " +
      "Client-supplied time headers are ignored.",
    tags: ["Submissions"],
    auth: "submission:write",
    body: submissionDraft,
    rateLimit: { bucket: "write", spec: LIMITS.write },
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const { team, event } = await loadTeamForWrite(t, actor, params.teamId!);
        assertBeforeDeadline(app, event, team.deadline_extension_until);
        await validateDraftRefs(t, event, body);
        const existing = await one<{ id: string }>(t, "SELECT id FROM submissions WHERE team_id = $1 FOR UPDATE", [team.id]);
        const fields: Record<string, unknown> = {
          title: body.title,
          tagline: body.tagline,
          description: body.description,
          track_id: body.trackId,
          repo_url: body.repoUrl,
          demo_video_url: body.demoVideoUrl,
          live_url: body.liveUrl,
          thumbnail_url: body.thumbnailUrl,
          gallery: body.gallery ? JSON.stringify(body.gallery) : undefined,
          tech_tags: body.techTags ? [...new Set(body.techTags)] : undefined,
          answers: body.answers ? JSON.stringify(body.answers) : undefined,
        };
        const cols = Object.entries(fields).filter(([, v]) => v !== undefined);
        let id: string;
        if (existing) {
          id = existing.id;
          if (cols.length) {
            await t.query(
              `UPDATE submissions SET ${cols.map(([k], i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
              [id, ...cols.map(([, v]) => v)],
            );
          }
        } else {
          id = newId("sub");
          const all = [["id", id], ["event_id", event.id], ["team_id", team.id], ...cols] as [string, unknown][];
          await t.query(
            `INSERT INTO submissions (${all.map(([k]) => k).join(", ")}) VALUES (${all.map((_, i) => `$${i + 1}`).join(", ")})`,
            all.map(([, v]) => v),
          );
          await audit(t, actor, {
            eventId: event.id,
            action: "submission.created",
            entityType: "submission",
            entityId: id,
            summary: `Draft started by "${team.name}"`,
          });
        }
        return toSubmissionDto(t, (await loadSubmission(t, id))!, true);
      });
    },
  }),

  ...(["submit", "unsubmit"] as const).map((action) =>
    route({
      method: "post",
      path: `/api/submissions/:submissionId/${action}`,
      summary: action === "submit" ? "Lock in the submission (validated for completeness)" : "Return to draft (before the deadline)",
      tags: ["Submissions"],
      auth: "submission:write",
      async handler({ app, params, actor, tx }) {
        return tx(async (t) => {
          const row = await loadSubmission(t, params.submissionId!);
          if (!row) throw notFound("Submission");
          const { team, event } = await loadTeamForWrite(t, actor, row.team_id);
          assertBeforeDeadline(app, event, team.deadline_extension_until);
          if (action === "submit") {
            const issues = await completenessIssues(t, event, row);
            if (issues.length) throw unprocessable("The submission is incomplete", issues, "INCOMPLETE_SUBMISSION");
            await t.query(
              "UPDATE submissions SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE id = $1",
              [row.id],
            );
          } else {
            await t.query(
              "UPDATE submissions SET status = 'draft', submitted_at = NULL, updated_at = now() WHERE id = $1",
              [row.id],
            );
          }
          await audit(t, actor, {
            eventId: event.id,
            action: action === "submit" ? "submission.submitted" : "submission.unsubmitted",
            entityType: "submission",
            entityId: row.id,
            summary: `"${row.title || "Untitled"}" ${action === "submit" ? "submitted" : "returned to draft"} by ${actor.user!.name}`,
            data: { serverTime: new Date(app.now()).toISOString() },
          });
          await app.webhooks.emit(event.id, `submission.${action === "submit" ? "submitted" : "unsubmitted"}`, {
            submissionId: row.id,
            teamId: row.team_id,
          }, t);
          return toSubmissionDto(t, (await loadSubmission(t, row.id))!, true);
        });
      },
    }),
  ),

  route({
    method: "get",
    path: "/api/submissions/:submissionId",
    summary: "Project page. Public once submitted; drafts only for the team and organizers",
    tags: ["Submissions"],
    auth: "public",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const row = await loadSubmission(t, params.submissionId!);
        if (!row) throw notFound("Submission");
        const event = (await findEvent(t, row.event_id))!;
        const privileged =
          (await isTeamMember(t, row.team_id, actor.user?.id)) || (await isEventOrganizer(t, actor.user, row.event_id));
        const isPublic = row.status === "submitted" && event.status !== "draft" && row.eligibility !== "ineligible";
        if (!privileged && !isPublic) throw notFound("Submission");
        return toSubmissionDto(t, row, privileged);
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/gallery",
    summary: "Public project gallery with search, track/tag filters and pagination",
    description:
      "During an open voting window the default order is a stable per-viewer shuffle (position-bias control). " +
      "Vote tallies appear only after voting closes; ranks only after results are published.",
    tags: ["Gallery"],
    auth: "public",
    query: galleryQuery,
    async handler({ app, params, query, actor, req, tx }) {
      return tx(async (t): Promise<Paginated<GalleryItemDto> & { facets: { tags: { tag: string; count: number }[] }; order: string }> => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const now = app.now();
        const times = eventTimes(event);
        const where = ["s.event_id = $1", "s.status = 'submitted'", "s.eligibility <> 'ineligible'"];
        const args: unknown[] = [event.id];
        if (query.q) {
          args.push(query.q);
          const qi = args.length;
          args.push(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
          const li = args.length;
          where.push(`(s.search @@ websearch_to_tsquery('simple', $${qi}) OR s.title ILIKE $${li} OR t.name ILIKE $${li})`);
        }
        if (query.track) {
          args.push(query.track);
          where.push(`s.track_id = $${args.length}`);
        }
        if (query.tag) {
          args.push(query.tag);
          where.push(`$${args.length} = ANY (s.tech_tags)`);
        }
        const tallies = areVoteTalliesVisible(times, now);
        const resultsPublic = areResultsPublic(times, now);
        const rows = await many<{
          id: string;
          title: string;
          tagline: string;
          thumbnail_url: string;
          team_name: string;
          track_id: string | null;
          track_name: string | null;
          tech_tags: string[];
          submitted_at: string | null;
          comment_count: number;
          vote_tally: number;
          rank: number | null;
        }>(
          t,
          `SELECT s.id, s.title, s.tagline, s.thumbnail_url, t.name AS team_name, s.track_id, tr.name AS track_name,
                  s.tech_tags, s.submitted_at,
                  (SELECT count(*)::int FROM comments c WHERE c.submission_id = s.id AND c.hidden_at IS NULL) AS comment_count,
                  (SELECT coalesce(sum(v.votes), 0)::int FROM votes v WHERE v.submission_id = s.id AND v.status = 'counted') AS vote_tally,
                  pr.rank
             FROM submissions s
             JOIN teams t ON t.id = s.team_id
             LEFT JOIN tracks tr ON tr.id = s.track_id
             LEFT JOIN published_results pr ON pr.submission_id = s.id AND pr.event_id = s.event_id
            WHERE ${where.join(" AND ")}`,
          args,
        );
        const votingOpen = isVotingOpen(times, now);
        const order = query.sort ?? (votingOpen ? "random" : resultsPublic ? "rank" : "recent");
        let sorted: typeof rows;
        if (order === "random") sorted = seededShuffle(rows, `${event.id}:${viewerSeed(actor, req.get("cookie"))}`);
        else if (order === "title") sorted = [...rows].sort((a, b) => a.title.localeCompare(b.title));
        else if (order === "rank" && resultsPublic)
          sorted = [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.title.localeCompare(b.title));
        else sorted = [...rows].sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "") || a.id.localeCompare(b.id));

        const tagCounts = new Map<string, number>();
        for (const r of rows) for (const tag of r.tech_tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

        const start = (query.page - 1) * query.pageSize;
        return {
          items: sorted.slice(start, start + query.pageSize).map((r) => ({
            id: r.id,
            title: r.title,
            tagline: r.tagline,
            thumbnailUrl: r.thumbnail_url,
            teamName: r.team_name,
            trackId: r.track_id,
            trackName: r.track_name,
            techTags: r.tech_tags,
            submittedAt: r.submitted_at,
            commentCount: r.comment_count,
            ...(tallies ? { voteTally: r.vote_tally } : {}),
            ...(resultsPublic && r.rank !== null ? { rank: r.rank } : {}),
          })),
          total: rows.length,
          page: query.page,
          pageSize: query.pageSize,
          facets: {
            tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([tag, count]) => ({ tag, count })),
          },
          order,
        };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/submissions",
    summary: "All submissions incl. drafts and eligibility (organizers)",
    tags: ["Submissions"],
    auth: "event:manage",
    query: z.object({ status: z.enum(["draft", "submitted"]).optional() }),
    async handler({ params, query, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const rows = await many<SubmissionRow>(
          t,
          `${SUBMISSION_SELECT} WHERE s.event_id = $1 ${query.status ? "AND s.status = $2" : ""} ORDER BY s.status DESC, s.title`,
          query.status ? [event.id, query.status] : [event.id],
        );
        return Promise.all(rows.map((r) => toSubmissionDto(t, r, true)));
      });
    },
  }),

  route({
    method: "patch",
    path: "/api/submissions/:submissionId/eligibility",
    summary: "Mark a submission eligible or ineligible (ineligible projects are never judged)",
    tags: ["Submissions"],
    auth: "event:manage",
    body: eligibilityInput,
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const row = await loadSubmission(t, params.submissionId!);
        if (!row) throw notFound("Submission");
        await loadManagedEvent(t, actor, row.event_id);
        await t.query("UPDATE submissions SET eligibility = $2, eligibility_note = $3 WHERE id = $1", [row.id, body.eligibility, body.note]);
        if (body.eligibility === "ineligible") {
          await t.query("DELETE FROM assignments WHERE submission_id = $1 AND status <> 'submitted'", [row.id]);
        }
        await audit(t, actor, {
          eventId: row.event_id,
          action: "submission.eligibility_changed",
          entityType: "submission",
          entityId: row.id,
          summary: `"${row.title}" marked ${body.eligibility}${body.note ? `: ${body.note}` : ""}`,
          data: { from: row.eligibility, to: body.eligibility },
        });
        return toSubmissionDto(t, (await loadSubmission(t, row.id))!, true);
      });
    },
  }),

  route({
    method: "post",
    path: "/api/teams/:teamId/extension",
    summary: "Grant (or clear) a team-specific deadline extension — always audit-logged",
    tags: ["Submissions"],
    auth: "event:manage",
    body: extensionInput,
    async handler({ params, body, actor, tx }) {
      return tx(async (t) => {
        const team = await one<{ id: string; event_id: string; name: string; deadline_extension_until: string | null }>(
          t,
          "SELECT id, event_id, name, deadline_extension_until FROM teams WHERE id = $1",
          [params.teamId],
        );
        if (!team) throw notFound("Team");
        const event = await loadManagedEvent(t, actor, team.event_id);
        if (body.until && body.until <= event.submission_deadline) {
          throw unprocessable("An extension must end after the event deadline", undefined, "EXTENSION_TOO_EARLY");
        }
        await t.query("UPDATE teams SET deadline_extension_until = $2, extension_reason = $3 WHERE id = $1", [
          team.id,
          body.until,
          body.reason,
        ]);
        await audit(t, actor, {
          eventId: event.id,
          action: "deadline.override",
          entityType: "team",
          entityId: team.id,
          summary: body.until ? `Extension for "${team.name}" until ${body.until}: ${body.reason}` : `Extension for "${team.name}" cleared`,
          data: { from: team.deadline_extension_until, to: body.until, reason: body.reason },
        });
        return { teamId: team.id, deadlineExtensionUntil: body.until };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/uploads",
    summary: "Upload an image (PNG, JPEG, WebP or GIF, max 5 MB) for thumbnails and galleries",
    description: "Send the raw image bytes as the body with the image Content-Type. SVG is rejected (script risk).",
    tags: ["Submissions"],
    auth: "user",
    body: z.any(),
    rawBody: true,
    status: 201,
    rateLimit: { bucket: "upload", spec: LIMITS.upload },
    produces: "application/json",
    async handler({ app, req, user, tx }) {
      const buf = req.body as unknown;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        throw new HttpError(415, "UNSUPPORTED_MEDIA", "Send PNG, JPEG, WebP or GIF bytes with a matching Content-Type");
      }
      const kind = IMAGE_SIGNATURES.find((s) => s.test(buf));
      if (!kind) throw new HttpError(415, "UNSUPPORTED_MEDIA", "File content is not a supported image");
      const id = newId("upl");
      const filename = `${id.replace("upl_", "")}.${kind.ext}`;
      await mkdir(app.config.uploadDir, { recursive: true });
      await writeFile(path.join(app.config.uploadDir, filename), buf, { flag: "wx" });
      await tx((t) =>
        t.query(
          "INSERT INTO uploads (id, owner_id, filename, content_type, size_bytes, sha256) VALUES ($1, $2, $3, $4, $5, $6)",
          [id, user.id, filename, kind.type, buf.length, sha256Hex(buf)],
        ),
      );
      return { id, url: `/uploads/${filename}`, contentType: kind.type, size: buf.length };
    },
  }),
];
