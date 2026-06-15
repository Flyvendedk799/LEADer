import { defineConfig, devices } from "@playwright/test";

// Shared session file written by the `setup` project (e2e/auth.setup.ts).
const STORAGE_STATE = "e2e/.auth/state.json";

// E2E config. Run `npx playwright install` once, then `npm run test:e2e`.
// Assumes the app + a seeded DB are reachable at BASE_URL (default localhost:3000).
// A `setup` project logs in first and shares the session with the test projects.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  // Uncomment to let Playwright boot the server itself (needs a seeded DB):
  // webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true },
});
