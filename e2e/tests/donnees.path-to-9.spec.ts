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

    // Cold path 1: Note → export menu (CSV / JSON / Markdown)
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

    // Cold path 2: Import hub reachable from Compte & données + Intégrations
    await page.goto("/settings?tab=admin");
    await expect(page.getByRole("link", { name: /Import|Importer|Intégrations|Integrations/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.goto("/settings?tab=integrations");
    await expect(
      page.getByText(/Notion|Monday|Import|Importer|CSV|JSON/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    // Cold path 3: Compte & données — export visible + cancel delete (do not purge)
    await page.goto("/settings?tab=admin");
    await expect(page.getByRole("button", { name: /Télécharger l'export JSON|Download JSON export/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByText(/Zone de danger|Danger zone/i).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: /Supprimer mon compte|Delete my account/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /Annuler|Cancel/i }).click();
    await expect(dialog).toHaveCount(0);
  });
});
