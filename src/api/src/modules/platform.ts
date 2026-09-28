import { z } from "zod";
import { criterionInput, email as emailSchema, eventInput, parseCsv, prizeInput, questionInput, trackInput } from "@dogfood/core";
import { many, one } from "../db/pool";
import { audit } from "../lib/audit";
import { hashPassword, randomToken } from "../lib/crypto";
import { conflict, unprocessable } from "../lib/errors";
import { newId } from "../lib/ids";
import { route } from "../http/route";
import { findEvent, loadManagedEvent, loadVisibleEvent } from "./access";

/**
 * Bulk import/export (T4). The export bundle is a superset of the import
 * format, so an event can be cloned: export → edit slug → import.
 */
export const eventBundle = z.object({
  format: z.literal("dogfood.event.v1").default("dogfood.event.v1"),
  event: eventInput,
  tracks: z.array(trackInput.extend({ ref: z.string().optional() })).default([]),
  prizes: z.array(prizeInput.extend({ trackRef: z.string().nullable().optional() })).default([]),
  questions: z.array(questionInput).default([]),
  criteria: z.array(criterionInput.extend({ trackRef: z.string().nullable().optional() })).default([]),
});

const registrationCsv = z.object({
  csv: z.string().min(1).max(500_000),
});

export const platformRoutes = [
  route({
    method: "get",
    path: "/api/events/:eventId/export.json",
    summary: "Export the full event bundle (configuration, teams, submissions, judges, assignments)",
    tags: ["Import & export"],
    auth: "event:manage",
    async handler({ params, actor, res, tx }) {
      const bundle = await tx(async (t) => {
        const e = await loadManagedEvent(t, actor, params.eventId!);
        const tracks = await many<{ id: string; name: string; description: string }>(t, "SELECT id, name, description FROM tracks WHERE event_id = $1 ORDER BY position", [e.id]);
        return {
          format: "dogfood.event.v1",
          exportedAt: new Date().toISOString(),
          event: {
            slug: e.slug,
            name: e.name,
            tagline: e.tagline,
            description: e.description,
            rules: e.rules,
            location: e.location,
            startsAt: e.starts_at,
            submissionDeadline: e.submission_deadline,
            judgingEndsAt: e.judging_ends_at,
            votingOpensAt: e.voting_opens_at,
            votingClosesAt: e.voting_closes_at,
            minTeamSize: e.min_team_size,
            maxTeamSize: e.max_team_size,
            votingMode: e.voting_mode,
            votingStyle: e.voting_style,
            quadraticCredits: e.vote_budget,
            reviewsPerSubmission: e.reviews_per_submission,
            normalization: { targetMean: e.norm_target_mean, targetSd: e.norm_target_sd, minSampleSize: e.norm_min_sample },
          },
          tracks: tracks.map((tr) => ({ ref: tr.id, name: tr.name, description: tr.description })),
          prizes: await many(t, `SELECT name, description, value, track_id AS "trackRef" FROM prizes WHERE event_id = $1 ORDER BY position`, [e.id]),
          questions: await many(t, "SELECT label, help, kind, required, options FROM questions WHERE event_id = $1 ORDER BY position", [e.id]),
          criteria: await many(t, `SELECT name, description, weight, max_score AS "maxScore", track_id AS "trackRef" FROM criteria WHERE event_id = $1 ORDER BY position`, [e.id]),
          teams: await many(
            t,
            `SELECT tm.name, array_agg(json_build_object('name', u.name, 'email', u.email, 'role', m.role)) AS members
               FROM teams tm JOIN team_members m ON m.team_id = tm.id JOIN users u ON u.id = m.user_id
              WHERE tm.event_id = $1 GROUP BY tm.id ORDER BY tm.name`,
            [e.id],
          ),
          submissions: await many(
            t,
            `SELECT s.id, tm.name AS team, s.title, s.tagline, s.description, s.track_id AS "trackRef", s.repo_url AS "repoUrl",
                    s.demo_video_url AS "demoVideoUrl", s.live_url AS "liveUrl", s.tech_tags AS "techTags", s.status,
                    s.submitted_at AS "submittedAt", s.eligibility, s.answers
               FROM submissions s JOIN teams tm ON tm.id = s.team_id WHERE s.event_id = $1 ORDER BY s.title`,
            [e.id],
          ),
          judges: await many(t, `SELECT u.name, u.email, j.track_ids AS "trackRefs" FROM event_judges j JOIN users u ON u.id = j.user_id WHERE j.event_id = $1`, [e.id]),
          assignments: await many(t, `SELECT u.email AS judge, a.submission_id AS "submissionId", a.status FROM assignments a JOIN users u ON u.id = a.judge_id WHERE a.event_id = $1`, [e.id]),
        };
      });
      res.setHeader("Content-Disposition", `attachment; filename="${bundle.event.slug}.dogfood.json"`);
      return bundle;
    },
  }),

  route({
    method: "post",
    path: "/api/events/import",
    summary: "Create a draft event from a bundle (configuration, tracks, prizes, questions, rubric)",
    tags: ["Import & export"],
    auth: "event:create",
    body: eventBundle,
    status: 201,
    async handler({ body, actor, user, tx }) {
      return tx(async (t) => {
        if (await findEvent(t, body.event.slug)) throw conflict("That slug is taken", "SLUG_TAKEN");
        const e = body.event;
        const id = newId("evt");
        await t.query(
          `INSERT INTO events (id, slug, name, tagline, description, rules, location, starts_at, submission_deadline,
                               judging_ends_at, voting_opens_at, voting_closes_at, min_team_size, max_team_size,
                               voting_mode, voting_style, vote_budget, reviews_per_submission,
                               norm_target_mean, norm_target_sd, norm_min_sample, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [
            id, e.slug, e.name, e.tagline, e.description, e.rules, e.location, e.startsAt, e.submissionDeadline,
            e.judgingEndsAt, e.votingOpensAt, e.votingClosesAt, e.minTeamSize, e.maxTeamSize, e.votingMode, e.votingStyle,
            e.quadraticCredits, e.reviewsPerSubmission, e.normalization.targetMean, e.normalization.targetSd,
            e.normalization.minSampleSize, user.id,
          ],
        );
        await t.query("INSERT INTO event_organizers (event_id, user_id) VALUES ($1, $2)", [id, user.id]);
        const trackIds = new Map<string, string>();
        for (const [i, tr] of body.tracks.entries()) {
          const tid = newId("trk");
          trackIds.set(tr.ref ?? tr.name, tid);
          await t.query("INSERT INTO tracks (id, event_id, name, description, position) VALUES ($1, $2, $3, $4, $5)", [tid, id, tr.name, tr.description, i]);
        }
        const ref = (r: string | null | undefined) => {
          if (!r) return null;
          const tid = trackIds.get(r);
          if (!tid) throw unprocessable(`Unknown track reference "${r}"`, undefined, "UNKNOWN_TRACK");
          return tid;
        };
        for (const [i, p] of body.prizes.entries()) {
          await t.query("INSERT INTO prizes (id, event_id, track_id, name, description, value, position) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
            newId("prz"), id, ref(p.trackRef ?? p.trackId), p.name, p.description, p.value, i,
          ]);
        }
        for (const [i, q] of body.questions.entries()) {
          await t.query("INSERT INTO questions (id, event_id, label, help, kind, required, options, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
            newId("qst"), id, q.label, q.help, q.kind, q.required, JSON.stringify(q.options), i,
          ]);
        }
        for (const [i, c] of body.criteria.entries()) {
          await t.query("INSERT INTO criteria (id, event_id, track_id, name, description, weight, max_score, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
            newId("crt"), id, ref(c.trackRef ?? c.trackId), c.name, c.description, c.weight, c.maxScore, i,
          ]);
        }
        await audit(t, actor, { eventId: id, action: "event.imported", entityType: "event", entityId: id, summary: `Event "${e.name}" imported from bundle` });
        return { id, slug: e.slug };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/registrations/import",
    summary: "Bulk-register participants from CSV (email,name[,team]); returns one-time passwords for new accounts",
    tags: ["Import & export"],
    auth: "event:manage",
    body: registrationCsv,
    status: 201,
    async handler({ params, body, actor, tx }) {
      const rows = parseCsv(body.csv.trim()).filter((r) => r.some((c) => c.trim()));
      const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
      const data = header.includes("email") ? rows.slice(1) : rows;
      const col = (name: string, fallback: number) => (header.includes(name) ? header.indexOf(name) : fallback);
      const [ei, ni, ti] = [col("email", 0), col("name", 1), col("team", 2)];
      if (data.length > 2000) throw unprocessable("At most 2000 rows per import");
      const prepared: { email: string; name: string; team: string }[] = [];
      const errors: { row: number; message: string }[] = [];
      for (const [i, r] of data.entries()) {
        const parsedEmail = emailSchema.safeParse(r[ei] ?? "");
        const name = (r[ni] ?? "").trim();
        if (!parsedEmail.success || !name) {
          errors.push({ row: i + 1, message: "Needs a valid email and a name" });
          continue;
        }
        prepared.push({ email: parsedEmail.data, name: name.slice(0, 80), team: (r[ti] ?? "").trim().slice(0, 60) });
      }
      if (errors.length) throw unprocessable("Fix these rows and retry", errors, "CSV_INVALID");
      // Hash passwords outside the transaction (scrypt is deliberately slow).
      const credentials = await Promise.all(prepared.map(async () => {
        const password = randomToken(9);
        return { password, hash: await hashPassword(password) };
      }));
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const created: { email: string; name: string; temporaryPassword: string }[] = [];
        let registered = 0;
        const teamIds = new Map<string, string>();
        for (const [i, p] of prepared.entries()) {
          let u = await one<{ id: string; role: string }>(t, "SELECT id, role FROM users WHERE lower(email) = $1", [p.email]);
          if (!u) {
            const id = newId("usr");
            await t.query("INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'participant')", [id, p.email, p.name, credentials[i]!.hash]);
            u = { id, role: "participant" };
            created.push({ email: p.email, name: p.name, temporaryPassword: credentials[i]!.password });
          }
          if (u.role !== "participant") continue;
          await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, u.id]);
          registered += 1;
          if (p.team) {
            let teamId = teamIds.get(p.team) ?? (await one<{ id: string }>(t, "SELECT id FROM teams WHERE event_id = $1 AND name = $2", [event.id, p.team]))?.id;
            if (!teamId) {
              teamId = newId("team");
              await t.query("INSERT INTO teams (id, event_id, name, created_by) VALUES ($1, $2, $3, $4)", [teamId, event.id, p.team, u.id]);
            }
            teamIds.set(p.team, teamId);
            // Serialise capacity checks per team (invite-accept does the same).
            await t.query("SELECT 1 FROM teams WHERE id = $1 FOR UPDATE", [teamId]);
            const size = await one<{ n: number }>(t, "SELECT count(*)::int AS n FROM team_members WHERE team_id = $1", [teamId]);
            const already = await one(t, "SELECT 1 FROM team_members WHERE event_id = $1 AND user_id = $2", [event.id, u.id]);
            if (!already && (size?.n ?? 0) < event.max_team_size) {
              await t.query("INSERT INTO team_members (team_id, event_id, user_id, role) VALUES ($1, $2, $3, $4)", [teamId, event.id, u.id, (size?.n ?? 0) === 0 ? "captain" : "member"]);
            }
          }
        }
        await audit(t, actor, { eventId: event.id, action: "registrations.imported", entityType: "event", entityId: event.id, summary: `${registered} participants imported (${created.length} new accounts)` });
        return { registered, created, teams: teamIds.size };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/embed/events/:eventId/gallery.json",
    summary: "Lightweight public gallery feed for the embeddable widget (CORS-enabled)",
    tags: ["Gallery"],
    auth: "public",
    async handler({ params, actor, res, tx }) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const items = await many(
          t,
          `SELECT s.id, s.title, s.tagline, s.thumbnail_url AS "thumbnailUrl", tm.name AS "teamName", tr.name AS "trackName"
             FROM submissions s JOIN teams tm ON tm.id = s.team_id LEFT JOIN tracks tr ON tr.id = s.track_id
            WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'
            ORDER BY s.submitted_at DESC LIMIT 60`,
          [event.id],
        );
        return { event: { id: event.id, slug: event.slug, name: event.name }, items };
      });
    },
  }),
];
