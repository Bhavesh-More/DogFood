import {
  forwardRef,
  useId,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "../lib/format";
import { Icon, type IconName } from "./Icon";

interface FieldShellProps {
  label: string;
  supporting?: ReactNode;
  error?: string;
  leadingIcon?: IconName;
  trailing?: ReactNode;
  className?: string;
  counter?: string;
}

const inputBase =
  "peer block w-full rounded-xs border border-outline bg-transparent px-4 pt-5 pb-2 type-body-lg text-on-surface outline-none " +
  "placeholder-transparent transition-[border-color,box-shadow] duration-200 hover:border-on-surface " +
  "focus:border-primary focus:shadow-[inset_0_0_0_1px_var(--md-primary)] disabled:opacity-40 " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:focus:shadow-[inset_0_0_0_1px_var(--md-error)]";

const labelBase =
  "pointer-events-none absolute left-4 top-1.5 origin-left type-body-sm text-on-surface-variant transition-all duration-200 " +
  "peer-placeholder-shown:top-4 peer-placeholder-shown:type-body-lg peer-focus:top-1.5 peer-focus:type-body-sm peer-focus:text-primary " +
  "peer-aria-[invalid=true]:text-error";

function Supporting({ id, supporting, error, counter }: { id: string; supporting?: ReactNode; error?: string; counter?: string }) {
  if (!supporting && !error && !counter) return null;
  return (
    <div className="mt-1 flex justify-between gap-2 px-4 type-body-sm">
      <p id={id} className={error ? "text-error" : "text-on-surface-variant"} role={error ? "alert" : undefined}>
        {error ?? supporting}
      </p>
      {counter ? <span className="text-on-surface-variant">{counter}</span> : null}
    </div>
  );
}

type TextFieldProps = FieldShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder">;

/** M3 outlined text field with a floating label. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, supporting, error, leadingIcon, trailing, className, counter, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  return (
    <div className={className}>
      <div className="relative">
        {leadingIcon ? <Icon name={leadingIcon} size={22} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" /> : null}
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={supporting || error ? helpId : undefined}
          className={cx(inputBase, "h-14", leadingIcon && "pl-11", trailing ? "pr-12" : undefined)}
          {...rest}
        />
        <label htmlFor={inputId} className={cx(labelBase, leadingIcon && "left-11")}>
          {label}
          {rest.required ? " *" : ""}
        </label>
        {trailing ? <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div> : null}
      </div>
      <Supporting id={helpId} supporting={supporting} error={error} counter={counter} />
    </div>
  );
});

type TextAreaProps = FieldShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder">;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, supporting, error, className, counter, id, rows = 5, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  return (
    <div className={className}>
      <div className="relative">
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={supporting || error ? helpId : undefined}
          className={cx(inputBase, "min-h-28 resize-y pt-6")}
          {...rest}
        />
        <label htmlFor={inputId} className={labelBase}>
          {label}
          {rest.required ? " *" : ""}
        </label>
      </div>
      <Supporting id={helpId} supporting={supporting} error={error} counter={counter} />
    </div>
  );
});

type SelectProps = FieldShellProps &
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, supporting, error, className, options, placeholder, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helpId = `${inputId}-help`;
  return (
    <div className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={supporting || error ? helpId : undefined}
          className={cx(inputBase, "h-14 appearance-none pr-10")}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor={inputId} className="pointer-events-none absolute left-4 top-1.5 type-body-sm text-on-surface-variant">
          {label}
          {rest.required ? " *" : ""}
        </label>
        <Icon name="keyboard_arrow_down" size={22} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      </div>
      <Supporting id={helpId} supporting={supporting} error={error} />
    </div>
  );
});

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-center justify-between gap-4 py-2", disabled && "cursor-not-allowed opacity-40")}>
      <span className="min-w-0">
        <span className="block type-body-lg text-on-surface">{label}</span>
        {description ? <span className="block type-body-md text-on-surface-variant">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        />
        <span
          className={cx(
            "h-8 w-[52px] rounded-full border-2 transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-secondary",
            checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
          )}
        />
        <span
          className={cx(
            "absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full transition-all duration-300 ease-[var(--ease-spring-fast)]",
            checked ? "left-[24px] h-6 w-6 bg-on-primary text-primary" : "left-[8px] h-4 w-4 bg-outline",
          )}
        >
          {checked ? <Icon name="check" size={16} /> : null}
        </span>
      </span>
    </label>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx("inline-flex cursor-pointer items-center gap-3 py-1.5", disabled && "cursor-not-allowed opacity-40")}>
      <span className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-on-surface/8">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span
          className={cx(
            "grid h-[18px] w-[18px] place-items-center rounded-[2px] border-2 transition-colors peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-secondary",
            checked ? "border-primary bg-primary text-on-primary" : "border-on-surface-variant",
          )}
        >
          {checked ? <Icon name="check" size={16} /> : null}
        </span>
      </span>
      <span className="type-body-lg text-on-surface">{label}</span>
    </label>
  );
}

interface ScoreSliderProps {
  label: string;
  description?: string;
  value: number | undefined;
  max: number;
  weightPercent?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** Rubric criterion slider (M3 Expressive slider) with a numeric readout. */
export function ScoreSlider({ label, description, value, max, weightPercent, onChange, disabled }: ScoreSliderProps) {
  const id = useId();
  const v = value ?? 0;
  const fill = `${(v / max) * 100}%`;
  return (
    <div className="rounded-lg bg-surface-container-low p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="type-title-md text-on-surface">
            {label}
          </label>
          {description ? <p className="type-body-sm text-on-surface-variant">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {weightPercent !== undefined ? (
            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 type-label-sm text-on-surface-variant">
              {weightPercent.toFixed(0)}% weight
            </span>
          ) : null}
          <output
            htmlFor={id}
            className={cx(
              "grid h-10 min-w-12 place-items-center rounded-md px-2 type-title-lg tabular-nums",
              value === undefined ? "bg-surface-container-highest text-on-surface-variant" : "bg-primary text-on-primary",
            )}
          >
            {value === undefined ? "–" : v}
          </output>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="md-slider mt-2"
        style={{ ["--fill" as string]: fill }}
        aria-valuetext={`${v} out of ${max}`}
      />
      <div className="flex justify-between type-label-sm text-on-surface-variant">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
