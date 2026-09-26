import { useEffect, useState } from "react";

/**
 * The UI never trusts the local clock for deadlines: every session response
 * carries the server's time and we keep the offset. Countdowns tick locally
 * but are anchored to server time; the API remains the final authority.
 */
let skewMs = 0;

export function setServerSkew(serverTimeIso: string) {
  const server = Date.parse(serverTimeIso);
  if (!Number.isNaN(server)) skewMs = server - Date.now();
}

export function serverNow(): number {
  return Date.now() + skewMs;
}

export function clockSkewMs(): number {
  return skewMs;
}

export function useServerNow(intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const utcFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : "—");
export const formatUtc = (iso: string | null | undefined) => (iso ? `${utcFmt.format(new Date(iso))} UTC` : "—");

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
export function relativeTime(iso: string | null | undefined, now = serverNow()): string {
  if (!iso) return "—";
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") return rtf.format(Math.round(diff / ms), unit);
  }
  return "";
}
