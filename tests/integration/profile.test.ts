import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TOKENS, type TestStack } from "./helpers";

/** Public profiles: editable by the owner, readable by any signed-in user, never leaking an email. */
let s: TestStack;
let participant2: string;
beforeAll(async () => {
  s = await startStack();
  participant2 = await s.tokenFor("usr_participant2");
});
afterAll(async () => {
  await s?.close();
});

describe("profiles", () => {
  it("requires sign-in to read or edit a profile", async () => {
    expect((await s.anon.get("/api/profile/me")).status).toBe(401);
    expect((await s.anon.get("/api/users/usr_participant/profile")).status).toBe(401);
    expect((await s.as(TOKENS.participant).get("/api/profile/me")).status).toBe(200);
  });

  it("lets the owner update their profile and round-trips the fields", async () => {
    const r = await s.as(participant2).put("/api/profile/me", {
      headline: "ML engineer & climber",
      bio: "I build models and ship them.",
      techStack: ["Python", "PyTorch", "python"],
      qualifications: "PhD coursework in ML.",
      links: { website: "https://example.com", github: "https://github.com/mateo", linkedin: "" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: "usr_participant2",
      name: "Mateo Rossi",
      role: "participant",
      isSelf: true,
      headline: "ML engineer & climber",
      techStack: ["python", "pytorch"],
      links: { website: "https://example.com", github: "https://github.com/mateo", linkedin: "" },
    });
    expect((await s.as(participant2).get("/api/profile/me")).body.headline).toBe("ML engineer & climber");
  });

  it("rejects non-http links", async () => {
    const r = await s.as(participant2).put("/api/profile/me", { links: { website: "javascript:alert(1)" } });
    expect(r.status).toBe(422);
    expect(r.body.details.some((d: { path: string }) => d.path === "links.website")).toBe(true);
  });

  it("lets another signed-in user read a profile, but never the email", async () => {
    const r = await s.as(TOKENS.participant).get("/api/users/usr_judge_a/profile");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: "Jade Park", role: "judge", isSelf: false });
    expect(r.body.qualifications).toContain("payments");
    expect(JSON.stringify(r.body)).not.toContain("@dogfood.local");
    expect((await s.as(TOKENS.participant).get("/api/profile/me")).body.isSelf).toBe(true);
  });

  it("hides a disabled account's profile", async () => {
    expect((await s.as(TOKENS.admin).patch("/api/admin/users/usr_p05/status", { disabled: true })).status).toBe(200);
    expect((await s.as(TOKENS.participant).get("/api/users/usr_p05/profile")).status).toBe(404);
  });

  it("records the edit in the audit trail", async () => {
    const [row] = await s.sql("SELECT summary FROM audit_log WHERE action = 'user.profile_updated' ORDER BY seq DESC LIMIT 1");
    expect(row?.summary).toContain("profile");
  });
});
