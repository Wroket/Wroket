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

/** Enable UI V2 (and skip first-run tutorial) before the first document load. */
export async function enableUiV2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("wroket-ui-v2", "1");
      localStorage.setItem("wroket-tutorial-v4-seen", "1");
    } catch {
      /* ignore */
    }
  });
}
