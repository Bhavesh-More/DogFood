import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { AiFeedbackDto } from "@dogfood/core";
import { errorMessage, post } from "../lib/api";
import { Button, Icon, useToast } from "../ui";
import { ShimmerLines } from "./AiShimmer";
import { useAiStatus } from "./AiSummary";

/**
 * Optional judge writing aid. Produces a private draft the judge can edit or
 * insert into their notes; it never touches the ballot.
 */
export function JudgeFeedback({ assignmentId, onUse }: { assignmentId: string; onUse: (text: string) => void }) {
  const status = useAiStatus();
  const [draft, setDraft] = useState<string | null>(null);
  const toast = useToast();
  const gen = useMutation({
    mutationFn: () => post<AiFeedbackDto>(`/api/judge/assignments/${assignmentId}/ai/feedback`, {}),
    onSuccess: (d) => setDraft(d.draft),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (status.data?.service !== "up") return null;

  return (
    <div data-tour="ai-feedback" className="rounded-lg bg-surface-container p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 type-label-lg text-on-surface">
          <Icon name="star_shine" size={18} className="text-primary" /> AI writing assist
        </span>
        <Button size="xs" variant="tonal" icon="wand_stars" loading={gen.isPending} onClick={() => gen.mutate()}>
          {draft ? "Regenerate" : "Draft feedback"}
        </Button>
      </div>
      <div className="mt-3" aria-live="polite">
        {gen.isPending ? (
          <ShimmerLines lines={3} />
        ) : draft ? (
          <>
            <p className="type-body-md text-on-surface">{draft}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="xs" variant="text" icon="content_copy" onClick={() => onUse(draft)}>
                Insert into notes
              </Button>
              <Button size="xs" variant="text" onClick={() => setDraft(null)}>
                Dismiss
              </Button>
            </div>
          </>
        ) : (
          <p className="type-body-sm text-on-surface-variant">Draft a starting point from your rubric scores, then edit it in your own words.</p>
        )}
      </div>
    </div>
  );
}
