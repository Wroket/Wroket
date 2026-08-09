import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Task share smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(90_000);

  test("create share link, open public page, revoke", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const title = `E2E task share ${Date.now()}`;
    const createTodo = await request.post(`${apiBase}/todos`, {
      data: { title, priority: "medium", tags: ["e2e"] },
    });
    expect(createTodo.status()).toBe(201);
    const todo = (await createTodo.json()) as { id: string };

    const createLink = await request.post(`${apiBase}/todos/${todo.id}/share-links`, {
      data: { expiryDays: 7 },
    });
    expect(createLink.status()).toBe(201);
    const link = (await createLink.json()) as { id: string; token: string };
    expect(link.token).toBeTruthy();

    const publicRes = await request.get(`${apiBase}/share/task/${link.token}`);
    expect(publicRes.ok()).toBeTruthy();
    const publicView = (await publicRes.json()) as { title?: string };
    expect(publicView.title).toBe(title);

    await page.goto(`/share/task/${link.token}`);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });

    const revoke = await request.delete(`${apiBase}/todos/${todo.id}/share-links/${link.id}`);
    expect(revoke.ok()).toBeTruthy();

    const after = await request.get(`${apiBase}/share/task/${link.token}`);
    expect(after.status()).toBeGreaterThanOrEqual(400);
  });
});
