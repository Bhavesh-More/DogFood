import type { ReactNode } from "react";
import { cx } from "../lib/format";

interface LinearProps {
  value?: number;
  max?: number;
  label: string;
  wavy?: boolean;
  tone?: "primary" | "tertiary" | "success";
  className?: string;
}

const TONE = { primary: "var(--md-primary)", tertiary: "var(--md-tertiary)", success: "var(--md-success)" };

/**
 * M3 Expressive linear progress. The wavy variant draws the active track as a
 * sine wave (the Expressive "wavy" indicator); indeterminate when no value.
 */
export function LinearProgress({ value, max = 100, label, wavy, tone = "primary", className }: LinearProps) {
  const pct = value === undefined ? undefined : Math.max(0, Math.min(100, (value / max) * 100));
  const color = TONE[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === undefined ? undefined : Math.round(pct)}
      className={cx("relative flex h-3 w-full items-center gap-1 overflow-hidden", className)}
    >
      {pct === undefined ? (
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-secondary-container">
          <div className="absolute inset-y-0 rounded-full" style={{ background: color, animation: "md-indeterminate 1.6s var(--ease-emphasized) infinite" }} />
        </div>
      ) : (
        <>
          <div className="relative h-3 overflow-hidden" style={{ width: `${pct}%` }}>
            {wavy && pct > 2 ? (
              <svg className="absolute inset-y-0 left-0 h-3" style={{ width: "calc(100% + 40px)", animation: "md-wave 1.2s linear infinite" }} preserveAspectRatio="none" viewBox="0 0 400 12" aria-hidden>
                <path d={Array.from({ length: 21 }, (_, i) => `${i === 0 ? "M" : "Q"}${i === 0 ? "0,6" : `${i * 20 - 10},${i % 2 ? 1 : 11} ${i * 20},6`}`).join(" ")} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
              </svg>
            ) : (
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: color }} />
            )}
          </div>
          {pct < 100 ? <div className="h-1 flex-1 rounded-full bg-secondary-container" /> : null}
          {pct < 100 ? <div className="h-1 w-1 shrink-0 rounded-full" style={{ background: color }} /> : null}
        </>
      )}
    </div>
  );
}

interface RingProps {
  value: number;
  max?: number;
  size?: number;
  label: string;
  children?: ReactNode;
  tone?: "primary" | "tertiary" | "success";
}

/** Determinate circular progress with a gap between active and track (M3). */
export function ProgressRing({ value, max = 100, size = 56, label, children, tone = "primary" }: RingProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const stroke = Math.max(4, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = pct > 0 && pct < 1 ? stroke * 1.6 : 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--md-secondary-container)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${Math.max(0, c * (1 - pct) - gap * 2)} ${c}`} strokeDashoffset={-(c * pct + gap)} />
        {pct > 0 ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE[tone]} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-emphasized)]" /> : null}
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}

/** M3 Expressive loading indicator: a shape that morphs while rotating. */
export function LoadingIndicator({ label = "Loading", size = 48, contained }: { label?: string; size?: number; contained?: boolean }) {
  return (
    <div role="status" aria-label={label} className={cx("inline-grid place-items-center", contained && "rounded-full bg-primary-container")} style={{ width: size, height: size }}>
      <div className="animate-morph bg-primary" style={{ width: size * 0.62, height: size * 0.62 }} />
    </div>
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingIndicator label={label} size={64} contained />
        <p className="type-body-md text-on-surface-variant">{label}…</p>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("relative overflow-hidden rounded-md bg-surface-container-high", className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: "md-shimmer 1.4s infinite" }} />
    </div>
  );
}
