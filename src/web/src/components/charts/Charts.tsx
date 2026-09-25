import { useState, type ReactNode } from "react";
import { cx } from "../../lib/format";

/*
 * Small dependency-free SVG charts following the dataviz rules:
 * thin marks (≤ 24px bars, 4px rounded data ends, square at the baseline),
 * hairline solid gridlines, text in text tokens (never the series colour),
 * a hover/focus tooltip on every mark, and values always reachable as text.
 */

interface TooltipState {
  x: number;
  y: number;
  value: string;
  label: string;
}

function Tooltip({ t }: { t: TooltipState | null }) {
  if (!t) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-inverse-surface px-3 py-2 shadow-2"
      style={{ left: t.x, top: t.y - 10 }}
    >
      <p className="type-title-sm text-inverse-on-surface">{t.value}</p>
      <p className="max-w-56 truncate type-body-sm text-inverse-on-surface/80">{t.label}</p>
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  display?: string;
  hint?: ReactNode;
}

/** Horizontal bar list — one series, one colour; values printed at the bar tip. */
export function BarList({ data, max, ariaLabel, color = "var(--chart-1)" }: { data: BarDatum[]; max?: number; ariaLabel: string; color?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-3">
      {data.map((d) => {
        const pct = Math.max(0, Math.min(100, (d.value / top) * 100));
        return (
          <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <div className="min-w-0 truncate type-body-md text-on-surface">{d.label}</div>
            <div className="type-label-lg tabular-nums text-on-surface">{d.display ?? d.value}</div>
            <div className="col-span-2 flex h-3 items-center" title={`${d.display ?? d.value}`}>
              <div className="h-3 rounded-r-[4px]" style={{ width: `${pct}%`, minWidth: d.value > 0 ? 4 : 0, background: color }} />
              <div className="h-px flex-1 bg-outline-variant" />
            </div>
            {d.hint ? <div className="col-span-2 type-body-sm text-on-surface-variant">{d.hint}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Diverging bars around zero (e.g. judge leniency): cool = below, warm = above. */
export function DivergingBars({
  data,
  ariaLabel,
  negativeLabel,
  positiveLabel,
  format = (v) => v.toFixed(1),
}: {
  data: { key: string; label: string; value: number; note?: string }[];
  ariaLabel: string;
  negativeLabel: string;
  positiveLabel: string;
  format?: (v: number) => string;
}) {
  const extent = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <figure aria-label={ariaLabel}>
      <div className="mb-3 flex items-center justify-between type-label-md text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--chart-cool)" }} /> {negativeLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {positiveLabel} <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--chart-warm)" }} />
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {data.map((d) => {
          const pct = (Math.abs(d.value) / extent) * 50;
          const neg = d.value < 0;
          return (
            <li key={d.key} className="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-3" title={`${d.label}: ${format(d.value)}${d.note ? ` · ${d.note}` : ""}`}>
              <span className="truncate type-body-md text-on-surface">{d.label}</span>
              <div className="relative h-4">
                <div className="absolute inset-y-0 left-1/2 w-px bg-outline" />
                <div
                  className={cx("absolute top-0.5 h-3", neg ? "rounded-l-[4px]" : "rounded-r-[4px]")}
                  style={{
                    width: `${pct}%`,
                    left: neg ? `${50 - pct}%` : "50%",
                    background: neg ? "var(--chart-cool)" : "var(--chart-warm)",
                  }}
                />
              </div>
              <span className="text-right type-label-lg tabular-nums text-on-surface">{d.value > 0 ? "+" : ""}{format(d.value)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export interface StripRow {
  key: string;
  label: string;
  sublabel?: string;
  points: { key: string; value: number; label: string }[];
}

/**
 * Strip plot: one row per judge, one dot per ballot on a 0–100 axis, with the
 * row mean as a tick. Used side by side for raw vs normalized scores.
 */
export function StripPlot({ rows, title, ariaLabel, color = "var(--chart-1)", domain = [0, 100], marker }: { rows: StripRow[]; title: string; ariaLabel: string; color?: string; domain?: [number, number]; marker?: number }) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const W = 420;
  const L = 0;
  const rowH = 44;
  const H = rows.length * rowH + 26;
  const x = (v: number) => L + ((Math.max(domain[0], Math.min(domain[1], v)) - domain[0]) / (domain[1] - domain[0])) * (W - L);
  const ticks = [0, 25, 50, 75, 100].map((t) => domain[0] + ((domain[1] - domain[0]) * t) / 100);
  return (
    <figure className="relative" aria-label={ariaLabel} onMouseLeave={() => setTip(null)}>
      <figcaption className="mb-2 type-title-sm text-on-surface">{title}</figcaption>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
        <div>
          {rows.map((r) => (
            <div key={r.key} className="flex h-[44px] flex-col justify-center">
              <span className="truncate type-label-lg text-on-surface">{r.label}</span>
              {r.sublabel ? <span className="truncate type-label-sm text-on-surface-variant">{r.sublabel}</span> : null}
            </div>
          ))}
        </div>
        <div className="relative">
          <svg viewBox={`-6 0 ${W + 12} ${H}`} className="w-full overflow-visible" style={{ height: H }} role="img" aria-label={ariaLabel}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={0} y2={rows.length * rowH} stroke="var(--md-outline-variant)" strokeWidth={1} />
                <text x={x(t)} y={rows.length * rowH + 18} textAnchor="middle" fontSize={11} fill="var(--md-on-surface-variant)" className="tabular-nums">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {marker !== undefined ? <line x1={x(marker)} x2={x(marker)} y1={0} y2={rows.length * rowH} stroke="var(--md-on-surface-variant)" strokeWidth={1.5} /> : null}
            {rows.map((r, i) => {
              const cy = i * rowH + rowH / 2;
              const mean = r.points.reduce((a, p) => a + p.value, 0) / Math.max(1, r.points.length);
              return (
                <g key={r.key}>
                  <line x1={0} x2={W} y1={cy} y2={cy} stroke="var(--md-outline-variant)" strokeWidth={1} opacity={0.6} />
                  {r.points.length ? <line x1={x(mean)} x2={x(mean)} y1={cy - 11} y2={cy + 11} stroke="var(--md-on-surface)" strokeWidth={2} strokeLinecap="round" /> : null}
                  {r.points.map((p) => (
                    <g
                      key={p.key}
                      tabIndex={0}
                      role="img"
                      aria-label={`${p.label}: ${p.value.toFixed(1)}`}
                      className="cursor-default outline-none [&:focus-visible>circle:last-child]:stroke-[var(--md-secondary)]"
                      onMouseEnter={(e) => {
                        const box = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
                        const c = (e.currentTarget as SVGGElement).getBoundingClientRect();
                        setTip({ x: c.left - box.left + c.width / 2, y: c.top - box.top, value: p.value.toFixed(1), label: `${r.label} · ${p.label}` });
                      }}
                      onFocus={(e) => {
                        const box = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
                        const c = (e.currentTarget as SVGGElement).getBoundingClientRect();
                        setTip({ x: c.left - box.left + c.width / 2, y: c.top - box.top, value: p.value.toFixed(1), label: `${r.label} · ${p.label}` });
                      }}
                      onBlur={() => setTip(null)}
                    >
                      <circle cx={x(p.value)} cy={cy} r={12} fill="transparent" />
                      <circle cx={x(p.value)} cy={cy} r={5} fill={color} stroke="var(--md-surface-container-low)" strokeWidth={2} />
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
          <Tooltip t={tip} />
        </div>
      </div>
    </figure>
  );
}
