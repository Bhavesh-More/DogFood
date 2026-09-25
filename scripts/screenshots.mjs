// Capture UI screenshots for review: node scripts/screenshots.mjs [outDir] [baseUrl]
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "screenshots";
const base = process.argv[3] ?? "http://localhost:8000";
const TOKENS = {
  organizer: "dfc_organizer_8b1d3f5a7c9e20461a",
  judge: "dfc_judge_a_2c4e6a8b0d1f39571b",
  participant: "dfc_participant_7d3b1f9e5c2a48064e",
  admin: "dfc_admin_4f9c2e7a1b8d60536e21",
};
const shots = [
  { name: "home", path: "/" },
  { name: "events", path: "/events" },
  { name: "event", path: "/e/sample-hack-2026" },
  { name: "gallery", path: "/e/sample-hack-2026/gallery" },
  { name: "project", path: "/e/sample-hack-2026/p/sub_01_08" },
  { name: "results", path: "/e/spring-hack-2026/results" },
  { name: "login", path: "/login" },
  { name: "participant-submit", path: "/e/autumn-build-week/submit", as: "participant" },
  { name: "participant-team", path: "/e/autumn-build-week/team", as: "participant" },
  { name: "judge-queue", path: "/judge/sample-hack-2026", as: "judge" },
  { name: "judge-score", path: "/judge/sample-hack-2026/a/asg_evt_01_001", as: "judge" },
  { name: "judge-pairwise", path: "/judge/sample-hack-2026/pairwise", as: "judge" },
  { name: "org-overview", path: "/organize/sample-hack-2026", as: "organizer" },
  { name: "org-judges", path: "/organize/sample-hack-2026/judges", as: "organizer" },
  { name: "org-results", path: "/organize/sample-hack-2026/results", as: "organizer" },
  { name: "org-audit", path: "/organize/sample-hack-2026/audit", as: "organizer" },
  { name: "admin", path: "/admin", as: "admin" },
  { name: "api-docs", path: "/api-docs" },
];
const only = process.env.ONLY?.split(",");
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium" });
for (const theme of (process.env.THEMES ?? "light").split(",")) {
  for (const [label, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    if (process.env.VIEWPORTS && !process.env.VIEWPORTS.split(",").includes(label)) continue;
    for (const s of shots) {
      if (only && !only.includes(s.name)) continue;
      const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 });
      if (s.as) await ctx.addCookies([{ name: "dogfood_session", value: TOKENS[s.as], url: base }]);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(base + s.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${s.name}-${label}-${theme}.png`, fullPage: process.env.FULL !== "0" });
      if (errors.length) console.log(`[${s.name}/${label}/${theme}] errors:`, errors.slice(0, 3));
      await ctx.close();
    }
  }
}
await browser.close();
console.log("done");
