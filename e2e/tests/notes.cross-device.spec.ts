import { test, expect } from "@playwright/test";

const email = process.env.E2E_NOTES_EMAIL;
const password = process.env.E2E_NOTES_PASSWORD;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.locator("form").getByRole("button", { name: /Se connecter|Sign in/i }).click();
  await page.waitForURL(/\/(dashboard|notes|todos)/, { timeout: 30_000 });
}

test.describe("Notes cross-device ghost purge", () => {
  test.skip(!email || !password, "Set E2E_NOTES_EMAIL and E2E_NOTES_PASSWORD (account without 2FA, email verified)");

  test("note deleted in second browser disappears from first after reload", async ({ browser }) => {
    const title = `E2E notes purge ${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await login(pageA);
    await pageA.goto("/notes");
    await expect(pageA.getByRole("heading", { name: /Bloc-notes|Notes/i })).toBeVisible({ timeout: 15_000 });

    await pageA.getByTestId("notes-new").click();
    await pageA.getByTestId("note-title-input").fill(title);
    await pageA.getByTestId("note-title-input").blur();
    await pageA.waitForTimeout(2500);

    const noteId = await pageA.evaluate(() => {
      const raw = localStorage.getItem("wroket_notes");
      if (!raw) return null;
      const list = JSON.parse(raw) as Array<{ id: string; title: string }>;
      return list.find((x) => x.title === title)?.id ?? null;
    });
    expect(noteId, "expected new note id in localStorage").toBeTruthy();

    await login(pageB);
    await pageB.goto("/notes");
    await expect(pageB.getByRole("heading", { name: /Bloc-notes|Notes/i })).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole("button").filter({ hasText: title }).first().click();
    await pageB.getByTestId("note-delete-open").click();
    await pageB.getByTestId("note-delete-confirm").click();
    await pageB.waitForTimeout(1500);

    await pageA.reload();
    await expect(pageA.getByRole("button").filter({ hasText: title })).toHaveCount(0, { timeout: 15_000 });

    const stillInLs = await pageA.evaluate((id) => {
      const raw = localStorage.getItem("wroket_notes");
      if (!raw) return false;
      const list = JSON.parse(raw) as Array<{ id: string }>;
      return list.some((x) => x.id === id);
    }, noteId as string);
    expect(stillInLs).toBe(false);

    await contextA.close();
    await contextB.close();
  });
});
