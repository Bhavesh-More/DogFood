import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/format";

/**
 * Material 3 Expressive shape library, generated procedurally as SVG paths
 * (polar curves) so no image assets are needed. Used for avatars, hero art,
 * empty states and decorative accents.
 */
export type ShapeName =
  | "circle"
  | "cookie4"
  | "cookie6"
  | "cookie9"
  | "cookie12"
  | "clover4"
  | "clover8"
  | "sunny"
  | "burst"
  | "softBurst"
  | "flower"
  | "gem"
  | "pentagon"
  | "pill"
  | "arch"
  | "square";

const N = 180;

function polar(r: (t: number) => number, rotate = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const radius = r(t);
    const x = 50 + radius * Math.cos(t + rotate);
    const y = 50 + radius * Math.sin(t + rotate);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

function roundedPolygon(sides: number, radius: number, rounding: number): string {
  return polar((t) => {
    const seg = (Math.PI * 2) / sides;
    const local = ((t % seg) + seg) % seg - seg / 2;
    const edge = (radius * Math.cos(Math.PI / sides)) / Math.cos(local);
    return edge * (1 - rounding) + radius * rounding * 0.93;
  });
}

const PATHS: Record<ShapeName, string> = {
  circle: polar(() => 48),
  cookie4: polar((t) => 44 + 4 * Math.cos(4 * t)),
  cookie6: polar((t) => 45 + 3.5 * Math.cos(6 * t)),
  cookie9: polar((t) => 46 + 3 * Math.cos(9 * t)),
  cookie12: polar((t) => 46.5 + 2.5 * Math.cos(12 * t)),
  clover4: polar((t) => 34 + 15 * Math.abs(Math.cos(2 * t)) ** 0.6),
  clover8: polar((t) => 38 + 10 * Math.abs(Math.cos(4 * t)) ** 0.7),
  sunny: polar((t) => 43 + 5.5 * Math.cos(8 * t) ** 3),
  burst: polar((t) => 36 + 13 * Math.abs(Math.cos(6 * t)) ** 6),
  softBurst: polar((t) => 40 + 8 * Math.abs(Math.cos(5 * t)) ** 3),
  flower: polar((t) => 33 + 15 * Math.abs(Math.cos(3 * t)) ** 0.9),
  gem: roundedPolygon(6, 48, 0.25),
  pentagon: roundedPolygon(5, 48, 0.3),
  pill: "M30,8 H70 A22,22 0 0 1 70,92 H30 A22,22 0 0 1 30,8 Z",
  arch: "M8,92 V46 A42,42 0 0 1 92,46 V92 Z",
  square: "M20,4 H80 A16,16 0 0 1 96,20 V80 A16,16 0 0 1 80,96 H20 A16,16 0 0 1 4,80 V20 A16,16 0 0 1 20,4 Z",
};

export const SHAPE_NAMES = Object.keys(PATHS) as ShapeName[];

export function shapePath(name: ShapeName): string {
  return PATHS[name];
}

interface ShapeProps {
  name: ShapeName;
  className?: string;
  style?: CSSProperties;
  /** Fill colour (CSS value); defaults to currentColor. */
  fill?: string;
  children?: ReactNode;
  title?: string;
}

/** A decorative expressive shape; `children` render centred on top. */
export function Shape({ name, className, style, fill = "currentColor", children, title }: ShapeProps) {
  return (
    <span className={cx("inline-grid place-items-center", !/\b(absolute|fixed|sticky)\b/.test(className ?? "") && "relative", className)} style={style}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden={title ? undefined : true}>
        {title ? <title>{title}</title> : null}
        <path d={PATHS[name]} fill={fill} />
      </svg>
      {children ? <span className="relative">{children}</span> : null}
    </span>
  );
}
