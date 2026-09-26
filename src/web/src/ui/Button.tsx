import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger" | "tertiary";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary hover:shadow-1",
  tonal: "bg-secondary-container text-on-secondary-container hover:shadow-1",
  tertiary: "bg-tertiary text-on-tertiary hover:shadow-1",
  outlined: "border border-outline-variant text-on-surface-variant bg-transparent",
  text: "text-primary bg-transparent",
  elevated: "bg-surface-container-low text-primary shadow-1 hover:shadow-2",
  danger: "bg-error text-on-error hover:shadow-1",
};

/* M3 Expressive button sizes. Round buttons morph toward a squarer corner
   while pressed; square buttons use the size's fixed radius. The round radius
   is half the height, not rounded-full (9999px): interpolating from 9999px
   stays visually "full" for almost the whole transition and then snaps. */
const SIZE: Record<ButtonSize, { box: string; round: string; square: string; icon: number }> = {
  xs: { box: "h-8 px-3 gap-1 type-label-lg", round: "rounded-[16px] active:rounded-sm", square: "rounded-md", icon: 18 },
  sm: { box: "h-10 px-4 gap-2 type-label-lg", round: "rounded-[20px] active:rounded-sm", square: "rounded-md", icon: 20 },
  md: { box: "h-14 px-6 gap-2 type-title-md", round: "rounded-[28px] active:rounded-md", square: "rounded-lg", icon: 24 },
  lg: { box: "h-[72px] px-8 gap-3 type-title-lg", round: "rounded-[36px] active:rounded-lg", square: "rounded-xl", icon: 28 },
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: "round" | "square";
  icon?: IconName;
  trailingIcon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
  className?: string;
}

export function buttonClass({ variant = "filled", size = "sm", shape = "round", fullWidth, className }: BaseProps) {
  const s = SIZE[size];
  return cx(
    "state-layer focus-ring inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
    "transition-[border-radius,box-shadow,background-color,transform] duration-300 ease-[var(--ease-emphasized-decelerate)]",
    "disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    s.box,
    shape === "round" ? s.round : s.square,
    VARIANT[variant],
    fullWidth && "w-full",
    className,
  );
}

function Content({ icon, trailingIcon, loading, children, size = "sm" }: BaseProps) {
  const px = SIZE[size].icon;
  return (
    <>
      {loading ? (
        <span
          className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ width: px - 4, height: px - 4 }}
          aria-hidden
        />
      ) : icon ? (
        <Icon name={icon} size={px} className="relative z-[1]" />
      ) : null}
      {children ? <span className="relative z-[1]">{children}</span> : null}
      {trailingIcon ? <Icon name={trailingIcon} size={px} className="relative z-[1]" /> : null}
    </>
  );
}

type ButtonProps = BaseProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, shape, icon, trailingIcon, loading, fullWidth, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, shape, fullWidth, className })}
      {...rest}
    >
      <Content icon={icon} trailingIcon={trailingIcon} loading={loading} size={size}>
        {children}
      </Content>
    </button>
  );
});

interface LinkButtonProps extends BaseProps {
  to: string;
  external?: boolean;
  download?: boolean;
}

export function LinkButton({ to, external, download, variant, size, shape, icon, trailingIcon, fullWidth, children, className }: LinkButtonProps) {
  const cls = buttonClass({ variant, size, shape, fullWidth, className });
  const content = (
    <Content icon={icon} trailingIcon={trailingIcon} size={size}>
      {children}
    </Content>
  );
  if (external || download) {
    return (
      <a href={to} className={cls} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined} download={download || undefined}>
        {content}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {content}
    </Link>
  );
}

type IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";
const ICON_VARIANT: Record<IconButtonVariant, string> = {
  standard: "text-on-surface-variant",
  filled: "bg-primary text-on-primary",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline-variant text-on-surface-variant",
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  variant?: IconButtonVariant;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "standard", selected, size = "md", className, type = "button", ...rest },
  ref,
) {
  const dims = size === "sm" ? "h-8 w-8 rounded-[16px]" : size === "lg" ? "h-14 w-14 rounded-[28px]" : "h-10 w-10 rounded-[20px]";
  const px = size === "sm" ? 20 : size === "lg" ? 28 : 24;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={selected ?? undefined}
      className={cx(
        "state-layer focus-ring inline-grid shrink-0 place-items-center transition-[border-radius,background-color] duration-300 ease-[var(--ease-emphasized-decelerate)] active:rounded-md disabled:opacity-40",
        dims,
        selected ? "bg-primary text-on-primary" : ICON_VARIANT[variant],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={px} filled={selected} className="relative z-[1]" />
    </button>
  );
});

interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  extended?: boolean;
  to?: string;
  tone?: "primary" | "secondary" | "tertiary";
}

const FAB_TONE = {
  primary: "bg-primary-container text-on-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
};

export function Fab({ icon, label, extended = true, to, tone = "primary", className, ...rest }: FabProps) {
  const cls = cx(
    "state-layer focus-ring inline-flex h-14 items-center gap-3 rounded-lg shadow-3 transition-[border-radius,box-shadow] duration-300 ease-[var(--ease-spring-fast)] hover:shadow-4 active:rounded-xl",
    extended ? "px-5 type-label-lg" : "w-14 justify-center",
    FAB_TONE[tone],
    className,
  );
  const inner = (
    <>
      <Icon name={icon} size={24} className="relative z-[1]" />
      {extended ? <span className="relative z-[1]">{label}</span> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} {...rest}>
      {inner}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: IconName }[];
  size?: "xs" | "sm";
  label: string;
}

/** M3 Expressive connected button group (single select). */
export function ButtonGroup<T extends string>({ value, onChange, options, size = "sm", label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5">
      {options.map((o, i) => {
        const selected = o.value === value;
        const first = i === 0;
        const last = i === options.length - 1;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              "state-layer focus-ring inline-flex items-center gap-1.5 transition-[border-radius,background-color] duration-300 ease-[var(--ease-emphasized-decelerate)]",
              size === "xs" ? "h-8 px-3 type-label-md" : "h-10 px-4 type-label-lg",
              // Half-height radii instead of rounded-full so the morph interpolates smoothly.
              selected
                ? cx("bg-secondary text-on-secondary", size === "xs" ? "rounded-[16px]" : "rounded-[20px]")
                : cx(
                    "bg-secondary-container text-on-secondary-container",
                    first
                      ? size === "xs" ? "rounded-l-[16px] rounded-r-sm" : "rounded-l-[20px] rounded-r-sm"
                      : last
                        ? size === "xs" ? "rounded-r-[16px] rounded-l-sm" : "rounded-r-[20px] rounded-l-sm"
                        : "rounded-sm",
                  ),
            )}
          >
            {selected ? <Icon name="check" size={18} className="relative z-[1]" /> : o.icon ? <Icon name={o.icon} size={18} className="relative z-[1]" /> : null}
            <span className="relative z-[1]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
