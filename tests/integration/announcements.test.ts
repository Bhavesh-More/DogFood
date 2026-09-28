import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/** Organizer announcements: audience targeting, pinning, notifications, audit and permissions. */
let s: TestStack;
beforeAll(async () => {
  s = await startStack();
});
afterAll(async () => {
  await s?.close();
});

const post = (body: Record<string, unknown>, token: string = TOKENS.organizer, event = "evt_01") =>
  s.as(token).post(`/api/events/${event}/announcements`, body);
const titles = async (client: ReturnType<TestStack["as"]> | TestStack["anon"], event = "evt_01") =>
  ((await client.get(`/api/events/${event}/announcements`)).body as { title: string }[]).map((a) => a.title);

describe("announcements", () => {
  it("organizers post public news that everyone can read", async () => {
    const r = await post({ title: "Judging starts now", body: "Good luck, everyone!" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ title: "Judging starts now", audience: "everyone", pinned: false, authorName: expect.any(String) });
    expect(await titles(s.anon)).toContain("Judging starts now");
  });

  it("targets participants or judges only, enforced server-side", async () => {
    await post({ title: "Participants: demo slots", body: "Book a 3-minute demo slot.", audience: "participants" });
    await post({ title: "Judges: calibration call", body: "Join at 10:00 UTC.", audience: "judges" });
    const anon = await titles(s.anon);
    expect(anon).not.toContain("Participants: demo slots");
    expect(anon).not.toContain("Judges: calibration call");
    const participant = await titles(s.as(TOKENS.participant));
    expect(participant).toContain("Participants: demo slots");
    expect(participant).not.toContain("Judges: calibration call");
    const judge = await titles(s.as(TOKENS.judgeA));
    expect(judge).toContain("Judges: calibration call");
    expect(judge).not.toContain("Participants: demo slots");
    expect(await titles(s.as(TOKENS.visitor))).not.toContain("Participants: demo slots");
    const organizer = await titles(s.as(TOKENS.organizer));
    expect(organizer).toEqual(expect.arrayContaining(["Participants: demo slots", "Judges: calibration call"]));
  });

  it("copies each announcement to its audience's local mail outbox", async () => {
    const [{ n: judges }] = await s.sql("SELECT count(*)::int AS n FROM event_judges WHERE event_id = 'evt_01'");
    const mails = await s.sql("SELECT to_email FROM outbox WHERE subject = '[Sample Hack 2026] Judges: calibration call'");
    expect(mails).toHaveLength(judges);
    const [{ n: registered }] = await s.sql("SELECT count(*)::int AS n FROM registrations WHERE event_id = 'evt_01'");
    const pmails = await s.sql("SELECT 1 FROM outbox WHERE subject = '[Sample Hack 2026] Participants: demo slots'");
    expect(pmails).toHaveLength(registered);
  });

  it("posts long announcements without tripping the notification length cap", async () => {
    const long = "a".repeat(2500);
    const r = await post({ title: "Long update", body: long, audience: "participants" });
    expect(r.status).toBe(201);
    expect(r.body.body).toHaveLength(2500);
    const [n] = await s.sql("SELECT max(char_length(body))::int AS m FROM notifications WHERE title = 'Long update'");
    expect(n!.m).toBeGreaterThan(0);
    expect(n!.m).toBeLessThanOrEqual(2000);
  });

  it("pinned announcements come first; pinning is an audited edit", async () => {
    const list = (await s.anon.get("/api/events/evt_01/announcements")).body as { id: string; title: string }[];
    const target = list.find((a) => a.title === "Judging starts now")!;
    await post({ title: "Later news", body: "This is newer." });
    const r = await s.as(TOKENS.organizer).patch(`/api/announcements/${target.id}`, { pinned: true });
    expect(r.status).toBe(200);
    expect(r.body.pinned).toBe(true);
    expect((await titles(s.anon))[0]).toBe("Judging starts now");
    const [a] = await s.sql("SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY seq DESC LIMIT 1", [target.id]);
    expect(a.action).toBe("announcement.updated");
  });

  it("emits an announcement.published webhook inside the same transaction", async () => {
    const hook = await s.as(TOKENS.organizer).post("/api/events/evt_01/webhooks", { url: "http://127.0.0.1:9/hook", events: ["announcement.published"] });
    expect(hook.status).toBe(201);
    await post({ title: "Webhook check", body: "Should enqueue a delivery." });
    const rows = await s.sql("SELECT payload FROM webhook_deliveries WHERE webhook_id = $1", [hook.body.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ type: "announcement.published", data: { title: "Webhook check", audience: "everyone" } });
  });

  it("only the event's organizers can post, edit or delete", async () => {
    for (const t of [TOKENS.participant, TOKENS.judgeA, TOKENS.visitor]) {
      expect((await post({ title: "Nope", body: "x" }, t)).status).toBe(403);
    }
    const [{ id: org2 }] = await s.sql("SELECT id FROM users WHERE email = 'organizer2@dogfood.local'");
    const outsider = await s.tokenFor(org2);
    expect([403, 404]).toContain((await post({ title: "Hijack", body: "x" }, outsider)).status);
    const [{ id }] = await s.sql("SELECT id FROM announcements WHERE title = 'Later news'");
    expect([403, 404]).toContain((await s.as(outsider).del(`/api/announcements/${id}`)).status);
    expect((await s.as(TOKENS.organizer).del(`/api/announcements/${id}`)).status).toBe(204);
    expect((await s.as(TOKENS.organizer).patch(`/api/announcements/${id}`, { pinned: true })).status).toBe(404);
  });

  it("validates input and keeps drafts' announcements private", async () => {
    const bad = await post({ title: "x", body: "", audience: "martians" });
    expect(bad.status).toBe(422);
    expect(bad.body.details.map((d: { path: string }) => d.path).sort()).toEqual(["audience", "body", "title"]);
    expect((await s.anon.get("/api/events/evt_04/announcements")).status).toBe(404);
  });
});
