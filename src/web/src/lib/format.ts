import type { EventPhase, Role } from "@dogfood/core";

export const PHASE_LABEL: Record<EventPhase, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  submissions_open: "Submissions open",
  judging: "Judging",
  results: "Results out",
  archived: "Archived",
};

export const PHASE_TONE: Record<EventPhase, "primary" | "tertiary" | "secondary" | "success" | "neutral" | "warning"> = {
  draft: "neutral",
  upcoming: "secondary",
  submissions_open: "primary",
  judging: "tertiary",
  results: "success",
  archived: "neutral",
};

export const ROLE_ICON: Record<Role, string> = {
  visitor: "visibility",
  participant: "person",
  judge: "gavel",
  organizer: "space_dashboard",
  admin: "admin_panel_settings",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((100 * part) / total) : 0;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Deterministic hash → [0, 1) for generated art. */
export function hashUnit(input: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
