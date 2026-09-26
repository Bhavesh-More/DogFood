import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiMatrixDto } from "@dogfood/core";
import { errorMessage, get, post } from "../lib/api";
import { Button, Card, Icon, Pill, useToast } from "../ui";
import { ShimmerLines } from "./AiShimmer";
import { useAiStatus } from "./AiSummary";

/**
 * Organizer view of the AI classifier: projects tagged from their problem
 * statement, judges tagged from their expertise, and the affinity the router
 * uses as a tie-break. Advisory only — it never changes hard constraints.
 */
export function AiRoutingPanel({ eventId }: { eventId: string }) {
  const status = useAiStatus();
  const qc = useQueryClient();
  const toast = useToast();
  const enabled = status.data?.service === "up";

  const classify = useMutation({
    mutationFn: () => post<{ projects: number; judges: number }>(`/api/events/${eventId}/ai/classify`),
    onSuccess: (r) => {
      toast.success(`Classified ${r.projects} projects and ${r.judges} judges`);
      qc.invalidateQueries({ queryKey: ["ai-matrix", eventId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const matrix = useQuery({
    queryKey: ["ai-matrix", eventId],
    queryFn: () => get<AiMatrixDto>(`/api/events/${eventId}/ai/matrix`),
    enabled,
    staleTime: 15_000,
    retry: false,
  });

  if (!enabled) return null;
  const data = matrix.data;

  return (
    <Card variant="outlined" data-tour="ai-routing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="star_shine" size={20} className="text-primary" />
          <h3 className="type-title-md text-on-surface">AI classification &amp; routing</h3>
        </div>
        <Button size="sm" variant="tonal" icon="wand_stars" loading={classify.isPending} onClick={() => classify.mutate()}>
          Analyse projects &amp; judges
        </Button>
      </div>
      <p className="mt-2 type-body-md text-on-surface-variant">
        Projects are classified from their problem statement; judges from their track scope and history. Routing uses the
        affinity only as a tie-break, so scope, conflicts and balance are unchanged.
      </p>
      {matrix.isPending ? (
        <ShimmerLines className="mt-4" lines={2} />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 medium:grid-cols-2">
          <div>
            <p className="type-label-lg text-on-surface-variant">Project classifications ({data?.projects.length ?? 0})</p>
            <ul className="mt-2 flex flex-col gap-2">
              {(data?.projects ?? []).slice(0, 8).map((p) => (
                <li key={p.submissionId} className="flex flex-wrap items-center gap-2">
                  <Pill tone="secondary">{p.primaryTag}</Pill>
                  <span className="type-body-sm text-on-surface-variant">{p.tags.slice(0, 5).join(", ") || "—"}</span>
                </li>
              ))}
              {!data?.projects.length ? <li className="type-body-sm text-on-surface-variant">Not analysed yet.</li> : null}
            </ul>
          </div>
          <div>
            <p className="type-label-lg text-on-surface-variant">Judge expertise ({data?.judges.length ?? 0})</p>
            <ul className="mt-2 flex flex-col gap-2">
              {(data?.judges ?? []).slice(0, 8).map((j) => (
                <li key={j.judgeId} className="type-body-sm text-on-surface-variant">
                  <span className="font-mono">{j.judgeId}</span> · {j.tags.slice(0, 6).join(", ") || "—"}
                </li>
              ))}
              {!data?.judges.length ? <li className="type-body-sm text-on-surface-variant">Not analysed yet.</li> : null}
            </ul>
          </div>
        </div>
      )}
      {data?.pairs.length ? (
        <p className="mt-3 type-body-sm text-on-surface-variant">{data.pairs.length} judge↔project affinity scores ready for the next routing run.</p>
      ) : null}
    </Card>
  );
}
