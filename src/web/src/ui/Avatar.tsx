import { ROLE_LABEL, type Role } from "@dogfood/core";
import { ROLE_ICON, cx, hashUnit, initials } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { Shape, type ShapeName } from "./Shape";

const AVATAR_SHAPES: ShapeName[] = ["cookie9", "clover4", "gem", "sunny", "cookie6", "flower", "pentagon", "softBurst"];
const AVATAR_TONES = [
  ["var(--md-primary-container)", "var(--md-on-primary-container)"],
  ["var(--md-tertiary-container)", "var(--md-on-tertiary-container)"],
  ["var(--md-secondary-container)", "var(--md-on-secondary-container)"],
  ["var(--md-primary-fixed-dim)", "var(--md-on-primary-fixed)"],
] as const;

/** Expressive avatar: initials on a deterministic M3 shape. */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const shape = AVATAR_SHAPES[Math.floor(hashUnit(name) * AVATAR_SHAPES.length)]!;
  const [bg, fg] = AVATAR_TONES[Math.floor(hashUnit(name, 7) * AVATAR_TONES.length)]!;
  return (
    <Shape name={shape} fill={bg} className={cx("shrink-0", className)} style={{ width: size, height: size, color: fg }} title={name}>
      <span className="font-rounded font-semibold" style={{ fontSize: size * 0.36 }} aria-hidden>
        {initials(name)}
      </span>
    </Shape>
  );
}

const ROLE_TONE: Record<Role, string> = {
  visitor: "bg-surface-container-highest text-on-surface-variant",
  participant: "bg-secondary-container text-on-secondary-container",
  judge: "bg-tertiary-container text-on-tertiary-container",
  organizer: "bg-primary-container text-on-primary-container",
  admin: "bg-inverse-surface text-inverse-on-surface",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2 type-label-md", ROLE_TONE[role], className)}>
      <Icon name={ROLE_ICON[role] as IconName} size={14} />
      {ROLE_LABEL[role]}
    </span>
  );
}
