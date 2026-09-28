import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fitBradleyTerry, fnv1a, planAssignments, selectNextPair, weightedTotal, type Comparison } from "@dogfood/core";
import { many, one, type Db, type Tx } from "../db/pool";
import { hashPassword, randomToken, sha256Hex, type SigningKeys } from "../lib/crypto";
import { findEvent } from "../modules/access";
import { issueRecords } from "../modules/records";
import { publishRun, runNormalization } from "../modules/results";
import { fixturesFile, resolveTime, type FixtureEvent, type Fixtures } from "./fixtures";

export interface SeedContext {
  db: Db;
  keys: SigningKeys;
  publicUrl: string;
  now: number;
  log?: (msg: string) => void;
}

/** Deterministic pseudo-random number in [0, 1) from a string key. */
function unit(key: string): number {
  return fnv1a(key) / 4294967296;
}

export function candidateFixturePaths(explicit: string | null): string[] {
  const cwd = process.cwd();
  return [
    ...(explicit ? [explicit] : []),
    path.join(cwd, "fixtures.json"),
    path.join(cwd, "fixtures", "fixtures.json"),
    path.resolve(cwd, "../../fixtures.json"),
  ];
}

export async function loadFixtures(explicit: string | null, log = console.log): Promise<{ fixtures: Fixtures; source: string } | null> {
  for (const p of candidateFixturePaths(explicit)) {
    if (!existsSync(p)) continue;
    const raw = JSON.parse(await readFile(p, "utf8")) as unknown;
    const parsed = fixturesFile.safeParse(raw);
    if (parsed.success) return { fixtures: parsed.data, source: p };
    log(`[seed] ${p} is not in dogfood.fixtures.v1 format (${parsed.error.issues[0]?.message ?? "invalid"}); skipping`);
  }
  return null;
}

/** Long-lived per-role sessions for the acceptance runner (tokens are in .dogfood.toml). */
export async function upsertCheckerSessions(db: Db, fixtures: Fixtures): Promise<number> {
  return db.system(async (t) => {
    let n = 0;
    for (const s of fixtures.checkerSessions) {
      const user = await one(t, "SELECT 1 FROM users WHERE id = $1", [s.userId]);
      if (!user) continue;
      await t.query(
        `INSERT INTO sessions (id, user_id, token_hash, kind, label, expires_at)
         VALUES ($1, $2, $3, 'checker', $4, now() + interval '30 days')
         ON CONFLICT (token_hash) DO UPDATE SET expires_at = now() + interval '30 days', user_id = EXCLUDED.user_id`,
        [`ses_checker_${sha256Hex(s.token).slice(0, 12)}`, s.userId, sha256Hex(s.token), s.label],
      );
      n += 1;
    }
    return n;
  });
}

export async function isSeeded(db: Db): Promise<boolean> {
  const row = await db.system((t) => one<{ n: number }>(t, "SELECT count(*)::int AS n FROM users"));
  return (row?.n ?? 0) > 0;
}

