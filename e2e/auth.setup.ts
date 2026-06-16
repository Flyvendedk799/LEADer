import { expect, test as setup } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Logs in with the seeded power-user credentials and saves the session cookie so
// the rest of the suite runs authenticated. Override creds via env if needed.
// Must match `STORAGE_STATE` in playwright.config.ts.
const STORAGE_STATE = "e2e/.auth/state.json";

const EMAIL = process.env.E2E_EMAIL || process.env.DEV_USER_EMAIL || "owner@leader.local";
const PASSWORD = process.env.E2E_PASSWORD || process.env.SEED_PASSWORD || "leader-demo-1234";

setup("authenticate", async ({ request }) => {
  if (!existsSync(dirname(STORAGE_STATE))) mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  const res = await request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `login failed (${res.status()}) — is the DB seeded?`).toBeTruthy();
  await request.storageState({ path: STORAGE_STATE });
});
