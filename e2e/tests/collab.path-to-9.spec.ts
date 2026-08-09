import { test, expect, request as playwrightRequest } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { createVerifiedUser } from "../helpers/localAuth";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

test.describe("Collab Path to 9 smoke", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(120_000);

  test("invite, assign pending badge, accept from notifications", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const ownerMe = await request.get(`${apiBase}/auth/me`);
    expect(ownerMe.ok()).toBeTruthy();
    const owner = (await ownerMe.json()) as { email: string };

    const assigneeCtx = await playwrightRequest.newContext({ baseURL: apiBase });
    const assigneeCreds = await createVerifiedUser(assigneeCtx, {
      email: `e2e-assignee-${Date.now()}@wroket.local`,
    });
    const assigneeMeRes = await assigneeCtx.get(`${apiBase}/auth/me`);
    expect(assigneeMeRes.ok()).toBeTruthy();
    const assignee = (await assigneeMeRes.json()) as { uid: string; email: string };

    const inviteRes = await request.post(`${apiBase}/teams/collaborators`, {
      data: { email: assignee.email },
    });
    expect([200, 201].includes(inviteRes.status())).toBeTruthy();

    const acceptInvite = await assigneeCtx.post(`${apiBase}/teams/collaborators/accept`, {
      data: { inviterEmail: owner.email },
    });
    expect(acceptInvite.ok()).toBeTruthy();

    const taskTitle = `E2E collab ${Date.now()}`;
    const createTodo = await request.post(`${apiBase}/todos`, {
      data: {
        title: taskTitle,
        priority: "medium",
        effort: "medium",
        assignedTo: assignee.uid,
      },
    });
    expect(createTodo.status()).toBe(201);
    const todo = (await createTodo.json()) as { id: string; assignmentStatus?: string };
    expect(todo.assignmentStatus === "pending" || todo.assignmentStatus == null).toBeTruthy();

    // Switch browser session to assignee
    await page.goto("/login");
    await page.locator("#email").fill(assigneeCreds.email);
    await page.locator("#password").fill(assigneeCreds.password);
    await page.locator("form").getByRole("button", { name: /Se connecter|Sign in/i }).click();
    await page.waitForURL(/\/(dashboard|notes|todos|projects)/, { timeout: 30_000 });

    await page.goto("/todos");
    // Prefer the TaskList row (avoid off-screen / hidden duplicates matching getByText).
    const taskRow = page.locator(".group\\/task").filter({ hasText: taskTitle }).first();
    await expect(taskRow).toBeVisible({ timeout: 25_000 });
    await expect(
      taskRow.getByText(/En attente d'acceptation|Pending acceptance|En attente|Pending/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await page.goto("/notifications");
    const acceptBtn = page.getByRole("button", { name: /Accepter|Accept/i }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 20_000 });
    await acceptBtn.click();
    await expect(page.getByText(/Tâche acceptée|Task accepted|Acceptée|Accepted/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const list = await assigneeCtx.get(`${apiBase}/todos/assigned`);
    expect(list.ok()).toBeTruthy();
    const todos = (await list.json()) as { id: string; assignmentStatus?: string }[];
    const found = todos.find((t) => t.id === todo.id);
    expect(found?.assignmentStatus).toBe("accepted");

    await assigneeCtx.dispose();
  });
});
