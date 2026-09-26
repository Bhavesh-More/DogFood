/**
 * iCalendar (RFC 5545) export of an event's milestones, so participants and
 * judges can put the hard deadline in their own calendar — no account or
 * network service involved, which keeps it offline-friendly.
 */

export interface CalendarEventInput {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  location?: string;
  /** Public page for the event, e.g. http://localhost:8000/e/sample-hack-2026 */
  url: string;
  startsAt: string;
  submissionDeadline: string;
  judgingEndsAt: string | null;
  votingOpensAt: string | null;
  votingClosesAt: string | null;
  resultsPublishedAt: string | null;
}

interface Entry {
  key: string;
  summary: string;
  start: string;
  end: string;
  description: string;
  alarmMinutesBefore?: number;
}

/** 2026-09-28T12:00:00.000Z → 20260928T120000Z (always UTC). */
export function icsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold content lines longer than 75 octets (RFC 5545 §3.1), never splitting a UTF-8 character. */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function entries(e: CalendarEventInput): Entry[] {
  const out: Entry[] = [
    {
      key: "hacking",
      summary: `${e.name}: hacking window`,
      start: e.startsAt,
      end: e.submissionDeadline,
      description: `${e.tagline ? `${e.tagline}\n\n` : ""}Build and submit before the hard deadline.\n${e.url}`,
    },
    {
      key: "deadline",
      summary: `${e.name}: submission deadline (hard)`,
      start: e.submissionDeadline,
      end: e.submissionDeadline,
      description: `Submissions lock at this instant on the server clock. Late edits are refused.\n${e.url}`,
      alarmMinutesBefore: 60,
    },
  ];
  if (e.judgingEndsAt) {
    out.push({
      key: "judging",
      summary: `${e.name}: judging`,
      start: e.submissionDeadline,
      end: e.judgingEndsAt,
      description: `Judges score the submitted projects.\n${e.url}`,
    });
  }
  if (e.votingOpensAt && e.votingClosesAt) {
    out.push({
      key: "voting",
      summary: `${e.name}: community voting`,
      start: e.votingOpensAt,
      end: e.votingClosesAt,
      description: `Back your favourite projects in the gallery.\n${e.url}/gallery`,
    });
  }
  if (e.resultsPublishedAt) {
    out.push({
      key: "results",
      summary: `${e.name}: results published`,
      start: e.resultsPublishedAt,
      end: e.resultsPublishedAt,
      description: `${e.url}/results`,
    });
  }
  return out;
}

/** Build a VCALENDAR with one VEVENT per milestone. `now` stamps DTSTAMP. */
export function buildEventCalendar(e: CalendarEventInput, now: number, host = "dogfood.local"): string {
  const stamp = icsDate(new Date(now).toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dogfood Portal//Event calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(e.name)}`,
  ];
  for (const x of entries(e)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}-${x.key}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(x.start)}`,
      `DTEND:${icsDate(x.end)}`,
      `SUMMARY:${icsEscape(x.summary)}`,
      `DESCRIPTION:${icsEscape(x.description)}`,
      `URL:${x.key === "voting" ? `${e.url}/gallery` : x.key === "results" ? `${e.url}/results` : e.url}`,
      ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    );
    if (x.alarmMinutesBefore) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsEscape(`${e.name} deadline in ${x.alarmMinutesBefore} minutes`)}`,
        `TRIGGER:-PT${x.alarmMinutesBefore}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
