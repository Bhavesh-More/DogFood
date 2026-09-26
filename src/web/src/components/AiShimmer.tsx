import { cx } from "../lib/format";

/** Gemini-style shimmer placeholder: soft sweeping lines, theme-aware. */
export function ShimmerLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cx("ai-shimmer h-3.5 rounded-full", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
