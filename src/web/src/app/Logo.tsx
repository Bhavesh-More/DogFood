import { shapePath } from "../ui/Shape";

/** Brand mark: a "cookie" shape (M3 Expressive) with a stylised D. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Dogfood">
      <path d={shapePath("cookie9")} fill="var(--md-primary)" />
      <path d="M34 28h14a22 22 0 0 1 0 44H34z" fill="var(--md-on-primary)" />
      <circle cx="47" cy="50" r="8" fill="var(--md-primary)" />
      <circle cx="72" cy="30" r="7" fill="var(--md-tertiary-container)" />
    </svg>
  );
}
