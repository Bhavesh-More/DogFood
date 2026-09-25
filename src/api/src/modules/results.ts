import type { Response } from "express";
import { z } from "zod";
import {
  areResultsPublic,
  areVoteTalliesVisible,
  checkInvariants,
  fitBradleyTerry,
  normalize,
  spearman,
  toCsv,
  weightedTotal,
  type CsvValue,
  type NormalizationRunDto,
  type NormalizedResultDto,
} from "@dogfood/core";
import { many, one, type Tx } from "../db/pool";
import { audit } from "../lib/audit";
import { conflict, forbidden, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Actor } from "../http/context";
import { route } from "../http/route";
import { loadManagedEvent, loadVisibleEvent, type EventRow } from "./access";
import { criteriaForTrack, eventTimes, loadCriteria } from "./events";

const EPSILON = 1e-6;

interface SubmissionMeta {
  id: string;
  title: string;
  team_name: string;
  track_id: string | null;
  track_name: string | null;
}

async function submissionMeta(tx: Tx, eventId: string): Promise<Map<string, SubmissionMeta>> {
  const rows = await many<SubmissionMeta>(
    tx,
    `SELECT s.id, s.title, t.name AS team_name, s.track_id, tr.name AS track_name
       FROM submissions s JOIN teams t ON t.id = s.team_id LEFT JOIN tracks tr ON tr.id = s.track_id
      WHERE s.event_id = $1`,
    [eventId],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Pairwise Bradley-Terry ranking over submitted, eligible projects. */
export async function pairwiseRanking(tx: Tx, eventId: string) {
  const ids = (
    await many<{ id: string }>(
      tx,
      "SELECT id FROM submissions WHERE event_id = $1 AND status = 'submitted' AND eligibility <> 'ineligible'",
      [eventId],
    )
  ).map((r) => r.id);
  const votes = await many<{ winner_id: string; loser_id: string }>(
    tx,
    "SELECT winner_id, loser_id FROM pairwise_votes WHERE event_id = $1",
    [eventId],
  );
  const fit = fitBradleyTerry(ids, votes.map((v) => ({ winnerId: v.winner_id, loserId: v.loser_id })));
  return { comparisons: votes.length, ...fit };
}

/**
 * Recompute every submitted ballot's weighted total from its criterion scores
 * (never trusting the stored total), normalize, and snapshot the run.
 */
export async function runNormalization(tx: Tx, event: EventRow, actor: Actor | null): Promise<NormalizationRunDto> {
  const criteria = await loadCriteria(tx, event.id);
  const meta = await submissionMeta(tx, event.id);
  const ballots = await many<{ assignment_id: string; judge_id: string; submission_id: string }>(
    tx,
    `SELECT b.assignment_id, b.judge_id, b.submission_id
       FROM ballots b JOIN submissions s ON s.id = b.submission_id
      WHERE b.event_id = $1 AND b.submitted_at IS NOT NULL
        AND s.status = 'submitted' AND s.eligibility <> 'ineligible'`,
    [event.id],
  );
  const scores = await many<{ assignment_id: string; criterion_id: string; value: number }>(
    tx,
    "SELECT assignment_id, criterion_id, value FROM scores WHERE event_id = $1",
    [event.id],
  );
  const byAssignment = new Map<string, Record<string, number>>();
  for (const s of scores) {
    const m = byAssignment.get(s.assignment_id) ?? {};
    m[s.criterion_id] = s.value;
    byAssignment.set(s.assignment_id, m);
  }
  const entries = [];
  for (const b of ballots) {
    const sub = meta.get(b.submission_id);
    const rubric = criteriaForTrack(criteria, sub?.track_id ?? null).map((c) => ({ id: c.id, weight: c.weight, maxScore: c.maxScore }));
    try {
      entries.push({ judgeId: b.judge_id, submissionId: b.submission_id, raw: weightedTotal(byAssignment.get(b.assignment_id) ?? {}, rubric) });
    } catch {
      // Rubric changed after the ballot was cast — skip incomplete ballots rather than guess.
    }
  }
  if (entries.length === 0) throw conflict("No submitted ballots to normalize yet", "NO_BALLOTS");

  const config = {
    targetMean: event.norm_target_mean,
    targetSd: event.norm_target_sd,
    minSampleSize: event.norm_min_sample,
    epsilon: EPSILON,
  };
  const outcome = normalize(entries, config);
  const judgeNames = new Map(
    (await many<{ id: string; name: string }>(tx, "SELECT id, name FROM users WHERE id = ANY($1)", [[...new Set(entries.map((e) => e.judgeId))]])).map(
      (u) => [u.id, u.name],
    ),
  );
  const pairwise = await pairwiseRanking(tx, event.id);
  const pairwiseRank = new Map(pairwise.comparisons > 0 ? pairwise.items.map((i) => [i.id, i.rank]) : []);

  const results: NormalizedResultDto[] = outcome.results.map((r) => {
    const m = meta.get(r.submissionId);
    return {
      submissionId: r.submissionId,
      title: m?.title ?? "",
      teamName: m?.team_name ?? "",
      trackId: m?.track_id ?? null,
      trackName: m?.track_name ?? null,
      judgeCount: r.judgeCount,
      rawMean: r.rawMean,
      normalizedMean: r.normalizedMean,
      normalizedSd: r.normalizedSd,
      rank: r.rank,
      rawRank: r.rawRank,
      pairwiseRank: pairwiseRank.get(r.submissionId) ?? null,
    };
  });
  const run: NormalizationRunDto = {
    id: newId("run"),
    eventId: event.id,
    createdAt: new Date().toISOString(),
    createdBy: actor?.user?.id ?? null,
    config,
    globalMean: outcome.globalMean,
    judges: outcome.judges.map((j) => ({ ...j, name: judgeNames.get(j.judgeId) ?? j.judgeId })),
    results,
    entries: outcome.entries,
    spearmanRawVsNormalized: spearman(
      results.map((r) => r.rawRank),
      results.map((r) => r.rank),
    ),
    invariants: checkInvariants(outcome),
  };
  const row = await one<{ created_at: string }>(
    tx,
    "INSERT INTO normalization_runs (id, event_id, created_by, config, outcome) VALUES ($1, $2, $3, $4, $5) RETURNING created_at",
    [run.id, event.id, run.createdBy, JSON.stringify(config), JSON.stringify(run)],
  );
  run.createdAt = row!.created_at;
  await audit(tx, actor, {
    eventId: event.id,
    action: "results.normalized",
    entityType: "normalization_run",
    entityId: run.id,
    summary: `Normalization run over ${entries.length} ballots from ${outcome.judges.length} judges (${outcome.judges.filter((j) => j.method === "min_max").length} used Min-Max fallback)`,
    data: { ballots: entries.length, judges: outcome.judges.length, config },
  });
  return run;
}

/** Project a normalization run into the public results table. */
export async function publishRun(tx: Tx, eventId: string, run: NormalizationRunDto, publishedAt: string): Promise<void> {
  await tx.query("DELETE FROM published_results WHERE event_id = $1", [eventId]);
  for (const r of run.results) {
    await tx.query(
      `INSERT INTO published_results (event_id, submission_id, run_id, rank, normalized_score, raw_mean, judge_count, pairwise_rank, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, r.submissionId, run.id, r.rank, r.normalizedMean, r.rawMean, r.judgeCount, r.pairwiseRank ?? null, publishedAt],
    );
  }
  await tx.query("UPDATE events SET results_published_at = $2, updated_at = now() WHERE id = $1", [eventId, publishedAt]);
}

async function latestRun(tx: Tx, eventId: string): Promise<NormalizationRunDto | null> {
  const row = await one<{ outcome: NormalizationRunDto; created_at: string }>(
    tx,
    "SELECT outcome, created_at FROM normalization_runs WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1",
    [eventId],
  );
  return row ? { ...row.outcome, createdAt: row.created_at } : null;
}

async function voteTallies(tx: Tx, eventId: string): Promise<Map<string, number>> {
  const rows = await many<{ submission_id: string; tally: number }>(
    tx,
    `SELECT submission_id, sum(votes)::int AS tally FROM votes
      WHERE event_id = $1 AND status = 'counted' GROUP BY submission_id`,
    [eventId],
  );
  return new Map(rows.map((r) => [r.submission_id, r.tally]));
}

function sendCsv(res: Response, filename: string, headers: string[], rows: CsvValue[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(toCsv(headers, rows));
}

const exportKinds = ["results", "scores", "submissions", "judges", "votes", "audit"] as const;

export const resultRoutes = [
  route({
    method: "post",
    path: "/api/events/:eventId/normalize",
    summary: "Run cross-judge normalization now and store the snapshot",
    description:
      "Z-score per judge (N ≥ minSampleSize) with ε = 1e-6, variance-matched Min-Max fallback below the threshold, " +
      "rescaled to the event's target mean/sd. The response includes per-judge statistics and live invariant checks.",
    tags: ["Results"],
    auth: "event:manage",
    status: 201,
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const run = await runNormalization(t, event, actor);
        await app.webhooks.emit(event.id, "results.normalized", { runId: run.id, results: run.results.length }, t);
        return run;
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/normalization",
    summary: "Latest normalization run (organizers) and run history",
    tags: ["Results"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const history = await many(
          t,
          `SELECT r.id, r.created_at AS "createdAt", u.name AS "createdBy",
                  jsonb_array_length(r.outcome->'results') AS results
             FROM normalization_runs r LEFT JOIN users u ON u.id = r.created_by
            WHERE r.event_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
          [event.id],
        );
        return { latest: await latestRun(t, event.id), history };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/pairwise/ranking",
    summary: "Bradley-Terry ranking from pairwise comparisons (organizers)",
    tags: ["Results"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const meta = await submissionMeta(t, event.id);
        const fit = await pairwiseRanking(t, event.id);
        return {
          comparisons: fit.comparisons,
          converged: fit.converged,
          iterations: fit.iterations,
          items: fit.items.map((i) => ({ ...i, title: meta.get(i.id)?.title ?? "", teamName: meta.get(i.id)?.team_name ?? "" })),
        };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/results/publish",
    summary: "Publish results from the latest normalization run",
    description: "Only rank, normalized score, raw mean and judge count become public — never per-judge ballots.",
    tags: ["Results"],
    auth: "event:manage",
    body: z.object({ rerun: z.boolean().default(true) }),
    async handler({ app, params, body, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const run = body.rerun ? await runNormalization(t, event, actor) : await latestRun(t, event.id);
        if (!run) throw conflict("Run normalization first", "NO_RUN");
        await publishRun(t, event.id, run, new Date(app.now()).toISOString());
        await audit(t, actor, {
          eventId: event.id,
          action: "results.published",
          entityType: "normalization_run",
          entityId: run.id,
          summary: `Results published (${run.results.length} projects)`,
        });
        await app.webhooks.emit(event.id, "results.published", { runId: run.id, projects: run.results.length }, t);
        return { publishedAt: new Date(app.now()).toISOString(), runId: run.id, projects: run.results.length };
      });
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/results/unpublish",
    summary: "Withdraw published results",
    tags: ["Results"],
    auth: "event:manage",
    async handler({ params, actor, tx }) {
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        await t.query("DELETE FROM published_results WHERE event_id = $1", [event.id]);
        await t.query("UPDATE events SET results_published_at = NULL, updated_at = now() WHERE id = $1", [event.id]);
        await audit(t, actor, { eventId: event.id, action: "results.unpublished", entityType: "event", entityId: event.id, summary: "Results withdrawn" });
      });
      return undefined;
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/results",
    summary: "Public leaderboard once results are published (403 RESULTS_HIDDEN before)",
    tags: ["Results"],
    auth: "public",
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadVisibleEvent(t, actor, params.eventId!);
        const times = eventTimes(event);
        const now = app.now();
        if (!areResultsPublic(times, now)) throw forbidden("Results have not been published yet", "RESULTS_HIDDEN");
        const meta = await submissionMeta(t, event.id);
        const tallies = areVoteTalliesVisible(times, now) ? await voteTallies(t, event.id) : null;
        const rows = await many<{ submission_id: string; rank: number; normalized_score: number; raw_mean: number; judge_count: number; pairwise_rank: number | null }>(
          t,
          "SELECT submission_id, rank, normalized_score, raw_mean, judge_count, pairwise_rank FROM published_results WHERE event_id = $1 ORDER BY rank",
          [event.id],
        );
        return {
          publishedAt: event.results_published_at,
          results: rows.map((r) => ({
            submissionId: r.submission_id,
            title: meta.get(r.submission_id)?.title ?? "",
            teamName: meta.get(r.submission_id)?.team_name ?? "",
            trackId: meta.get(r.submission_id)?.track_id ?? null,
            trackName: meta.get(r.submission_id)?.track_name ?? null,
            rank: r.rank,
            normalizedScore: r.normalized_score,
            rawMean: r.raw_mean,
            judgeCount: r.judge_count,
            pairwiseRank: r.pairwise_rank,
            voteTally: tallies ? (tallies.get(r.submission_id) ?? 0) : null,
          })),
          communityChoice: tallies
            ? [...tallies.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id, tally]) => ({ submissionId: id, title: meta.get(id)?.title ?? "", tally }))
            : null,
        };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/exports/:kind.csv",
    summary: "CSV export: results | scores | submissions | judges | votes | audit",
    description: "Cells beginning with = + - @ are prefixed with ' to prevent spreadsheet formula injection.",
    tags: ["Exports"],
    auth: "event:manage",
    produces: "text/csv",
    async handler({ params, actor, res, tx }) {
      const kind = params.kind as (typeof exportKinds)[number];
      if (!exportKinds.includes(kind)) throw notFound("Export");
      await tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const file = `${event.slug}-${kind}.csv`;
        if (kind === "results") {
          const run = await latestRun(t, event.id);
          if (!run) throw conflict("Run normalization first", "NO_RUN");
          sendCsv(
            res,
            file,
            ["rank", "submission_id", "title", "team", "track", "normalized_score", "raw_mean", "judge_count", "normalized_sd", "raw_rank", "pairwise_rank", "run_id"],
            run.results.map((r) => [r.rank, r.submissionId, r.title, r.teamName, r.trackName, r.normalizedMean.toFixed(4), r.rawMean.toFixed(4), r.judgeCount, r.normalizedSd.toFixed(4), r.rawRank, r.pairwiseRank ?? "", run.id]),
          );
        } else if (kind === "scores") {
          const criteria = await loadCriteria(t, event.id);
          const rows = await many<{ assignment_id: string; judge: string; submission_id: string; title: string; raw_total: number | null; submitted_at: string | null }>(
            t,
            `SELECT b.assignment_id, u.name AS judge, b.submission_id, s.title, b.raw_total, b.submitted_at
               FROM ballots b JOIN users u ON u.id = b.judge_id JOIN submissions s ON s.id = b.submission_id
              WHERE b.event_id = $1 ORDER BY s.title, u.name`,
            [event.id],
          );
          const scores = await many<{ assignment_id: string; criterion_id: string; value: number }>(
            t,
            "SELECT assignment_id, criterion_id, value FROM scores WHERE event_id = $1",
            [event.id],
          );
          const map = new Map(scores.map((s) => [`${s.assignment_id}:${s.criterion_id}`, s.value]));
          sendCsv(
            res,
            file,
            ["submission_id", "title", "judge", "submitted_at", "weighted_raw_total", ...criteria.map((c) => `${c.name} (w=${c.weight}, max=${c.maxScore})`)],
            rows.map((r) => [r.submission_id, r.title, r.judge, r.submitted_at, r.raw_total?.toFixed(4) ?? "", ...criteria.map((c) => map.get(`${r.assignment_id}:${c.id}`) ?? "")]),
          );
        } else if (kind === "submissions") {
          const rows = await many<Record<string, CsvValue>>(
            t,
            `SELECT s.id, s.title, s.tagline, t.name AS team, tr.name AS track, s.status, s.submitted_at, s.eligibility,
                    s.repo_url, s.demo_video_url, s.live_url, array_to_string(s.tech_tags, ' ') AS tags,
                    (SELECT string_agg(u.name, '; ') FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = s.team_id) AS members
               FROM submissions s JOIN teams t ON t.id = s.team_id LEFT JOIN tracks tr ON tr.id = s.track_id
              WHERE s.event_id = $1 ORDER BY s.title`,
            [event.id],
          );
          const headers = ["id", "title", "tagline", "team", "members", "track", "status", "submitted_at", "eligibility", "repo_url", "demo_video_url", "live_url", "tags"];
          sendCsv(res, file, headers, rows.map((r) => headers.map((h) => r[h] ?? null)));
        } else if (kind === "judges") {
          const rows = await many<{ name: string; email: string; assigned: number; submitted: number; track_ids: string[] | null }>(
            t,
            `SELECT u.name, u.email, j.track_ids,
                    count(a.id)::int AS assigned, count(a.id) FILTER (WHERE a.status = 'submitted')::int AS submitted
               FROM event_judges j JOIN users u ON u.id = j.user_id
               LEFT JOIN assignments a ON a.event_id = j.event_id AND a.judge_id = j.user_id
              WHERE j.event_id = $1 GROUP BY u.id, j.track_ids ORDER BY u.name`,
            [event.id],
          );
          sendCsv(res, file, ["judge", "email", "track_scope", "assigned", "submitted", "progress_pct"], rows.map((r) => [r.name, r.email, r.track_ids?.join(" ") ?? "all", r.assigned, r.submitted, r.assigned ? Math.round((100 * r.submitted) / r.assigned) : 0]));
        } else if (kind === "votes") {
          const rows = await many<{ submission_id: string; title: string; counted: number; flagged: number; voters: number }>(
            t,
            `SELECT s.id AS submission_id, s.title,
                    coalesce(sum(v.votes) FILTER (WHERE v.status = 'counted'), 0)::int AS counted,
                    coalesce(sum(v.votes) FILTER (WHERE v.status = 'flagged'), 0)::int AS flagged,
                    count(DISTINCT v.voter_key)::int AS voters
               FROM submissions s LEFT JOIN votes v ON v.submission_id = s.id
              WHERE s.event_id = $1 AND s.status = 'submitted' GROUP BY s.id ORDER BY counted DESC`,
            [event.id],
          );
          sendCsv(res, file, ["submission_id", "title", "counted_votes", "flagged_votes", "distinct_voters"], rows.map((r) => [r.submission_id, r.title, r.counted, r.flagged, r.voters]));
        } else {
          const rows = await many<{ seq: number; created_at: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; summary: string; hash: string }>(
            t,
            `SELECT a.seq, a.created_at, u.name AS actor, a.action, a.entity_type, a.entity_id, a.summary, a.hash
               FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.event_id = $1 ORDER BY a.seq`,
            [event.id],
          );
          sendCsv(res, file, ["seq", "created_at", "actor", "action", "entity_type", "entity_id", "summary", "hash"], rows.map((r) => [r.seq, r.created_at, r.actor, r.action, r.entity_type, r.entity_id, r.summary, r.hash]));
        }
      });
      return undefined;
    },
  }),
];
