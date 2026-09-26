import { z } from "zod";
import type { AiClassificationDto, AiExpertiseDto, AiMatrixDto } from "@dogfood/core";
import { AiUnavailable } from "../ai/client";
import { many, one } from "../db/pool";
import { HttpError, notFound } from "../lib/errors";
import { audit } from "../lib/audit";
import { route } from "../http/route";
import { loadManagedEvent, isEventOrganizer } from "./access";

/** Map sidecar failures to a stable 503 so clients can hide the feature. */
async function aiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AiUnavailable) throw new HttpError(503, "AI_UNAVAILABLE", err.message);
    throw err;
  }
}

function assertEnabled(enabled: boolean): void {
  if (!enabled) throw new HttpError(503, "AI_DISABLED", "AI is disabled. Start the sidecar and set AI_ENABLED=true.");
}

const feedbackInput = z.object({ notes: z.string().max(5000).optional() });

const tagsOf = (rows: { tech_tags?: string[] | null }[]) => [...new Set(rows.flatMap((r) => r.tech_tags ?? []))];

export const aiRoutes = [
  route({
    method: "get",
    path: "/api/ai/status",
    summary: "AI sidecar status (enabled, backend, device, models)",
    description: "Public and cheap. The UI hides every AI affordance when this reports `enabled: false`.",
    tags: ["AI"],
    auth: "public",
    async handler({ app }) {
      return app.ai.status();
    },
  }),

  route({
    method: "post",
    path: "/api/events/:eventId/ai/classify",
    summary: "Classify a event's submitted projects and judges (Laya, heuristic fallback)",
    description:
      "Advisory only: writes cached classifications and judge expertise. Never changes scores, ballots or rankings. " +
      "Routing uses these as a tie-break, never as a hard constraint.",
    tags: ["AI"],
    auth: "event:manage",
    rateLimit: { bucket: "ai", spec: { capacity: 20, perMinute: 20 } },
    async handler({ app, params, actor, tx }) {
      assertEnabled(app.ai.enabled);
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const submissions = await many<{ id: string; title: string; tagline: string; description: string; tech_tags: string[]; track_id: string | null }>(
          t,
          `SELECT s.id, s.title, s.tagline, s.description, s.tech_tags, s.track_id
             FROM submissions s WHERE s.event_id = $1 AND s.status = 'submitted' AND s.eligibility <> 'ineligible'`,
          [event.id],
        );
        const tracks = await many<{ id: string; name: string }>(t, "SELECT id, name FROM tracks WHERE event_id = $1", [event.id]);
        const trackName = new Map(tracks.map((tr) => [tr.id, tr.name]));
        const vocab = [...new Set([...tracks.map((tr) => tr.name.toLowerCase()), ...tagsOf(submissions)])].slice(0, 24);

        const classified = await aiCall(() =>
          app.ai.classify(
            submissions.map((s) => ({
              id: s.id,
              title: s.title,
              tagline: s.tagline,
              description: s.description,
              techTags: s.tech_tags ?? [],
              track: s.track_id ? (trackName.get(s.track_id) ?? null) : null,
            })),
            vocab,
          ),
        );
        const projects: AiClassificationDto[] = [];
        for (const c of classified) {
          const updatedAt = new Date().toISOString();
          await t.query(
            `INSERT INTO project_classifications (submission_id, event_id, tags, primary_tag, confidence, source, model)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (submission_id) DO UPDATE SET tags = EXCLUDED.tags, primary_tag = EXCLUDED.primary_tag,
               confidence = EXCLUDED.confidence, source = EXCLUDED.source, model = EXCLUDED.model, updated_at = now()`,
            [c.id, event.id, c.tags, c.primaryTag, c.confidence, c.source, c.model],
          );
          projects.push({ submissionId: c.id, tags: c.tags, primaryTag: c.primaryTag, confidence: c.confidence, source: c.source, model: c.model, updatedAt });
        }

        const judges = await many<{ user_id: string; name: string; track_ids: string[] | null }>(
          t,
          "SELECT ej.user_id, u.name, ej.track_ids FROM event_judges ej JOIN users u ON u.id = ej.user_id WHERE ej.event_id = $1 AND u.role = 'judge'",
          [event.id],
        );
        const history = await many<{ judge_id: string; tags: string[] }>(
          t,
          `SELECT a.judge_id, array_agg(DISTINCT tag) AS tags
             FROM assignments a JOIN submissions s ON s.id = a.submission_id CROSS JOIN LATERAL unnest(s.tech_tags) AS tag
            WHERE a.event_id = $1 GROUP BY a.judge_id`,
          [event.id],
        );
        const historyTags = new Map(history.map((h) => [h.judge_id, h.tags ?? []]));
        const expertise = await aiCall(() =>
          app.ai.expertise(
            judges.map((j) => ({
              id: j.user_id,
              name: j.name,
              scope: (j.track_ids ?? []).map((id) => trackName.get(id) ?? id),
              declared: [],
              historyTags: historyTags.get(j.user_id) ?? [],
            })),
          ),
        );
        const judgeDtos: AiExpertiseDto[] = [];
        for (const e of expertise) {
          await t.query(
            `INSERT INTO judge_expertise (event_id, judge_id, tags, source, model)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (event_id, judge_id) DO UPDATE SET tags = EXCLUDED.tags, source = EXCLUDED.source, model = EXCLUDED.model, updated_at = now()`,
            [event.id, e.id, e.tags, e.source, e.model],
          );
          judgeDtos.push({ judgeId: e.id, tags: e.tags, source: e.source, model: e.model });
        }

        await audit(t, actor, {
          eventId: event.id,
          action: "ai.classified",
          entityType: "event",
          entityId: event.id,
          summary: `AI classified ${projects.length} projects and ${judgeDtos.length} judges`,
          data: { projects: projects.length, judges: judgeDtos.length },
        });
        return { projects: projects.length, judges: judgeDtos.length };
      });
    },
  }),

  route({
    method: "get",
    path: "/api/events/:eventId/ai/matrix",
    summary: "Cached classifications, judge expertise and affinity (AI routing preview)",
    tags: ["AI"],
    auth: "event:manage",
    async handler({ app, params, actor, tx }) {
      return tx(async (t) => {
        const event = await loadManagedEvent(t, actor, params.eventId!);
        const projects = await many<AiClassificationDto>(
          t,
          `SELECT pc.submission_id AS "submissionId", pc.tags, pc.primary_tag AS "primaryTag", pc.confidence,
                  pc.source, pc.model, pc.updated_at AS "updatedAt"
             FROM project_classifications pc WHERE pc.event_id = $1`,
          [event.id],
        );
        const judges = await many<AiExpertiseDto>(
          t,
          `SELECT je.judge_id AS "judgeId", je.tags, je.source, je.model FROM judge_expertise je WHERE je.event_id = $1`,
          [event.id],
        );
        const conflicts = await many<{ judge_id: string; submission_id: string }>(
          t,
          "SELECT judge_id, submission_id FROM conflicts WHERE event_id = $1",
          [event.id],
        );
        let pairs: AiMatrixDto["pairs"] = [];
        if (app.ai.enabled && projects.length && judges.length) {
          const proj = await many<{ id: string; track_id: string | null }>(t, "SELECT id, track_id FROM submissions WHERE event_id = $1", [event.id]);
          const trackOf = new Map(proj.map((p) => [p.id, p.track_id]));
          pairs = await aiCall(() =>
            app.ai.affinity(
              projects.map((p) => ({ id: p.submissionId, tags: p.tags, track: trackOf.get(p.submissionId) ?? null })),
              judges.map((j) => ({ id: j.judgeId, tags: j.tags, scope: [] })),
              conflicts.map((c) => [c.judge_id, c.submission_id] as [string, string]),
            ),
          );
        }
        return { projects, judges, pairs } satisfies AiMatrixDto;
      });
    },
  }),

  route({
    method: "get",
    path: "/api/ai/submissions/:submissionId/summary",
    summary: "Cached AI project summary and tags (generates on first view)",
    tags: ["AI"],
    auth: "public",
    rateLimit: { bucket: "aiGenerate", spec: { capacity: 6, perMinute: 6 } },
    async handler({ app, params, actor, tx }) {
      const submissionId = params.submissionId!;
      const cached = await tx((t) =>
        one<{ summary: string; tags: string[]; primary_tag: string; source: string; model: string; created_at: string }>(
          t,
          "SELECT summary, tags, primary_tag, source, model, created_at FROM project_summaries WHERE submission_id = $1",
          [submissionId],
        ),
      );
      if (cached) {
        return {
          enabled: app.ai.enabled,
          submissionId,
          summary: cached.summary,
          tags: cached.tags ?? [],
          primaryTag: cached.primary_tag,
          model: cached.model,
          source: cached.source,
          generatedAt: cached.created_at,
        };
      }
      if (!app.ai.enabled) {
        return { enabled: false, submissionId, summary: null, tags: [], primaryTag: null, model: null, source: null, generatedAt: null };
      }
      const info = await tx(async (t) => {
        const row = await one<{ id: string; title: string; tagline: string; description: string; answers: Record<string, string>; event_id: string; status: string; track_id: string | null; tech_tags: string[] }>(
          t,
          `SELECT s.id, s.title, s.tagline, s.description, s.answers, s.event_id, s.track_id, s.tech_tags, e.status
             FROM submissions s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
          [submissionId],
        );
        if (!row) throw notFound("Project");
        // Published and archived events are public; drafts are not.
        if (row.status === "draft" && !(await isEventOrganizer(t, actor.user, row.event_id))) throw notFound("Project");
        return row;
      });
      // Submission answers are arbitrary JSON; stringify non-strings for the model.
      const answers = Object.fromEntries(
        Object.entries(info.answers ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
      );
      const out = await aiCall(() => app.ai.summary({ title: info.title, tagline: info.tagline, description: info.description, answers }));
      let tags: string[] = [];
      let primaryTag = "general";
      try {
        const [cls] = await app.ai.classify([{ id: info.id, title: info.title, tagline: info.tagline, description: info.description, techTags: info.tech_tags ?? [], track: null }]);
        if (cls) {
          tags = cls.tags;
          primaryTag = cls.primaryTag;
        }
      } catch {
        /* tags are optional */
      }
      const generatedAt = new Date(app.now()).toISOString();
      await app.db.system((t) =>
        t.query(
          `INSERT INTO project_summaries (submission_id, event_id, summary, tags, primary_tag, source, model)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (submission_id) DO UPDATE SET summary = EXCLUDED.summary, tags = EXCLUDED.tags,
             primary_tag = EXCLUDED.primary_tag, source = EXCLUDED.source, model = EXCLUDED.model`,
          [info.id, info.event_id, out.summary, tags, primaryTag, out.source, out.model],
        ),
      );
      return { enabled: true, submissionId, summary: out.summary, tags, primaryTag, model: out.model, source: out.source, generatedAt };
    },
  }),

  route({
    method: "post",
    path: "/api/judge/assignments/:assignmentId/ai/feedback",
    summary: "Draft judge feedback for your own assignment (Gemma, template fallback)",
    description: "Advisory draft only. It is stored privately and never submitted as a ballot.",
    tags: ["AI"],
    auth: "judging:score",
    body: feedbackInput,
    rateLimit: { bucket: "aiGenerate", spec: { capacity: 6, perMinute: 6 } },
    async handler({ app, params, body, actor, tx }) {
      assertEnabled(app.ai.enabled);
      const data = await tx(async (t) => {
        const a = await one<{ id: string; event_id: string; submission_id: string; title: string; tagline: string; track_id: string | null }>(
          t,
          `SELECT a.id, a.event_id, a.submission_id, s.title, s.tagline, s.track_id
             FROM assignments a JOIN submissions s ON s.id = a.submission_id WHERE a.id = $1`,
          [params.assignmentId],
        );
        if (!a) throw notFound("Assignment");
        const criteria = await many<{ name: string; weight: number; max: number; guidance: string; value: number }>(
          t,
          `SELECT c.name, c.weight, c.max_score AS max, c.description AS guidance, coalesce(sc.value, 0) AS value
             FROM criteria c LEFT JOIN scores sc ON sc.criterion_id = c.id AND sc.assignment_id = $1
            WHERE c.event_id = $2 AND (c.track_id IS NULL OR c.track_id = $3) ORDER BY c.position`,
          [a.id, a.event_id, a.track_id],
        );
        return { a, criteria };
      });
      const out = await aiCall(() =>
        app.ai.feedback({
          title: data.a.title,
          tagline: data.a.tagline,
          notes: body.notes ?? "",
          criteria: data.criteria.map((c) => ({ name: c.name, weight: c.weight, value: c.value, max: c.max, guidance: c.guidance })),
        }),
      );
      const generatedAt = new Date(app.now()).toISOString();
      await tx((t) =>
        t.query(
          `INSERT INTO judge_feedback (assignment_id, event_id, judge_id, draft, source, model)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (assignment_id) DO UPDATE SET draft = EXCLUDED.draft, source = EXCLUDED.source, model = EXCLUDED.model, updated_at = now()`,
          [data.a.id, data.a.event_id, actor.user!.id, out.feedback, out.source, out.model],
        ),
      );
      return { assignmentId: data.a.id, draft: out.feedback, model: out.model, source: out.source, generatedAt };
    },
  }),
];
