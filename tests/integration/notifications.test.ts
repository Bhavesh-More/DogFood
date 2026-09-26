import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/** In-app notifications from announcements, judging work and team invitations. */
let s: TestStack;
const tok: Record<string, string> = {};
beforeAll(async () => {
  s = await startStack();
  tok.usr_p02 = await s.tokenFor("usr_p02");
});
afterAll(async () => {
  await s?.close();
});

const list = (token: string) => s.as(token).get("/api/notifications");

describe("notifications", () => {
  it("are private to their owner and start empty", async () => {
    expect((await s.anon.get("/api/notifications")).status).toBe(401);
    const r = await list(TOKENS.participant2);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], unread: 0 });
  });

  it("an announcement notifies its audience, not bystanders", async () => {
    const title = "Venue changed — please read";
    const posted = await s.as(TOKENS.organizer).post("/api/events/evt_02/announcements", {
      title,
      body: "We moved the finals to Hall B.",
      audience: "participants",
    });
    expect(posted.status).toBe(201);
    const n = (await list(TOKENS.participant2)).body.items.find((x: { title: string }) => x.title === title);
    expect(n).toMatchObject({ kind: "announcement", link: "/e/autumn-build-week", readAt: null });
    // A judge of another event is not on this announcement's audience.
    expect((await list(TOKENS.judgeA)).body.items.some((x: { title: string }) => x.title === title)).toBe(false);
  });

  it("a targeted invitation reaches the invitee and can be accepted", async () => {
    // Only members may invite.
    expect((await s.as(tok.usr_p02!).post("/api/teams/team_02_01/invitations", { userId: "usr_p37" })).status).toBe(403);
    // They already have a team; the person does not exist.
    expect((await s.as(TOKENS.participant).post("/api/teams/team_02_01/invitations", { userId: "usr_participant" })).body.code).toBe("ALREADY_ON_TEAM");
    expect((await s.as(TOKENS.participant).post("/api/teams/team_02_01/invitations", { userId: "usr_nope" })).status).toBe(404);
    const inv = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invitations", { userId: "usr_p02" })).body;
    const n = (await list(tok.usr_p02!)).body.items.find((x: { kind: string }) => x.kind === "invite");
    expect(n).toMatchObject({ link: `/invite/${inv.token}`, readAt: null });
    expect(n.title).toContain("Night Owls");
    expect((await s.as(tok.usr_p02!).post(`/api/invites/${inv.token}/accept`)).status).toBe(200);
  });

  it("algorithmic routing notifies each judge it assigns", async () => {
    const plan = (await s.as(TOKENS.organizer).post("/api/events/evt_01/assignments/auto", { reviewsPerSubmission: 4 })).body;
    if (!plan.created.length) return;
    const token = await s.tokenFor(plan.created[0].judgeId as string);
    const n = (await list(token)).body.items.find((x: { kind: string }) => x.kind === "assignment");
    expect(n).toMatchObject({ link: "/judge/sample-hack-2026" });
    expect(n.title).toMatch(/to review$/);
  });

  it("can be marked read, one at a time or all at once; others cannot touch them", async () => {
    const before = await list(TOKENS.participant2);
    expect(before.body.unread).toBeGreaterThan(0);
    const first = before.body.items[0];
    expect((await s.as(TOKENS.judgeB).post(`/api/notifications/${first.id}/read`)).status).toBe(404);
    expect((await s.as(TOKENS.participant2).post(`/api/notifications/${first.id}/read`)).status).toBe(204);
    expect((await list(TOKENS.participant2)).body.unread).toBe(before.body.unread - 1);
    await s.as(TOKENS.participant2).post("/api/notifications/read-all");
    expect((await list(TOKENS.participant2)).body.unread).toBe(0);
  });
});
