import { countdown } from "@dogfood/core";
import { cx } from "../lib/format";
import { formatUtc, useServerNow } from "../lib/time";

/**
 * Deadline countdown anchored to the server clock (see lib/time). The API is
 * still the authority: the countdown is a hint, the server rejects late writes.
 */
export function Countdown({ target, label, compact, tone = "primary" }: { target: string; label: string; compact?: boolean; tone?: "primary" | "tertiary" | "error" }) {
  const now = useServerNow();
  const c = countdown(target, now);
  const done = c.totalMs === 0;
  const parts: [number, string][] = [
    [c.days, "days"],
    [c.hours, "hrs"],
    [c.minutes, "min"],
    [c.seconds, "sec"],
  ];
  const toneCls = {
    primary: "bg-primary text-on-primary",
    tertiary: "bg-tertiary text-on-tertiary",
    error: "bg-error text-on-error",
  }[done ? "error" : c.totalMs < 3_600_000 ? "error" : tone];
  if (compact) {
    return (
      <span className="tabular-nums" title={formatUtc(target)}>
        {done ? "Closed" : `${c.days ? `${c.days}d ` : ""}${String(c.hours).padStart(2, "0")}:${String(c.minutes).padStart(2, "0")}:${String(c.seconds).padStart(2, "0")}`}
      </span>
    );
  }
  return (
    <div>
      <p className="mb-2 type-label-lg text-on-surface-variant">{label}</p>
      {done ? (
        <p className="inline-flex items-center gap-2 rounded-lg bg-error-container px-4 py-3 type-title-md text-on-error-container">Closed · {formatUtc(target)}</p>
      ) : (
        <div className="flex gap-2" role="timer" aria-live="off" aria-label={`${label}: ${c.days} days ${c.hours} hours ${c.minutes} minutes`}>
          {parts.map(([v, unit], i) => (
            <div key={unit} className={cx("flex min-w-[58px] flex-col items-center rounded-lg px-2 py-2", i === 0 ? toneCls : "bg-surface-container-highest text-on-surface")}>
              <span className="font-rounded text-[28px] font-bold leading-8 tabular-nums">{String(v).padStart(2, "0")}</span>
              <span className="type-label-sm opacity-80">{unit}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 font-mono type-body-sm text-on-surface-variant">{formatUtc(target)} · server time</p>
    </div>
  );
}
