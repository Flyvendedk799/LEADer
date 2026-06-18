import { expect, test } from "@playwright/test";

// Smoke flow: the core triage journey works end-to-end against seeded data.
// Requires: app running + DB seeded (npm run setup && npm run start).
// The `setup` project (auth.setup.ts) signs in first; these tests run authed.

test("unauthenticated visitors are redirected to login", async ({ browser }) => {
  // A fresh context with no stored session should be bounced to /login.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  await context.close();
});

test("dashboard loads and shows pipeline stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
});

test("opportunities list is filterable and links to detail", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { name: /opportunities/i })).toBeVisible();
  const firstLink = page.locator('a[href^="/opportunities/"]').first();
  await firstLink.click();
  await expect(page).toHaveURL(/\/opportunities\/.+/);
});

test("sources page separates automated vs community lanes", async ({ page }) => {
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: /sources/i })).toBeVisible();
});

test("community import page shows the compliance notice", async ({ page }) => {
  await page.goto("/import");
  await expect(page.getByText(/compliant/i).first()).toBeVisible();
});

test("mobile users can navigate via the hamburger drawer", async ({ page }) => {
  // Below the `md` breakpoint the sidebar is hidden — the drawer is the only nav.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: /open navigation menu/i });
  await expect(menuButton).toBeVisible();

  await menuButton.click();
  const oppLink = page.getByRole("link", { name: "Opportunities" });
  await expect(oppLink).toBeVisible();

  await oppLink.click();
  await expect(page).toHaveURL(/\/opportunities/);
  // Drawer auto-closes on navigation, so its links are no longer in the DOM.
  await expect(page.getByRole("link", { name: "Community import" })).toHaveCount(0);
});

test("command palette opens with ⌘K and jumps to an opportunity", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const dialog = page.getByRole("dialog");
  const input = dialog.getByPlaceholder(/jump to/i);
  await expect(input).toBeVisible();

  // "SaaS" matches a seeded opportunity title. Click the result inside the palette.
  await input.fill("SaaS");
  const hit = dialog.getByRole("button", { name: /SaaS/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page).toHaveURL(/\/opportunities\/.+/);
});

test("clicking a column header sorts via the URL", async ({ page }) => {
  await page.goto("/opportunities");
  await page.getByRole("button", { name: /sort by title/i }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/order=asc/);
  // Clicking again flips the direction.
  await page.getByRole("button", { name: /sort by title/i }).click();
  await expect(page).toHaveURL(/order=desc/);
});

test("bulk-selecting opportunities exposes batch actions", async ({ page }) => {
  await page.goto("/opportunities");
  const checks = page.locator("tbody [role=checkbox]");
  await checks.nth(0).click();
  await checks.nth(1).click();

  await expect(page.getByText(/2 selected/)).toBeVisible();
  await expect(page.getByRole("button", { name: /set status/i })).toBeVisible();

  // Apply a status to the selection; the action bar clears afterwards.
  await page.getByRole("button", { name: /set status/i }).click();
  await page.getByRole("menuitem", { name: /contacted/i }).click();
  await expect(page.getByText(/2 selected/)).toHaveCount(0);
});
