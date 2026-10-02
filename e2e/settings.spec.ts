import { expect, test } from "@playwright/test";

test("Antigravity provider can be saved and survives a reload", async ({ page }) => {
  await page.goto("/settings?tab=ai");
  await page.getByRole("button", { name: /Antigravity subscription Connect/ }).click();
  await expect(page.getByText(/will use the Antigravity subscription/)).toBeVisible();

  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("AI and discovery settings saved")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Antigravity subscription selected")).toBeVisible();
});
