import { test, expect } from "@playwright/test";

test.describe("UI smoke", () => {
  test("login page loads with brand heading and email field", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Wro/i);
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
});
