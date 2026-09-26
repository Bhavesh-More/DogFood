import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests against a running stack (default: docker compose on :8000).
 *   E2E_BASE_URL=http://localhost:8000 pnpm test:e2e
 * Browsers: `pnpm exec playwright install chromium`, or point CHROME at an existing binary.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8000",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
