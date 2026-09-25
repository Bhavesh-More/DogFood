import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../lib/format";

type CardVariant = "elevated" | "filled" | "outlined" | "tonal" | "primary" | "tertiary";

const VARIANT: Record<CardVariant, string> = {
  elevated: "bg-surface-container-low shadow-1",
  filled: "bg-surface-container-highest",
  outlined: "bg-surface border border-outline-variant",
  tonal: "bg-secondary-container text-on-secondary-container",
  primary: "bg-primary-container text-on-primary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  radius?: "md" | "lg" | "xl" | "2xl";
  children: ReactNode;
  to?: string;
  padded?: boolean;
}

const RADIUS = { md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" };

export function Card({ variant = "filled", radius = "xl", children, className, to, padded = true, ...rest }: CardProps) {
  const cls = cx(
    VARIANT[variant],
    RADIUS[radius],
    padded && "p-5 medium:p-6",
    to &&
      "state-layer focus-ring block overflow-hidden transition-[border-radius,box-shadow] duration-500 ease-[var(--ease-spring-default)] hover:shadow-2 active:rounded-lg",
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
  level = 2,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  level?: 2 | 3;
}) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className={cx("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag className={level === 2 ? "type-headline-sm text-on-surface" : "type-title-lg text-on-surface"}>{title}</Tag>
        {subtitle ? <p className="mt-1 type-body-md text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
