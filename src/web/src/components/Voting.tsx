import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { EventDto } from "@dogfood/core";
import { ApiError, errorMessage, get, post, put } from "../lib/api";
import { cx } from "../lib/format";
import { useSession } from "../lib/session";
import { Banner, Button, Dialog, Icon, IconButton, LinearProgress, TextField, useToast } from "../ui";
import { Countdown } from "./Countdown";

export interface VoteState {
  mode: "off" | "open" | "email" | "authenticated";
  style: "single" | "quadratic";
  votingOpen: boolean;
  closesAt: string | null;
  identified: boolean;
  budget: number;
  spent: number;
  remaining: number;
  allocation: Record<string, number>;
}

export function useVoteState(event: EventDto | undefined) {
  return useQuery({
    queryKey: ["votes-me", event?.id],
    queryFn: () => get<VoteState>(`/api/events/${event!.id}/votes/me`),
    enabled: Boolean(event && event.votingMode !== "off"),
  });
}

function EmailVerifyDialog({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const request = useMutation({
    mutationFn: () => post(`/api/events/${eventId}/votes/email-code`, { email }),
    onSuccess: () => setSent(true),
  });
  const verify = useMutation({
    mutationFn: () => post(`/api/events/${eventId}/votes/verify`, { email, code }),
    onSuccess: () => {
      toast.success("Email verified — you can vote now.");
      qc.invalidateQueries({ queryKey: ["votes-me", eventId] });
      onClose();
    },
  });
  const err = request.error ?? verify.error;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Verify your email to vote"
      icon="mail"
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          {sent ? (
            <Button loading={verify.isPending} onClick={() => verify.mutate()} disabled={code.length !== 6}>Verify</Button>
          ) : (
            <Button loading={request.isPending} onClick={() => request.mutate()} disabled={!email.includes("@")}>Send code</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          One person, one ballot: we send a 6-digit code to your inbox. This offline deployment delivers mail to the platform's local outbox, which
          organizers and admins can read.
        </p>
        {err ? <Banner tone="error">{errorMessage(err)}</Banner> : null}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} leadingIcon="mail" />
        {sent ? (
          <TextField label="6-digit code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} leadingIcon="key" supporting="Check your inbox (or ask an organizer for the outbox entry)." />
        ) : null}
      </div>
    </Dialog>
  );
}

/** Budget meter + mode explanation shown above the gallery during a voting window. */
export function VotingBar({ event, state }: { event: EventDto; state: VoteState }) {
  const { user } = useSession();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const unit = state.style === "quadratic" ? "credits" : "picks";
  let gate: ReactNode = null;
  if (state.mode === "authenticated" && !user) {
    gate = (
      <Link to={`/login?next=/e/${event.slug}/gallery`} className="underline">
        Sign in to vote
      </Link>
    );
  } else if (state.mode === "email" && !state.identified) {
    gate = (
      <Button size="xs" variant="filled" icon="mail" onClick={() => setVerifyOpen(true)}>
        Verify email to vote
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-tertiary-container p-4 text-on-tertiary-container medium:flex-row medium:items-center medium:gap-6">
      <div className="flex items-center gap-3">
        <Icon name="how_to_vote" size={28} />
        <div>
          <p className="type-title-md">Community voting is open</p>
          <p className="type-body-sm opacity-85">
            {state.style === "quadratic" ? `Quadratic: v votes on one project cost v² credits.` : `Back up to ${state.budget} projects.`} Tallies stay hidden until voting closes; order is shuffled for you.
          </p>
        </div>
      </div>
      <div className="flex-1">
        {gate ?? (
          <div>
            <div className="mb-1 flex justify-between type-label-md">
              <span>
                {state.spent} / {state.budget} {unit} used
              </span>
              <span>{state.remaining} left</span>
            </div>
            <LinearProgress value={state.spent} max={state.budget} label={`${unit} used`} tone="tertiary" wavy />
          </div>
        )}
      </div>
      {state.closesAt ? (
        <div className="type-label-md">
          Closes in <Countdown target={state.closesAt} label="Voting closes" compact />
        </div>
      ) : null}
      <EmailVerifyDialog eventId={event.id} open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </div>
  );
}

/** Per-project control: heart toggle (single) or ± stepper (quadratic). */
export function VoteControl({ event, state, submissionId, compact }: { event: EventDto; state: VoteState; submissionId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const mine = state.allocation[submissionId] ?? 0;
  const cast = useMutation({
    mutationFn: (votes: number) => put<{ allocation: Record<string, number> }>(`/api/submissions/${submissionId}/vote`, { votes }),
    onSuccess: (_d, votes) => {
      qc.invalidateQueries({ queryKey: ["votes-me", event.id] });
      if (votes > mine) toast.success("Vote recorded");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "EMAIL_VERIFICATION_REQUIRED") toast.error("Verify your email first (button above).");
      else toast.error(errorMessage(e));
    },
  });
  const blocked = (state.mode === "email" && !state.identified) || !state.votingOpen;
  if (state.style === "quadratic") {
    const nextCost = (mine + 1) ** 2 - mine ** 2;
    return (
      <div className={cx("inline-flex items-center gap-1 rounded-full bg-surface-container-high p-1", compact && "scale-95")}>
        <IconButton icon="remove" label="Remove a vote" size="sm" disabled={blocked || mine === 0 || cast.isPending} onClick={() => cast.mutate(mine - 1)} />
        <span className="min-w-8 text-center type-title-sm tabular-nums text-on-surface" aria-live="polite">
          {mine}
        </span>
        <IconButton icon="add" label={`Add a vote (costs ${nextCost} credits)`} size="sm" variant="tonal" disabled={blocked || nextCost > state.remaining || cast.isPending} onClick={() => cast.mutate(mine + 1)} />
      </div>
    );
  }
  const selected = mine > 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={blocked || cast.isPending || (!selected && state.remaining <= 0)}
      onClick={() => cast.mutate(selected ? 0 : 1)}
      className={cx(
        "state-layer focus-ring inline-flex h-10 items-center gap-2 rounded-full px-4 type-label-lg transition-[border-radius,background-color] duration-300 ease-[var(--ease-spring-fast)] active:rounded-md disabled:opacity-40",
        selected ? "bg-tertiary text-on-tertiary" : "bg-surface-container-high text-on-surface",
      )}
    >
      <Icon name="favorite" filled={selected} size={20} className="relative z-[1]" />
      <span className="relative z-[1]">{selected ? "Backed" : "Back this"}</span>
    </button>
  );
}
