import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}

/**
 * M3 basic dialog on the native <dialog> element: modal focus trapping,
 * Escape to close and an inert background come from the browser.
 */
export function Dialog({ open, onClose, title, icon, children, actions, wide }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto max-h-[90dvh] w-[calc(100%-32px)] overflow-hidden rounded-xl bg-surface-container-high p-0 text-on-surface shadow-3 open:animate-pop",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className={cx("px-6 pt-6", icon && "text-center")}>
          {icon ? <Icon name={icon} size={28} className="mx-auto mb-3 text-secondary" /> : null}
          <h2 className="type-headline-sm">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 type-body-md text-on-surface-variant">{children}</div>
        {actions ? <div className="flex flex-wrap justify-end gap-2 px-6 pb-6">{actions}</div> : null}
      </div>
    </dialog>
  );
}
