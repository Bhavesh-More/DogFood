import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  selected?: boolean;
  icon?: IconName;
  children: ReactNode;
  onRemove?: () => void;
  elevated?: boolean;
}

/** Filter / assist / input chip (M3). Selected filter chips show a check. */
export function Chip({ selected, icon, children, onRemove, elevated, className, type = "button", ...rest }: ChipProps) {
  return (
    <span className="inline-flex">
      <button
        type={type}
        aria-pressed={selected ?? undefined}
        className={cx(
          "state-layer focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 type-label-lg transition-[border-radius,background-color] duration-300 ease-[var(--ease-spring-fast)] active:rounded-md",
          selected
            ? "bg-secondary-container text-on-secondary-container"
            : cx("border border-outline-variant text-on-surface-variant", elevated && "border-transparent bg-surface-container-low shadow-1"),
          onRemove && "pr-1.5",
          className,
        )}
        {...rest}
      >
        {selected ? <Icon name="check" size={18} className="relative z-[1]" /> : icon ? <Icon name={icon} size={18} className="relative z-[1]" /> : null}
        <span className="relative z-[1]">{children}</span>
        {onRemove ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRemove();
              }
            }}
            className="relative z-[1] grid h-6 w-6 place-items-center rounded-full hover:bg-on-surface/10"
          >
            <Icon name="close" size={16} />
          </span>
        ) : null}
      </button>
    </span>
  );
}

type PillTone = "primary" | "secondary" | "tertiary" | "success" | "warning" | "error" | "neutral";

const PILL: Record<PillTone, string> = {
  primary: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  success: "bg-success-container text-on-success-container",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-highest text-on-surface-variant",
};

/** Non-interactive status label. */
export function Pill({ tone = "neutral", icon, children, className }: { tone?: PillTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-7 max-w-full items-center gap-1 rounded-full px-2.5 type-label-md whitespace-nowrap", PILL[tone], className)}>
      {icon ? <Icon name={icon} size={16} className="shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
