import { describe, expect, it } from "vitest";
import {
  areResultsPublic,
  areVoteTalliesVisible,
  can,
  capabilitiesOf,
  checkQuadraticAllocation,
  countdown,
  creditsSpent,
  csvCell,
  eventInput,
  eventPhase,
  hasFormulaTrigger,
  httpUrl,
  isBeforeDeadline,
  isVotingOpen,
  parseCsv,
  registerInput,
  roleMatrix,
  seededShuffle,
  submissionDraft,
  timeline,
  toCsv,
  type EventTimes,
} from "@dogfood/core";

const H = 3_600_000;
const T0 = Date.parse("2026-09-25T18:00:00Z");

const times: EventTimes = {
  status: "published",
  startsAt: "2026-09-25T18:00:00Z",
  submissionDeadline: "2026-09-28T18:00:00Z",
  judgingEndsAt: "2026-10-08T18:00:00Z",
  votingOpensAt: "2026-09-28T18:00:00Z",
  votingClosesAt: "2026-10-01T18:00:00Z",
  resultsPublishedAt: null,
};

describe("server-side deadline rule", () => {
  const deadline = "2026-09-28T18:00:00Z";
  it("accepts strictly before the deadline and rejects at/after it", () => {
    expect(isBeforeDeadline(deadline, Date.parse(deadline) - 1)).toBe(true);
    expect(isBeforeDeadline(deadline, Date.parse(deadline))).toBe(false);
    expect(isBeforeDeadline(deadline, Date.parse(deadline) + 1)).toBe(false);
  });

  it("honours a per-team extension but never shortens the deadline", () => {
    const now = Date.parse(deadline) + H;
    expect(isBeforeDeadline(deadline, now, "2026-09-28T20:00:00Z")).toBe(true);
    expect(isBeforeDeadline(deadline, now, "2026-09-28T10:00:00Z")).toBe(false);
    expect(isBeforeDeadline(deadline, Date.parse(deadline) - 1, "2026-09-27T00:00:00Z")).toBe(true);
  });

  it("interprets offsets correctly (no local-time ambiguity)", () => {
    // 20:00+02:00 is 18:00Z — exactly the deadline.
    expect(isBeforeDeadline("2026-09-28T20:00:00+02:00", Date.parse(deadline))).toBe(false);
  });
});

describe("event phases and windows", () => {
  it("walks through the lifecycle", () => {
    expect(eventPhase({ ...times, status: "draft" }, T0)).toBe("draft");
    expect(eventPhase(times, T0 - H)).toBe("upcoming");
    expect(eventPhase(times, T0 + H)).toBe("submissions_open");
    expect(eventPhase(times, Date.parse(times.submissionDeadline) + 1)).toBe("judging");
    const published = { ...times, resultsPublishedAt: "2026-10-09T12:00:00Z" };
    expect(eventPhase(published, Date.parse("2026-10-09T12:00:00Z"))).toBe("results");
    expect(eventPhase({ ...times, status: "archived" }, T0)).toBe("archived");
  });

  it("opens voting only inside the window and hides tallies until it closes", () => {
    const open = Date.parse(times.votingOpensAt!);
    const close = Date.parse(times.votingClosesAt!);
    expect(isVotingOpen(times, open - 1)).toBe(false);
    expect(isVotingOpen(times, open)).toBe(true);
    expect(isVotingOpen(times, close)).toBe(false);
    expect(areVoteTalliesVisible(times, close - 1)).toBe(false);
    expect(areVoteTalliesVisible(times, close)).toBe(true);
    expect(areResultsPublic(times, close)).toBe(false);
  });

  it("builds a timeline with states", () => {
    const steps = timeline(times, T0 + H);
    expect(steps.find((s) => s.key === "hacking")?.state).toBe("active");
    expect(steps.find((s) => s.key === "deadline")?.state).toBe("upcoming");
    expect(steps.some((s) => s.key === "voting")).toBe(true);
  });

  it("formats countdowns and never goes negative", () => {
    expect(countdown("2026-09-26T19:01:02Z", T0)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 2 });
    expect(countdown("2026-09-20T00:00:00Z", T0).totalMs).toBe(0);
  });
});

