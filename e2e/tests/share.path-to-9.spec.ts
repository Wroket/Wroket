import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Project share Path to 9 smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(90_000);

  test("create share link, open public page, revoke", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const projectName = `E2E share ${Date.now()}`;
    const createProj = await request.post(`${apiBase}/projects`, {
      data: { name: projectName, description: "share-smoke" },
    });
    expect(createProj.status()).toBe(201);
    const project = (await createProj.json()) as { id: string };

    const createLink = await request.post(`${apiBase}/projects/${project.id}/share-links`, {
      data: { expiryDays: 7, tabs: ["pilotage", "kanban", "gantt"] },
    });
    expect(createLink.status()).toBe(201);
    const link = (await createLink.json()) as { id: string; token: string };
    expect(link.token).toBeTruthy();

    const publicRes = await request.get(`${apiBase}/share/project/${link.token}`);
    expect(publicRes.ok()).toBeTruthy();
    const publicView = (await publicRes.json()) as { projectName?: string };
    expect(publicView.projectName).toBe(projectName);

    await page.goto(`/share/project/${link.token}`);
    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 20_000 });

    const revoke = await request.delete(`${apiBase}/projects/${project.id}/share-links/${link.id}`);
    expect(revoke.ok()).toBeTruthy();

    const after = await request.get(`${apiBase}/share/project/${link.token}`);
    expect(after.status()).toBeGreaterThanOrEqual(400);
  });
});
