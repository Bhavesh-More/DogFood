import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: ToastItem["action"] }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const ICON: Record<Tone, IconName> = { info: "info", success: "check_circle", error: "error" };

/** M3 snackbars, announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action }]);
      setTimeout(() => dismiss(id), opts?.tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, { tone: "success" }), error: (m) => show(m, { tone: "error" }) }),
    [show],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 medium:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex min-h-12 w-full max-w-xl items-center gap-3 rounded-sm bg-inverse-surface py-2 pl-4 pr-2 text-inverse-on-surface shadow-3 animate-enter",
            )}
          >
            <Icon name={ICON[t.tone]} size={20} className={t.tone === "error" ? "text-[var(--md-error-container)]" : "text-inverse-primary"} />
            <p className="flex-1 type-body-md">{t.message}</p>
            {t.action ? (
              <button type="button" onClick={t.action.onClick} className="rounded-full px-3 py-2 type-label-lg text-inverse-primary hover:bg-white/10">
                {t.action.label}
              </button>
            ) : null}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
