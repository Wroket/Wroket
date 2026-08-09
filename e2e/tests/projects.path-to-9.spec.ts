import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Projects Path to 9 smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(90_000);

  test("create project, cancel date-mismatch move, book slot", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const projectName = `E2E proj ${Date.now()}`;
    const createProj = await request.post(`${apiBase}/projects`, {
      data: { name: projectName, description: "path-to-9" },
    });
    expect(createProj.status()).toBe(201);
    const project = (await createProj.json()) as { id: string };

    const phaseA = await request.post(`${apiBase}/projects/${project.id}/phases`, {
      data: {
        name: "Phase A",
        color: "#10b981",
        startDate: "2030-01-01",
        endDate: "2030-01-31",
      },
    });
    expect(phaseA.status()).toBe(201);
    const phaseABody = (await phaseA.json()) as { id: string };

    const phaseB = await request.post(`${apiBase}/projects/${project.id}/phases`, {
      data: {
        name: "Phase B",
        color: "#3b82f6",
        startDate: "2030-03-01",
        endDate: "2030-03-31",
      },
    });
    expect(phaseB.status()).toBe(201);
    const phaseBBody = (await phaseB.json()) as { id: string };

    const taskTitle = `E2E task ${Date.now()}`;
    const createTodo = await request.post(`${apiBase}/todos`, {
      data: {
        title: taskTitle,
        priority: "medium",
        effort: "medium",
        projectId: project.id,
        phaseId: phaseABody.id,
        startDate: "2030-01-10",
        deadline: "2030-01-20",
      },
    });
    expect(createTodo.status()).toBe(201);
    const todo = (await createTodo.json()) as { id: string };

    await page.goto(`/projects?project=${encodeURIComponent(project.id)}`);
    await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 25_000 });

    // Hover board row so phase select is visible, then change phase → constraint modal → cancel
    const taskRow = page.getByText(taskTitle).first().locator("xpath=ancestor::*[contains(@class,'group')][1]");
    await taskRow.hover();
    const phaseSelect = taskRow.locator("select").first();
    await phaseSelect.selectOption(phaseBBody.id);

    const moveDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /dates|créneau|phase|window|slot/i }),
    });
    await expect(moveDialog).toBeVisible({ timeout: 10_000 });
    await moveDialog.getByRole("button", { name: /Annuler|Cancel/i }).click();
    await expect(moveDialog).toHaveCount(0);

    // SlotPicker visible on board — open schedule UI
    await taskRow.getByRole("button", { name: /Planifier|Schedule/i }).click();
    await expect(page.getByText(/Suggestions|Suggested|Manuel|Manual|Réserver|Book/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Book via API (stable) — UI opened confirms SlotPicker path from project
    const bookRes = await request.post(`${apiBase}/calendar/book/${todo.id}`, {
      data: {
        start: "2030-01-15T09:00:00.000Z",
        end: "2030-01-15T09:30:00.000Z",
        force: true,
      },
    });
    expect(bookRes.ok()).toBeTruthy();
  });
});
