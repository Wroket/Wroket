import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Données Path to 9 smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(90_000);

  test("create note, notes export menu, account my-export", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const noteTitle = `E2E note ${Date.now()}`;
    const createNote = await request.post(`${apiBase}/notes`, {
      data: { title: noteTitle, content: "<p>path-to-9</p>" },
    });
    expect([200, 201].includes(createNote.status())).toBeTruthy();

    await page.goto("/notes");
    await expect(page.getByTestId("export-import-menu").first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("export-import-menu").first().click();
    await expect(page.getByRole("menuitem", { name: /CSV/i }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("menuitem", { name: /JSON/i }).first()).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Markdown|Exporter en Markdown/i }).first()).toBeVisible();
    await page.keyboard.press("Escape");

    const exportRes = await request.get(`${apiBase}/auth/my-export`);
    expect(exportRes.ok()).toBeTruthy();
    const body = (await exportRes.json()) as { notes?: unknown[]; archivedNotes?: unknown[] };
    expect(Array.isArray(body.notes)).toBeTruthy();
    expect(Array.isArray(body.archivedNotes)).toBeTruthy();
  });
});
