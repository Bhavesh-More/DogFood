import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/** Team finder: solo participants and recruiting teams find each other, with no emails exposed. */
const HOUR = 3600_000;
let clock = Date.now();
let s: TestStack;
const tok: Record<string, string> = {};
beforeAll(async () => {
  s = await startStack({ now: () => clock });
  for (const id of ["usr_p01", "usr_p02", "usr_p03", "usr_p04", "usr_p05", "usr_p37"]) tok[id] = await s.tokenFor(id);
});
afterAll(async () => {
  await s?.close();
});

// evt_02 (Autumn Build Week) is open for submissions; participant captains team_02_01 (max 3).
const board = (token: string) => s.as(token).get("/api/events/evt_02/team-finder");

describe("team finder", () => {
  it("requires sign-in and hides drafts", async () => {
    expect((await s.anon.get("/api/events/evt_02/team-finder")).status).toBe(401);
    expect((await board(TOKENS.participant)).status).toBe(200);
    expect((await s.as(TOKENS.participant).get("/api/events/evt_04/team-finder")).status).toBe(404);
  });

  it("solo participants post their skills and appear on the board (registration included)", async () => {
    const r = await s.as(tok.usr_p01!).put("/api/events/evt_02/team-finder/me", { skills: ["TypeScript", "design", "typescript"], note: "Frontend + UX, find me on the venue Discord" });
    expect(r.status).toBe(200);
    const b = await board(TOKENS.participant2);
    const me = b.body.seekers.find((x: { userId: string }) => x.userId === "usr_p01");
    expect(me).toMatchObject({ skills: ["typescript", "design"], note: expect.stringContaining("Frontend") });
    expect(b.text).not.toMatch(/@dogfood\.local/);
    const [reg] = await s.sql("SELECT 1 AS ok FROM registrations WHERE event_id = 'evt_02' AND user_id = 'usr_p01'");
    expect(reg?.ok).toBe(1);
    expect((await board(tok.usr_p01!)).body.me).toMatchObject({ posted: true, onTeam: false, canPost: true });
  });

  it("validates skills and notes", async () => {
    const bad = await s.as(tok.usr_p02!).put("/api/events/evt_02/team-finder/me", { skills: ["x".repeat(40)], note: "n".repeat(600) });
    expect(bad.status).toBe(422);
    expect(bad.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["note", "skills.0"]);
  });

  it("people already on a team, and judges, cannot post", async () => {
    const onTeam = await s.as(TOKENS.participant).put("/api/events/evt_02/team-finder/me", { skills: [] });
    expect(onTeam.body.code).toBe("ALREADY_ON_TEAM");
    expect((await board(TOKENS.participant)).body.me.canPost).toBe(false);
    expect((await s.as(TOKENS.judgeA).put("/api/events/evt_02/team-finder/me", { skills: [] })).status).toBe(403);
  });

  it("teams advertise open spots; only members may change it", async () => {
    expect((await s.as(tok.usr_p02!).put("/api/teams/team_02_01/recruiting", { lookingFor: "hijack" })).status).toBe(403);
    const r = await s.as(TOKENS.participant).put("/api/teams/team_02_01/recruiting", { lookingFor: "A backend dev who likes Postgres" });
    expect(r.status).toBe(200);
    const team = (await board(tok.usr_p01!)).body.teams.find((x: { teamId: string }) => x.teamId === "team_02_01");
    expect(team).toMatchObject({ lookingFor: "A backend dev who likes Postgres", openSpots: 2 });
    expect(team.members[0]).toBeTypeOf("string");
    expect((await s.as(TOKENS.participant).get("/api/events/evt_02/my-team")).body.lookingFor).toBe("A backend dev who likes Postgres");
  });

  it("a solo participant can ask to join a recruiting team; its captain is notified once", async () => {
    // team_02_02 is not recruiting, so the request is refused.
    const closed = await s.as(tok.usr_p01!).post("/api/teams/team_02_02/join-requests");
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("NOT_RECRUITING");
    // team_02_01 is recruiting and usr_p01 is a solo participant.
    const r = await s.as(tok.usr_p01!).post("/api/teams/team_02_01/join-requests");
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ requested: true });
    const [n] = await s.sql("SELECT kind, title FROM notifications WHERE user_id = 'usr_participant' AND kind = 'team_request'");
    expect(n).toMatchObject({ kind: "team_request" });
    expect(n!.title).toContain("asked to join");
    // Asking again does not spam the captain.
    expect((await s.as(tok.usr_p01!).post("/api/teams/team_02_01/join-requests")).status).toBe(201);
    const [count] = await s.sql("SELECT count(*)::int AS n FROM notifications WHERE user_id = 'usr_participant' AND kind = 'team_request'");
    expect(count!.n).toBe(1);
  });

  it("the captain answers a join request — accept adds the member, decline clears it", async () => {
    await s.as(tok.usr_p37!).put("/api/teams/team_02_03/recruiting", { lookingFor: "a regex enthusiast" });
    // Accept: usr_p04 asks to join team_02_03; its board then exposes the request.
    expect((await s.as(tok.usr_p04!).post("/api/teams/team_02_03/join-requests")).status).toBe(201);
    const pending = (await s.as(tok.usr_p37!).get("/api/events/evt_02/team-finder")).body.requests;
    expect(pending.some((x: { userId: string }) => x.userId === "usr_p04")).toBe(true);
    // A non-member cannot answer someone else's request.
    expect((await s.as(tok.usr_p05!).post("/api/teams/team_02_03/join-requests/usr_p04/accept")).status).toBe(403);
    const acc = await s.as(tok.usr_p37!).post("/api/teams/team_02_03/join-requests/usr_p04/accept");
    expect(acc.status).toBe(200);
    expect(acc.body.members.map((m: { userId: string }) => m.userId)).toContain("usr_p04");
    // The request is consumed and cannot be answered twice.
    expect((await s.as(tok.usr_p37!).get("/api/events/evt_02/team-finder")).body.requests.some((x: { userId: string }) => x.userId === "usr_p04")).toBe(false);
    expect((await s.as(tok.usr_p37!).post("/api/teams/team_02_03/join-requests/usr_p04/accept")).status).toBe(404);

    // Decline: usr_p05 asks, is turned down and never joins.
    expect((await s.as(tok.usr_p05!).post("/api/teams/team_02_03/join-requests")).status).toBe(201);
    expect((await s.as(tok.usr_p37!).post("/api/teams/team_02_03/join-requests/usr_p05/reject")).status).toBe(204);
    expect((await s.as(tok.usr_p37!).get("/api/events/evt_02/team-finder")).body.requests.some((x: { userId: string }) => x.userId === "usr_p05")).toBe(false);
    expect((await s.as(tok.usr_p05!).get("/api/events/evt_02/my-team")).body).toBeNull();

    // Restore the seed so later tests see a clean board.
    await s.as(tok.usr_p37!).del("/api/teams/team_02_03/members/usr_p04");
    await s.as(tok.usr_p37!).put("/api/teams/team_02_03/recruiting", { lookingFor: null });
  });

  it("joining a team takes you off the board automatically (database trigger)", async () => {
    const inv = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    expect((await s.as(tok.usr_p01!).post(`/api/invites/${inv.token}/accept`)).status).toBe(200);
    const b = await board(tok.usr_p01!);
    expect(b.body.seekers.some((x: { userId: string }) => x.userId === "usr_p01")).toBe(false);
    expect(b.body.me).toMatchObject({ posted: false, onTeam: true, canPost: false });
    expect(b.body.teams.find((x: { teamId: string }) => x.teamId === "team_02_01").openSpots).toBe(1);
  });

  it("full teams drop off; stopping recruiting removes the team", async () => {
    const inv = (await s.as(TOKENS.participant).post("/api/teams/team_02_01/invites")).body;
    await s.as(tok.usr_p03!).post(`/api/invites/${inv.token}/accept`);
    expect((await board(tok.usr_p02!)).body.teams.some((x: { teamId: string }) => x.teamId === "team_02_01")).toBe(false);
    await s.as(TOKENS.participant).put("/api/teams/team_02_01/recruiting", { lookingFor: null });
    const [row] = await s.sql("SELECT looking_for FROM teams WHERE id = 'team_02_01'");
    expect(row.looking_for).toBeNull();
  });

  it("people can take themselves off the board", async () => {
    await s.as(tok.usr_p02!).put("/api/events/evt_02/team-finder/me", { skills: ["python"] });
    expect((await s.as(tok.usr_p02!).del("/api/events/evt_02/team-finder/me")).status).toBe(204);
    expect((await board(tok.usr_p02!)).body.me.posted).toBe(false);
  });

  it("the board freezes with the roster at the deadline", async () => {
    clock += 4 * 24 * HOUR; // evt_02's deadline is ~3 days after seeding
    const late = await s.as(tok.usr_p02!).put("/api/events/evt_02/team-finder/me", { skills: ["go"] });
    expect(late.body.code).toBe("DEADLINE_PASSED");
    expect((await board(tok.usr_p02!)).body).toMatchObject({ open: false, me: { canPost: false } });
  });
});