describe("RBAC matrix", () => {
  it("lets only participants form teams and submit", () => {
    expect(can("participant", "team:manage")).toBe(true);
    expect(can("judge", "team:manage")).toBe(false);
    expect(can("organizer", "submission:write")).toBe(false);
    expect(can(null, "submission:write")).toBe(false);
  });

  it("reserves scoring for judges and user management for admins", () => {
    expect(can("judge", "judging:score")).toBe(true);
    expect(can("organizer", "judging:score")).toBe(false);
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("organizer", "users:manage")).toBe(false);
  });

  it("lets anonymous visitors read and vote only", () => {
    expect(capabilitiesOf(null)).toEqual(["gallery:read", "vote:cast"]);
    expect(roleMatrix()).toHaveLength(5);
  });
});

describe("quadratic voting", () => {
  it("charges v² credits per project", () => {
    expect(creditsSpent({ a: 3, b: 4 })).toBe(25);
    expect(checkQuadraticAllocation({ a: 3, b: 4 }, 25)).toMatchObject({ ok: true, remaining: 0 });
    expect(checkQuadraticAllocation({ a: 5, b: 1 }, 25)).toMatchObject({ ok: false });
    expect(checkQuadraticAllocation({ a: -1 }, 25).ok).toBe(false);
  });
});

describe("seededShuffle", () => {
  it("is a stable permutation per seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = seededShuffle(items, "viewer-1");
    expect(seededShuffle(items, "viewer-1")).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(seededShuffle(items, "viewer-2")).not.toEqual(a);
  });
});

describe("CSV", () => {
  it("quotes, escapes and neutralises formula injection", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(null)).toBe("");
  });

  it("flags spreadsheet-formula triggers", () => {
    for (const t of ["=1+1", "+1", "-1", "@cmd", "\tx", "\rx"]) expect(hasFormulaTrigger(t)).toBe(true);
    for (const t of ["plain", "A=B", " a", "", "1+1"]) expect(hasFormulaTrigger(t)).toBe(false);
  });

  it("round-trips through the parser", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'q"z'], ["multi\nline", 2]]);
    expect(parseCsv(csv)).toEqual([["a", "b"], ["x,y", 'q"z'], ["multi\nline", "2"]]);
  });
});

describe("schemas", () => {
  it("rejects javascript: URLs", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("https://github.com/x/y").success).toBe(true);
    expect(submissionDraft.safeParse({ repoUrl: "data:text/html,hi" }).success).toBe(false);
  });

  it("normalises emails and enforces password length", () => {
    const ok = registerInput.parse({ email: " Ada@Example.COM ", password: "longenough", name: "Ada" });
    expect(ok.email).toBe("ada@example.com");
    expect(ok.intent).toBe("participant");
    expect(registerInput.safeParse({ email: "a@b.co", password: "short", name: "A" }).success).toBe(false);
  });

  it("requires explicit timezones and ordered windows for events", () => {
    const base = {
      slug: "my-hack",
      name: "My Hack",
      startsAt: "2026-09-25T18:00:00Z",
      submissionDeadline: "2026-09-28T18:00:00Z",
    };
    expect(eventInput.safeParse(base).success).toBe(true);
    expect(eventInput.safeParse({ ...base, startsAt: "2026-09-25T18:00:00" }).success).toBe(false);
    expect(eventInput.safeParse({ ...base, submissionDeadline: "2026-09-24T18:00:00Z" }).success).toBe(false);
    expect(eventInput.safeParse({ ...base, votingOpensAt: "2026-09-28T18:00:00Z" }).success).toBe(false);
  });
});
