import { useOutletContext } from "react-router";
import type { EventDto } from "@dogfood/core";

export interface OrganizeContext {
  event: EventDto;
  refresh: () => void;
}

export function useOrganize(): OrganizeContext {
  return useOutletContext<OrganizeContext>();
}

/** ISO instant → value for <input type="datetime-local"> in the viewer's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (viewer's zone) → ISO UTC instant. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function utcHint(v: string): string {
  const iso = fromLocalInput(v);
  return iso ? `${iso.replace("T", " ").slice(0, 16)} UTC` : "";
}
