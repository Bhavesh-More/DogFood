import type { Tx } from "../db/pool";
import type { AppContext } from "../http/context";
import { many } from "../db/pool";

/**
 * Build a judge↔project affinity map from the data already in the database
 * (tech tags, track names, and any stored classifications/expertise), then ask
 * the sidecar to score overlaps. Returns `undefined` when AI is off or the
 * sidecar is unavailable, so the caller falls back to deterministic routing.
 */
export async function buildAffinityMap(
  app: AppContext,
  t: Tx,
  eventId: string,
  submissions: readonly { id: string; track_id: string | null }[],
  judges: readonly { user_id: string; track_ids: string[] | null }[],
  conflicts: readonly { judge_id: string; submission_id: string }[],
): Promise<Map<string, number> | undefined> {
  if (!app.ai.enabled || submissions.length === 0 || judges.length === 0) return undefined;
  try {
    const tracks = await many<{ id: string; name: string }>(t, "SELECT id, name FROM tracks WHERE event_id = $1", [eventId]);
    const trackName = new Map(tracks.map((tr) => [tr.id, tr.name]));
    const tech = await many<{ id: string; tech_tags: string[] }>(t, "SELECT id, tech_tags FROM submissions WHERE event_id = $1", [eventId]);
    const techTags = new Map(tech.map((s) => [s.id, s.tech_tags ?? []]));
    const classifications = await many<{ submission_id: string; tags: string[] }>(
      t,
      "SELECT submission_id, tags FROM project_classifications WHERE event_id = $1",
      [eventId],
    );
    const classTags = new Map(classifications.map((c) => [c.submission_id, c.tags ?? []]));
    const expertise = await many<{ judge_id: string; tags: string[] }>(
      t,
      "SELECT judge_id, tags FROM judge_expertise WHERE event_id = $1",
      [eventId],
    );
    const expertTags = new Map(expertise.map((e) => [e.judge_id, e.tags ?? []]));

    const projects = submissions.map((s) => {
      const track = s.track_id ? (trackName.get(s.track_id) ?? null) : null;
      const tags = [...new Set([...(classTags.get(s.id) ?? []), ...(techTags.get(s.id) ?? []), ...(track ? [track.toLowerCase()] : [])])];
      return { id: s.id, tags, track };
    });
    const judgeInputs = judges.map((j) => {
      const scope = (j.track_ids ?? []).map((id) => trackName.get(id) ?? id);
      return { id: j.user_id, tags: [...new Set([...(expertTags.get(j.user_id) ?? []), ...scope.map((s) => s.toLowerCase())])], scope };
    });

    const pairs = await app.ai.affinity(
      projects,
      judgeInputs,
      conflicts.map((c) => [c.judge_id, c.submission_id] as [string, string]),
    );
    const map = new Map<string, number>();
    for (const p of pairs) map.set(`${p.judgeId}\u0000${p.submissionId}`, p.score);
    return map;
  } catch {
    return undefined; // sidecar down/slow: deterministic routing is unaffected
  }
}
