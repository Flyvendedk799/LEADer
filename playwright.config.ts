import { defineConfig, devices } from "@playwright/test";

// Shared session file written by the `setup` project (e2e/auth.setup.ts).
const STORAGE_STATE = "e2e/.auth/state.json";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";

// E2E config. Run `npx playwright install` once, then `npm run test:e2e`.
// Assumes the app + a seeded DB are reachable at BASE_URL (default 127.0.0.1:3000).
// A `setup` project logs in first and shares the session with the test projects.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
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
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
