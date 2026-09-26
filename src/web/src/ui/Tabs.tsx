import { useRef, type KeyboardEvent } from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string; icon?: IconName; badge?: number }[];
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
}

/** Accessible M3 tabs (roving tabindex, arrow-key navigation). */
export function Tabs<T extends string>({ value, onChange, tabs, label, variant = "primary", className }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next]!.value);
  };
  return (
    <div role="tablist" aria-label={label} className={cx("scrollbar-none flex overflow-x-auto border-b border-outline-variant", className)}>
      {tabs.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "state-layer focus-ring relative flex h-12 shrink-0 items-center justify-center gap-2 px-4 type-title-sm transition-colors",
              selected ? (variant === "primary" ? "text-primary" : "text-on-surface") : "text-on-surface-variant",
            )}
          >
            {t.icon ? <Icon name={t.icon} size={20} filled={selected} className="relative z-[1]" /> : null}
            <span className="relative z-[1]">{t.label}</span>
            {t.badge ? (
              <span className="relative z-[1] grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 type-label-sm text-on-error">{t.badge}</span>
            ) : null}
            <span
              className={cx(
                "absolute bottom-0 left-1/2 -translate-x-1/2 bg-primary transition-all duration-300 ease-[var(--ease-spring-fast)]",
                variant === "primary" ? "h-[3px] rounded-t-full" : "h-0.5",
                selected ? (variant === "primary" ? "w-[calc(100%-24px)]" : "w-full") : "w-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
