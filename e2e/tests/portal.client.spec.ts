import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Client portal smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(90_000);

  test("create portal, open hub, revoke", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const projectName = `E2E portal ${Date.now()}`;
    const createProj = await request.post(`${apiBase}/projects`, {
      data: { name: projectName, description: "portal-smoke" },
    });
    expect(createProj.status()).toBe(201);
    const project = (await createProj.json()) as { id: string };

    const createPortal = await request.post(`${apiBase}/portals`, {
      data: {
        label: "Smoke portal",
        projectIds: [project.id],
        expiryDays: 7,
        branding: { displayName: "Smoke Brand" },
        privacy: { showTasks: true },
        guestEmails: ["guest@example.com"],
      },
    });
    expect(
      createPortal.status(),
      `portal create failed: ${await createPortal.text()}`,
    ).toBe(201);
    const portal = (await createPortal.json()) as { id: string; token: string };
    expect(portal.token).toBeTruthy();

    const hubRes = await request.get(`${apiBase}/share/portal/${portal.token}`);
    expect(hubRes.ok()).toBeTruthy();
    const hub = (await hubRes.json()) as {
      branding?: { displayName?: string };
      projects?: { projectName?: string }[];
    };
    expect(hub.branding?.displayName).toBe("Smoke Brand");
    expect(hub.projects?.[0]?.projectName).toBe(projectName);

    await page.goto(`/share/portal/${portal.token}`);
    await expect(page.getByText("Smoke Brand").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 20_000 });

    const revoke = await request.delete(`${apiBase}/portals/${portal.id}`);
    expect(revoke.ok()).toBeTruthy();

    const after = await request.get(`${apiBase}/share/portal/${portal.token}`);
    expect(after.status()).toBeGreaterThanOrEqual(400);
  });
});
