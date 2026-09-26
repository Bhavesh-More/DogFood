import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * Critical journeys per role, in a real browser against a running stack.
 * Anything a test changes is put back, so the demo data stays as seeded.
 */
const TOKENS = {
  organizer: "dfc_organizer_8b1d3f5a7c9e20461a",
  judge: "dfc_judge_a_2c4e6a8b0d1f39571b",
  participant: "dfc_participant_7d3b1f9e5c2a48064e",
};

async function signInAs(context: BrowserContext, baseURL: string, role: keyof typeof TOKENS) {
  await context.addCookies([{ name: "dogfood_session", value: TOKENS[role], url: new URL(baseURL).origin }]);
}

test.describe("public", () => {
  test("home → events → gallery, with the voting banner and shuffled order", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("judged");
    await page.getByRole("link", { name: "Browse hackathons" }).click();
    await page.getByRole("link", { name: /Sample Hack 2026/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Sample Hack 2026" })).toBeVisible();
    await page.goto("/e/sample-hack-2026/gallery");
    await expect(page.getByText("Community voting is open")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Shuffled" })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test("an anonymous visitor can back a project and withdraw it", async ({ page }) => {
    await page.goto("/e/sample-hack-2026/gallery");
    const back = page.getByRole("button", { name: "Back this" }).first();
    await back.click();
    await expect(page.getByText("1 / 3 picks used")).toBeVisible();
    await page.getByRole("button", { name: "Backed" }).first().click();
    await expect(page.getByText("0 / 3 picks used")).toBeVisible();
  });

  test("results page shows the podium and a leaderboard", async ({ page }) => {
    await page.goto("/e/spring-hack-2026/results");
    await expect(page.getByRole("region", { name: "Podium" })).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Normalized score");
  });

  test("theme toggle switches to dark", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Theme:/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("@mobile the bottom navigation bar replaces the rail on phones", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" }).last();
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Events" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("participant", () => {
  test("signs in with the form and reaches their hub", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("participant@dogfood.local");
    await page.getByLabel(/^Password/).fill("dogfood-demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Autumn Build Week").first()).toBeVisible();
  });

  test("sees the server-clock deadline on the submission editor", async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL!, "participant");
    await page.goto("/e/autumn-build-week/submit");
    await expect(page.getByRole("timer").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/server time/).filter({ visible: true }).first()).toBeVisible();
    await page.goto("/e/sample-hack-2026/submit");
    await expect(page.getByText(/Closed/).filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("judge", () => {
  test("scores with the rubric sliders and cannot open another judge's work", async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL!, "judge");
    await page.goto("/judge/sample-hack-2026");
    await page.getByRole("link").filter({ hasText: /Submitted|Not started|In progress/ }).first().click();
    await expect(page.getByText("Only you and the organizers can see this ballot.")).toBeVisible();
    const slider = page.getByRole("slider").first();
    const before = await slider.inputValue();
    await slider.focus();
    await page.keyboard.press(before === "0" ? "ArrowRight" : "ArrowLeft");
    await expect(slider).not.toHaveValue(before);
    await slider.fill(before); // put it back
    await page.getByRole("button", { name: "Save progress" }).click();
    await expect(slider).toHaveValue(before);
    await page.goto("/judge/sample-hack-2026/a/not-my-assignment");
    await expect(page.getByText("NOT_YOUR_ASSIGNMENT")).toBeVisible();
  });
});

test.describe("organizer", () => {
  test("runs normalization in the Results Lab and sees the invariants hold", async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL!, "organizer");
    await page.goto("/organize/sample-hack-2026/results");
    await page.getByRole("button", { name: "Run normalization" }).click();
    await expect(page.getByText("All hold")).toBeVisible();
    await expect(page.getByText("Judge leniency")).toBeVisible();
    await page.getByRole("tab", { name: /Pairwise/ }).click();
    await expect(page.getByText(/comparisons/i).first()).toBeVisible();
  });
});
