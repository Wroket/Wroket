import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { enableUiV2, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("TaskList UI V2", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(45_000);

  test("toggle, meta columns readable, actions prefs persist", async ({ page, request }) => {
    await enableUiV2(page);
    await loginAsFreshUser(page, request);

    const title = `E2E V2 task ${Date.now()}`;
    const createRes = await request.post(`${apiBase}/todos`, {
      data: { title, priority: "high", effort: "heavy" },
    });
    expect(createRes.status()).toBe(201);

    await page.goto("/todos");
    await expect(page.locator("html")).toHaveClass(/ui-v2/);

    const table = page.getByTestId("task-list");
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table).toHaveClass(/task-list-v2/);
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    // Meta headers match V1 `w-24` (6rem ≈ 96px) — full-width tags, not crushed by Intitulé.
    for (const id of [
      "task-list-col-priority",
      "task-list-col-effort",
      "task-list-col-deadline",
      "task-list-col-focus",
    ]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).toBeTruthy();
      expect(box!.width, `${id} width`).toBeGreaterThanOrEqual(90);
      expect(box!.width, `${id} width`).toBeLessThanOrEqual(110);
    }

    // Focus header label (FR/EN) is fully visible — not clipped to "Class…".
    await expect(
      page.getByTestId("task-list-col-focus").getByRole("button", { name: /^Focus$/i }),
    ).toBeVisible();

    // Actions visibility picker → pin delete → localStorage.
    await page.getByTestId("task-actions-visibility").click();
    const dialog = page.getByRole("dialog", { name: /Actions visibles|Visible actions/i });
    await expect(dialog).toBeVisible();
    await dialog.locator("label", { hasText: /Supprimer|Delete/i }).locator("input").check();
    await page.keyboard.press("Escape");

    const stored = await page.evaluate(() => localStorage.getItem("wroket-ui-v2-task-actions"));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!) as string[]).toContain("delete");

    // Toggle UI V2 off → list loses V2 table class.
    await page.getByTestId("ui-v2-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/ui-v2/);
    await expect(page.getByTestId("task-list")).not.toHaveClass(/task-list-v2/);
  });
});