async function seedUsers(t: Tx, fixtures: Fixtures) {
  const hashes = new Map<string, string>();
  for (const u of fixtures.users) {
    const pw = u.password ?? fixtures.defaultPassword;
    // One scrypt per distinct password keeps boot fast; demo accounts share a documented password.
    if (!hashes.has(pw)) hashes.set(pw, await hashPassword(pw));
    await t.query(
      `INSERT INTO users (id, email, name, password_hash, role, headline, bio, tech_stack, qualifications, links)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email.toLowerCase(), u.name, hashes.get(pw), u.role, u.headline, u.bio, u.techStack, u.qualifications, JSON.stringify(u.links)],
    );
  }
}

function clampScore(v: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(v)));
}

async function seedEvent(t: Tx, ctx: SeedContext, e: FixtureEvent) {
  const at = (v: string | null | undefined) => (v ? resolveTime(v, ctx.now) : null);
  await t.query(
    `INSERT INTO events (id, slug, name, tagline, description, rules, location, status, starts_at, submission_deadline,
                         judging_ends_at, voting_opens_at, voting_closes_at, min_team_size, max_team_size, voting_mode,
                         voting_style, vote_budget, reviews_per_submission, norm_target_mean, norm_target_sd, norm_min_sample, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      e.id, e.slug, e.name, e.tagline, e.description, e.rules, e.location, e.status, at(e.startsAt), at(e.submissionDeadline),
      at(e.judgingEndsAt), at(e.votingOpensAt), at(e.votingClosesAt), e.minTeamSize, e.maxTeamSize, e.votingMode,
      e.votingStyle, e.voteBudget, e.reviewsPerSubmission, e.normalization.targetMean, e.normalization.targetSd,
      e.normalization.minSampleSize, e.organizers[0] ?? null,
    ],
  );
  for (const o of e.organizers) await t.query("INSERT INTO event_organizers (event_id, user_id) VALUES ($1, $2)", [e.id, o]);
  for (const [i, tr] of e.tracks.entries()) {
    await t.query("INSERT INTO tracks (id, event_id, name, description, position) VALUES ($1,$2,$3,$4,$5)", [tr.id, e.id, tr.name, tr.description, i]);
  }
  for (const [i, p] of e.prizes.entries()) {
    await t.query("INSERT INTO prizes (id, event_id, track_id, name, description, value, position) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
      `prz_${e.id}_${i}`, e.id, p.trackId, p.name, p.description, p.value, i,
    ]);
  }
  for (const [i, q] of e.questions.entries()) {
    await t.query("INSERT INTO questions (id, event_id, label, help, kind, required, options, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
      q.id, e.id, q.label, q.help, q.kind, q.required, JSON.stringify(q.options), i,
    ]);
  }
  for (const [i, c] of e.criteria.entries()) {
    await t.query("INSERT INTO criteria (id, event_id, track_id, name, description, weight, max_score, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
      c.id, e.id, c.trackId, c.name, c.description, c.weight, c.maxScore, i,
    ]);
  }
  for (const j of e.judges) {
    await t.query("INSERT INTO event_judges (event_id, user_id, track_ids) VALUES ($1, $2, $3)", [e.id, j.userId, j.trackIds]);
  }
  for (const u of e.registrations) {
    await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [e.id, u]);
  }

  const quality = new Map<string, number>();
  for (const team of e.teams) {
    await t.query("INSERT INTO teams (id, event_id, name, created_by, deadline_extension_until) VALUES ($1,$2,$3,$4,$5)", [
      team.id, e.id, team.name, team.members[0], at(team.extensionUntil),
    ]);
    for (const [i, m] of team.members.entries()) {
      await t.query("INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [e.id, m]);
      await t.query("INSERT INTO team_members (team_id, event_id, user_id, role) VALUES ($1,$2,$3,$4)", [team.id, e.id, m, i === 0 ? "captain" : "member"]);
    }
    const s = team.submission;
    if (!s) continue;
    quality.set(s.id, s.quality);
    await t.query(
      `INSERT INTO submissions (id, event_id, team_id, track_id, title, tagline, description, repo_url, demo_video_url, live_url,
                                thumbnail_url, tech_tags, answers, status, submitted_at, eligibility, eligibility_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        s.id, e.id, team.id, s.trackId, s.title, s.tagline, s.description, s.repoUrl, s.demoVideoUrl, s.liveUrl, s.thumbnailUrl,
        s.techTags, JSON.stringify(s.answers), s.status, s.status === "submitted" ? at(s.submittedAt ?? "now-1d") : null,
        s.eligibility, s.eligibilityNote,
      ],
    );
  }

  for (const c of e.judging.conflicts) {
    await t.query("INSERT INTO conflicts (event_id, judge_id, submission_id, reason) VALUES ($1,$2,$3,$4)", [e.id, c.judgeId, c.submissionId, c.reason]);
  }

  const judgeable = e.teams
    .filter((tm) => tm.submission?.status === "submitted" && tm.submission.eligibility !== "ineligible")
    .map((tm) => ({ id: tm.submission!.id, trackId: tm.submission!.trackId, memberIds: tm.members }));

  if (e.judging.assign && e.judges.length) {
    const plan = planAssignments({
      submissions: judgeable,
      judges: e.judges.map((j) => ({ id: j.userId, trackIds: j.trackIds })),
      existing: [],
      conflicts: e.judging.conflicts.map((c) => ({ judgeId: c.judgeId, submissionId: c.submissionId })),
      reviewsPerSubmission: e.reviewsPerSubmission,
    });
    const criteria = e.criteria;
    const trackOf = new Map(judgeable.map((s) => [s.id, s.trackId]));
    for (const [i, a] of plan.created.entries()) {
      const aid = `asg_${e.id}_${String(i + 1).padStart(3, "0")}`;
      const profile = e.judging.judgeProfiles[a.judgeId] ?? { leniency: 0, spread: 1, completion: 1 };
      const submitted = unit(`complete:${a.judgeId}:${a.submissionId}`) < profile.completion;
      const partial = !submitted && unit(`partial:${a.judgeId}:${a.submissionId}`) < 0.5;
      await t.query("INSERT INTO assignments (id, event_id, judge_id, submission_id, status) VALUES ($1,$2,$3,$4,$5)", [
        aid, e.id, a.judgeId, a.submissionId, submitted ? "submitted" : partial ? "in_progress" : "pending",
      ]);
      if (!submitted && !partial) continue;
      const trackId = trackOf.get(a.submissionId) ?? null;
      const rubric = criteria.filter((c) => c.trackId === null || c.trackId === trackId);
      const q = quality.get(a.submissionId) ?? 0.5;
      const scores: Record<string, number> = {};
      for (const c of rubric.slice(0, submitted ? rubric.length : Math.ceil(rubric.length / 2))) {
        const center = c.maxScore / 2;
        const signal = center + (q * c.maxScore - center) * profile.spread;
        const noise = (unit(`noise:${a.judgeId}:${a.submissionId}:${c.id}`) * 2 - 1) * e.judging.noise * (c.maxScore / 10);
        scores[c.id] = clampScore(signal + profile.leniency * (c.maxScore / 10) + noise, c.maxScore);
        await t.query("INSERT INTO scores (assignment_id, criterion_id, judge_id, event_id, value) VALUES ($1,$2,$3,$4,$5)", [
          aid, c.id, a.judgeId, e.id, scores[c.id],
        ]);
      }
      const raw = submitted ? weightedTotal(scores, rubric.map((c) => ({ id: c.id, weight: c.weight, maxScore: c.maxScore }))) : null;
      await t.query(
        "INSERT INTO ballots (assignment_id, event_id, judge_id, submission_id, comment, raw_total, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [aid, e.id, a.judgeId, a.submissionId, submitted ? "Solid work — see rubric notes." : "", raw, submitted ? at("now-2h") : null],
      );
    }
  }

  if (e.judging.pairwise) {
    const all: Comparison[] = [];
    for (const judgeId of e.judging.pairwise.judges) {
      const judge = e.judges.find((j) => j.userId === judgeId);
      const pool = judgeable.filter((s) => !judge?.trackIds || (s.trackId !== null && judge.trackIds.includes(s.trackId))).map((s) => s.id);
      const mine: Comparison[] = [];
      for (let k = 0; k < e.judging.pairwise.comparisonsPerJudge; k++) {
        const pair = selectNextPair(pool, all, mine, judgeId);
        if (!pair) break;
        const [a, b] = pair;
        const pa = 1 / (1 + Math.exp(-6 * ((quality.get(a) ?? 0.5) - (quality.get(b) ?? 0.5))));
        const cmp = unit(`pw:${judgeId}:${a}:${b}`) < pa ? { winnerId: a, loserId: b } : { winnerId: b, loserId: a };
        mine.push(cmp);
        all.push(cmp);
        await t.query("INSERT INTO pairwise_votes (id, event_id, judge_id, winner_id, loser_id) VALUES ($1,$2,$3,$4,$5)", [
          `pw_${e.id}_${all.length}`, e.id, judgeId, cmp.winnerId, cmp.loserId,
        ]);
      }
    }
    // Sanity: the seeded comparisons must be fittable.
    fitBradleyTerry(judgeable.map((s) => s.id), all);
  }

  if (e.votes && e.votingMode !== "off") {
    const ids = judgeable.map((s) => s.id);
    for (let v = 0; v < e.votes.voters; v++) {
      // Weighted sampling without replacement (Efraimidis–Spirakis), weights from quality.
      const picks = ids
        .map((sid) => ({ sid, key: unit(`vote:${v}:${sid}`) ** (1 / (0.15 + (quality.get(sid) ?? 0.5))) }))
        .sort((x, y) => y.key - x.key)
        .slice(0, e.votes.perVoter);
      for (const [rank, p] of picks.entries()) {
        const votes = e.votingStyle === "quadratic" ? Math.max(1, 3 - rank) : 1;
        await t.query(
          `INSERT INTO votes (id, event_id, submission_id, voter_key, ip_hash, ua_hash, votes, status, created_at)
           VALUES ($1,$2,$3,$4,$5,'seed',$6,'counted',$7)`,
          [`vote_${e.id}_${v}_${rank}`, e.id, p.sid, `d:seed${v}`, `seed-ip-${v}`, votes, at("now-3h")],
        );
      }
    }
    if (e.votes.sybil) {
      for (let v = 0; v < e.votes.sybil.voters; v++) {
        const flagged = v >= 3;
        await t.query(
          `INSERT INTO votes (id, event_id, submission_id, voter_key, ip_hash, ua_hash, votes, status, flag_reason, created_at)
           VALUES ($1,$2,$3,$4,'seed-ip-sybil','seed-bot',1,$5,$6,$7)`,
          [`vote_${e.id}_sybil_${v}`, e.id, e.votes.sybil.submissionId, `d:sybil${v}`, flagged ? "flagged" : "counted", flagged ? "more than 3 voters from one IP" : null, at("now-1h")],
        );
      }
    }
  }

  for (const [i, c] of e.comments.entries()) {
    await t.query("INSERT INTO comments (id, submission_id, event_id, user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [
      `cmt_${e.id}_${i}`, c.submissionId, e.id, c.userId, c.body, at(c.at ?? "now-4h"),
    ]);
  }

  for (const [i, inv] of e.pendingJudgeInvites.entries()) {
    await t.query(
      `INSERT INTO judge_invites (id, event_id, token_hash, track_ids, note, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days')`,
      [`jinv_${e.id}_${i}`, e.id, sha256Hex(randomToken()), inv.trackIds.length ? inv.trackIds : null, inv.note, e.organizers[0] ?? null],
    );
  }

  if (e.publishResultsAt) {
    const event = (await findEvent(t, e.id))!;
    const run = await runNormalization(t, event, null);
    await publishRun(t, event.id, run, at(e.publishResultsAt)!);
  }
  if (e.issueRecords) {
    const event = (await findEvent(t, e.id))!;
    await issueRecords(t, { keys: ctx.keys, publicUrl: ctx.publicUrl, now: ctx.now }, event);
  }
}

/** Load fixtures into an empty database. Everything runs as the trusted 'system' role. */
export async function seedDatabase(ctx: SeedContext, fixtures: Fixtures, source = "fixtures.json"): Promise<void> {
  const log = ctx.log ?? console.log;
  await ctx.db.system(async (t) => {
    await seedUsers(t, fixtures);
    for (const e of fixtures.events) {
      await seedEvent(t, ctx, e);
      log(`[seed] event ${e.id} (${e.name}) loaded`);
    }
    await t.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, summary, data, seq, prev_hash, hash)
       VALUES ('seed.loaded', 'system', NULL, $1, $2, 0, '', '')`,
      [`Deterministic fixtures loaded from ${path.basename(source)}`, JSON.stringify({ users: fixtures.users.length, events: fixtures.events.length })],
    );
  });
  const counts = await ctx.db.system((t) =>
    many<{ k: string; n: number }>(
      t,
      `SELECT 'users' AS k, count(*)::int AS n FROM users UNION ALL SELECT 'submissions', count(*)::int FROM submissions
       UNION ALL SELECT 'assignments', count(*)::int FROM assignments UNION ALL SELECT 'ballots', count(*)::int FROM ballots WHERE submitted_at IS NOT NULL`,
    ),
  );
  log(`[seed] done: ${counts.map((c) => `${c.n} ${c.k}`).join(", ")}`);
}
