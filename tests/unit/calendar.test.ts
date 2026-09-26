import { describe, expect, it } from "vitest";
import { buildEventCalendar, icsDate, icsEscape, icsFold, type CalendarEventInput } from "@dogfood/core";

const base: CalendarEventInput = {
  id: "evt_x",
  slug: "demo-hack",
  name: "Demo Hack, 2026; the sequel",
  tagline: "Build\nship",
  location: "Online",
  url: "http://localhost:8000/e/demo-hack",
  startsAt: "2026-09-28T09:00:00.000Z",
  submissionDeadline: "2026-09-30T17:30:00.000Z",
  judgingEndsAt: "2026-10-05T12:00:00.000Z",
  votingOpensAt: "2026-09-30T18:00:00.000Z",
  votingClosesAt: "2026-10-02T18:00:00.000Z",
  resultsPublishedAt: null,
};
const NOW = Date.parse("2026-09-26T10:00:00Z");

/** Unfold RFC 5545 continuation lines back into logical lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("iCalendar primitives", () => {
  it("formats instants as UTC basic format", () => {
    expect(icsDate("2026-09-30T17:30:00.000Z")).toBe("20260930T173000Z");
    expect(icsDate("2026-09-30T23:30:00+05:30")).toBe("20260930T180000Z");
    expect(() => icsDate("not a date")).toThrow();
  });

  it("escapes backslashes, separators and newlines", () => {
    expect(icsEscape("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds long lines at 75 octets without splitting multi-byte characters", () => {
    const line = `SUMMARY:${"é".repeat(60)}`; // 8 + 120 bytes
    const folded = icsFold(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(icsFold("SHORT:line")).toBe("SHORT:line");
  });
});

describe("buildEventCalendar", () => {
  const ics = buildEventCalendar(base, NOW, "portal.example");
  const lines = unfold(ics);

  it("is a CRLF-terminated VCALENDAR", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines).toContain("VERSION:2.0");
  });

  it("has one VEVENT per milestone with stable UIDs", () => {
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:evt_x-hacking@portal.example",
      "UID:evt_x-deadline@portal.example",
      "UID:evt_x-judging@portal.example",
      "UID:evt_x-voting@portal.example",
    ]);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(4);
    expect(lines.filter((l) => l === `DTSTAMP:20260926T100000Z`)).toHaveLength(4);
  });

  it("puts the hard deadline at the exact instant with a one-hour reminder", () => {
    const i = lines.indexOf("UID:evt_x-deadline@portal.example");
    const block = lines.slice(i, lines.indexOf("END:VEVENT", i));
    expect(block).toContain("DTSTART:20260930T173000Z");
    expect(block).toContain("DTEND:20260930T173000Z");
    expect(block).toContain("TRIGGER:-PT60M");
  });

  it("escapes event text and omits milestones that are not scheduled", () => {
    expect(lines).toContain("X-WR-CALNAME:Demo Hack\\, 2026\\; the sequel");
    expect(lines.some((l) => l.startsWith("DESCRIPTION:Build\\nship"))).toBe(true);
    expect(ics).not.toContain("results@");
    const noVoting = buildEventCalendar({ ...base, votingOpensAt: null, votingClosesAt: null, judgingEndsAt: null }, NOW);
    expect(noVoting).not.toContain("voting@");
    expect(noVoting).not.toContain("judging@");
  });
});
