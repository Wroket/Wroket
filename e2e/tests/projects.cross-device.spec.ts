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

test.describe("Projects cross-device visibility refresh", () => {
  test.skip(!email || !password, "Set E2E_NOTES_EMAIL and E2E_NOTES_PASSWORD");

  test("projects page refetches on visibilitychange without manual F5", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    let projectFetchCount = 0;
    pageA.on("request", (req) => {
      if (req.url().includes("/projects") && req.method() === "GET" && !req.url().includes("todos")) {
        projectFetchCount++;
      }
    });

    await login(pageA);
    await pageA.goto("/projects");
    await pageA.waitForTimeout(2000);

    const fetchesBefore = projectFetchCount;

    // Simulate hidden -> visible
    await pageA.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await pageA.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await pageA.waitForTimeout(1000);

    expect(projectFetchCount).toBeGreaterThan(fetchesBefore);

    await contextA.close();
  });

  test("project created on second browser appears on first after tab refocus", async ({ browser }) => {
    const projectName = `E2E cross-project ${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await login(pageA);
    await pageA.goto("/projects");
    await pageA.waitForTimeout(2000);

    // Device B creates a project
    await login(pageB);
    await pageB.goto("/projects");
    await pageB.waitForTimeout(2000);
    const newProjectBtn = pageB.getByRole("button").filter({ hasText: /Nouveau|New|Créer|Create/i }).first();
    await newProjectBtn.click();
    await pageB.getByRole("textbox").first().fill(projectName);
    await pageB.getByRole("button").filter({ hasText: /Créer|Valider|Save|Create/i }).first().click();
    await pageB.waitForTimeout(1500);

    // Simulate Device A tab refocus
    await pageA.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await pageA.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await pageA.waitForTimeout(1500);

    await expect(pageA.getByText(projectName)).toBeVisible({ timeout: 15_000 });

    await contextA.close();
    await contextB.close();
  });
});
