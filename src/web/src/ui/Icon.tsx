import { ICONS, type IconName } from "../lib/icons.generated";
import { cx } from "../lib/format";

export type { IconName };

interface IconProps {
  name: IconName;
  /** Filled variant (M3 uses filled icons for selected/active states). */
  filled?: boolean;
  size?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, filled = false, size = 24, className, title }: IconProps) {
  const [outline, fill] = ICONS[name];
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={cx("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={filled ? fill : outline} />
    </svg>
  );
}
