import type { ReactNode } from "react";
import { ApiError } from "../lib/api";
import { cx } from "../lib/format";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Shape, type ShapeName } from "./Shape";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  shape?: ShapeName;
  className?: string;
}

export function EmptyState({ icon, title, body, action, shape = "cookie9", className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      <Shape name={shape} className="mb-5 h-24 w-24 text-primary-container">
        <Icon name={icon} size={40} className="text-on-primary-container" />
      </Shape>
      <h3 className="type-title-lg text-on-surface">{title}</h3>
      {body ? <div className="mt-2 max-w-md type-body-md text-on-surface-variant">{body}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const ERROR_COPY: Record<string, { icon: IconName; title: string }> = {
  UNAUTHORIZED: { icon: "lock", title: "Please sign in" },
  FORBIDDEN: { icon: "block", title: "You don't have access to this" },
  NOT_FOUND: { icon: "travel_explore", title: "We couldn't find that" },
  NETWORK: { icon: "wifi_off", title: "Can't reach the server" },
};

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const api = error instanceof ApiError ? error : null;
  const code = api?.status === 401 ? "UNAUTHORIZED" : api?.status === 403 ? "FORBIDDEN" : api?.status === 404 ? "NOT_FOUND" : api?.code ?? "";
  const copy = ERROR_COPY[code] ?? { icon: "error" as IconName, title: "Something went wrong" };
  return (
    <EmptyState
      icon={copy.icon}
      shape="softBurst"
      title={copy.title}
      body={
        <>
          <p>{api?.message ?? (error as Error)?.message ?? "Unknown error"}</p>
          {api?.code ? <code className="mt-2 inline-block rounded-xs bg-surface-container-high px-2 py-0.5 type-label-md">{api.code}</code> : null}
        </>
      }
      action={onRetry ? <Button variant="tonal" icon="refresh" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

type BannerTone = "info" | "success" | "warning" | "error" | "primary";

const BANNER: Record<BannerTone, { cls: string; icon: IconName }> = {
  info: { cls: "bg-surface-container-high text-on-surface", icon: "info" },
  primary: { cls: "bg-primary-container text-on-primary-container", icon: "info" },
  success: { cls: "bg-success-container text-on-success-container", icon: "check_circle" },
  warning: { cls: "bg-warning-container text-on-warning-container", icon: "warning" },
  error: { cls: "bg-error-container text-on-error-container", icon: "error" },
};

export function Banner({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: BannerTone;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const b = BANNER[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex flex-wrap items-start gap-3 rounded-lg p-4", b.cls, className)}>
      <Icon name={icon ?? b.icon} size={24} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="type-title-sm">{title}</p> : null}
        {children ? <div className="type-body-md opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  tone = "primary",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  tone?: "primary" | "secondary" | "tertiary" | "success" | "warning";
  hint?: ReactNode;
}) {
  const toneCls = {
    primary: "bg-primary-container text-on-primary-container",
    secondary: "bg-secondary-container text-on-secondary-container",
    tertiary: "bg-tertiary-container text-on-tertiary-container",
    success: "bg-success-container text-on-success-container",
    warning: "bg-warning-container text-on-warning-container",
  }[tone];
  return (
    <div className="flex items-center gap-4 rounded-xl bg-surface-container-low p-4">
      <span className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-lg", toneCls)}>
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0">
        <p className="type-label-md text-on-surface-variant">{label}</p>
        <p className="type-headline-sm text-on-surface">{value}</p>
        {hint ? <p className="type-body-sm text-on-surface-variant">{hint}</p> : null}
      </div>
    </div>
  );
}
