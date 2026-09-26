import { useQuery } from "@tanstack/react-query";
import type { AiStatusDto, AiSummaryDto } from "@dogfood/core";
import { get } from "../lib/api";
import { Card, Icon } from "../ui";
import { ShimmerLines } from "./AiShimmer";

/** Shared status query; every AI affordance hides when this is not enabled. */
export function useAiStatus() {
  return useQuery({
    queryKey: ["ai-status"],
    queryFn: () => get<AiStatusDto>("/api/ai/status"),
    staleTime: 60_000,
    retry: false,
  });
}

export function AiSummary({ submissionId }: { submissionId: string }) {
  const status = useAiStatus();
  // Hide when AI is disabled OR enabled but the sidecar is unreachable.
  const enabled = status.data?.service === "up";
  const q = useQuery({
    queryKey: ["ai-summary", submissionId],
    queryFn: () => get<AiSummaryDto>(`/api/ai/submissions/${submissionId}/summary`),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
  if (!enabled) return null;

  return (
    <Card variant="filled" radius="2xl" data-tour="ai-summary">
      <div className="flex items-center gap-2">
        <Icon name="star_shine" size={20} className="text-primary" />
        <h2 className="type-title-md text-on-surface">AI summary</h2>
        <span className="type-label-sm text-on-surface-variant">generated locally</span>
      </div>
      <div className="mt-3" aria-live="polite">
        {q.isPending ? (
          <ShimmerLines lines={3} />
        ) : q.data?.summary ? (
          <>
            <p className="type-body-md text-on-surface">{q.data.summary}</p>
            {q.data.tags.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.data.tags.slice(0, 8).map((t) => (
                  <span key={t} className="rounded-sm bg-surface-container-highest px-2 py-1 font-mono type-label-md text-on-surface">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="mt-3 type-body-sm text-on-surface-variant">
              {q.data.source}/{q.data.model} · always advisory, never part of the score
            </p>
          </>
        ) : (
          <p className="type-body-sm text-on-surface-variant">No summary available yet.</p>
        )}
      </div>
    </Card>
  );
}
