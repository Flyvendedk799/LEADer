import { defineConfig, devices } from "@playwright/test";

// E2E config. Run `npx playwright install` once, then `npm run test:e2e`.
// Assumes the app + a seeded DB are reachable at BASE_URL (default localhost:3000).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Uncomment to let Playwright boot the dev server itself:
  // webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
