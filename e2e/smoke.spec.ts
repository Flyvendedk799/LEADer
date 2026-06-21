import { expect, test } from "@playwright/test";

// Smoke flow: the V2 client-acquisition cockpit works end-to-end against seeded data.
// The `setup` project (auth.setup.ts) signs in first; these tests run authed.

test("unauthenticated visitors are redirected to login", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/deals");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await context.close();
});

test("client cockpit loads and shows acquisition stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /client cockpit/i })).toBeVisible();
  await expect(page.getByText(/open deals/i)).toBeVisible();
});

test("deals list links to deal detail", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByRole("heading", { name: /^deals$/i })).toBeVisible();
  const firstLink = page.locator('a[href^="/deals/"]').first();
  await firstLink.click();
  await expect(page).toHaveURL(/\/deals\/.+/);
  await expect(page.getByText(/deal brief/i)).toBeVisible();
});

test("accounts list links to account detail", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: /^accounts$/i })).toBeVisible();
  const firstLink = page.locator('a[href^="/accounts/"]').first();
  await firstLink.click();
  await expect(page).toHaveURL(/\/accounts\/.+/);
  await expect(page.getByText(/deals/i).first()).toBeVisible();
});

test("discover shows lane mission control", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: /discovery mission control/i })).toBeVisible();
  await expect(page.getByText(/lane playbook/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /run lane/i })).toBeVisible();
});

test("platform agent can read CRM data and create a task", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /open leader agent/i }).click();
  const agent = page.getByRole("dialog", { name: /leader agent/i });
  await expect(agent.getByRole("heading", { name: /leader agent/i })).toBeVisible();

  const prompt = agent.getByPlaceholder(/ask about the crm/i);
  await prompt.fill("What needs my attention today?");
  await agent.getByRole("button", { name: /^send$/i }).click();
  await expect(agent.getByText(/Client cockpit|open deals|hot candidates/i).first()).toBeVisible();

  await prompt.fill(`Create a task called E2E agent follow-up ${Date.now()}`);
  await agent.getByRole("button", { name: /^send$/i }).click();
  await expect(agent.getByText(/Task created|Created task/i).first()).toBeVisible();
});

test("legacy opportunities route redirects to deals", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/deals/);
});

test("mobile users can navigate via the hamburger drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: /open navigation menu/i });
  await expect(menuButton).toBeVisible();

  await menuButton.click();
  const dealsLink = page.getByRole("link", { name: "Deals" });
  await expect(dealsLink).toBeVisible();

  await dealsLink.click();
  await expect(page).toHaveURL(/\/deals/);
  await expect(page.getByRole("link", { name: "Community import" })).toHaveCount(0);
});

test("command palette opens with ctrl+k and jumps to a deal", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const dialog = page.getByRole("dialog");
  const input = dialog.getByPlaceholder(/jump to/i);
  await expect(input).toBeVisible();

  await input.fill("SaaS");
  const hit = dialog.getByRole("button", { name: /SaaS/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/\/deals\/.+/);
});
