import { cx, hashUnit } from "../lib/format";
import { SHAPE_NAMES, shapePath } from "./Shape";

const PALETTES = [
  ["var(--md-primary-container)", "var(--md-primary)", "var(--md-tertiary-container)"],
  ["var(--md-tertiary-container)", "var(--md-tertiary)", "var(--md-primary-fixed-dim)"],
  ["var(--md-secondary-container)", "var(--md-secondary)", "var(--md-tertiary-container)"],
  ["var(--md-primary-fixed)", "var(--md-primary)", "var(--md-secondary-container)"],
  ["var(--md-surface-container-highest)", "var(--md-tertiary)", "var(--md-primary-container)"],
] as const;

/**
 * Generated cover art for projects/events without an uploaded thumbnail:
 * a deterministic composition of M3 Expressive shapes in theme colours, so it
 * looks intentional in both light and dark themes and needs no assets.
 */
export function GeneratedArt({ seed, label, className, big }: { seed: string; label?: string; className?: string; big?: boolean }) {
  const pal = PALETTES[Math.floor(hashUnit(seed) * PALETTES.length)]!;
  const shapes = [0, 1, 2].map((i) => {
    const name = SHAPE_NAMES[Math.floor(hashUnit(seed, i + 11) * SHAPE_NAMES.length)]!;
    return {
      d: shapePath(name),
      x: -10 + hashUnit(seed, i + 21) * 70,
      y: -15 + hashUnit(seed, i + 31) * 55,
      s: (i === 0 ? 1.1 : 0.55) + hashUnit(seed, i + 41) * 0.5,
      r: hashUnit(seed, i + 51) * 90,
      fill: i === 0 ? pal[1] : i === 1 ? pal[2] : pal[1],
      o: i === 2 ? 0.35 : 1,
    };
  });
  const letters = (label ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ background: pal[0] }} aria-hidden>
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {shapes.map((s, i) => (
          <path key={i} d={s.d} fill={s.fill} opacity={s.o} transform={`translate(${s.x + 40} ${s.y + 20}) rotate(${s.r} 50 50) scale(${s.s})`} />
        ))}
      </svg>
      {letters ? (
        <span
          className={cx(
            "absolute bottom-2 left-3 font-rounded font-bold tracking-tight text-on-primary mix-blend-normal",
            big ? "text-6xl" : "text-3xl",
          )}
          style={{ textShadow: "0 2px 12px rgb(0 0 0 / 0.2)" }}
        >
          {letters}
        </span>
      ) : null}
    </div>
  );
}

/** Uploaded image if present, otherwise generated art. */
export function Cover({ src, seed, label, className, big }: { src?: string; seed: string; label?: string; className?: string; big?: boolean }) {
  if (src) {
    return <img src={src} alt="" loading="lazy" className={cx("object-cover", className)} />;
  }
  return <GeneratedArt seed={seed} label={label} className={className} big={big} />;
}
