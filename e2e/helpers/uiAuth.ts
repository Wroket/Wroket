import type { APIRequestContext, Page } from "@playwright/test";

import { createVerifiedUser } from "./localAuth";

/**
 * Register + verify via API, then sign in through the login form (session cookie on the page).
 */
export async function loginAsFreshUser(
  page: Page,
  request: APIRequestContext,
): Promise<{ email: string; password: string }> {
  const creds = await createVerifiedUser(request);
  await page.goto("/login");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.locator("form").getByRole("button", { name: /Se connecter|Sign in/i }).click();
  await page.waitForURL(/\/(dashboard|notes|todos|projects)/, { timeout: 30_000 });
  return creds;
}

/** Skip first-run tutorial before the first document load (UI V2 is permanent). */
export async function prepareFreshSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("wroket-tutorial-v6-seen", "1");
    } catch {
      /* ignore */
    }
  });
}

/** @deprecated Use prepareFreshSession — V1 sunset made the UI V2 flag obsolete. */
export const enableUiV2 = prepareFreshSession;
