import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Small anchored menu with outside-click and Escape handling. */
export function Menu({ trigger, items, header, align = "end" }: { trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; items: MenuItem[]; header?: ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div
          role="menu"
          className={cx(
            "absolute z-40 mt-2 min-w-56 overflow-hidden rounded-lg bg-surface-container py-2 shadow-2 animate-pop",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
        >
          {header ? <div className="px-4 pb-2">{header}</div> : null}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx(
                "state-layer flex h-12 w-full items-center gap-3 px-4 text-left type-label-lg disabled:opacity-40",
                item.danger ? "text-error" : "text-on-surface",
              )}
            >
              {item.icon ? <Icon name={item.icon} size={20} className="relative z-[1] text-on-surface-variant" /> : null}
              <span className="relative z-[1]">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
