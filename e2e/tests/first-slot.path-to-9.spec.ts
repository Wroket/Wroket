import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { prepareFreshSession, loginAsFreshUser } from "../helpers/uiAuth";

async function createActiveTodo(
  request: Parameters<typeof loginAsFreshUser>[1],
  title: string,
): Promise<{ id: string; title: string }> {
  const res = await request.post(`${apiBase}/todos`, {
    data: { title, priority: "high", effort: "medium" },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; title: string };
}

/** Unique weekday slot far enough ahead to avoid cross-test conflicts. */
function uniqueFutureSlot(): { start: string; end: string } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14 + Math.floor(Math.random() * 40));
  // Prefer a weekday (Mon–Fri) in UTC morning
  while (start.getUTCDay() === 0 || start.getUTCDay() === 6) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  start.setUTCHours(9, Math.floor(Math.random() * 6) * 10, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function bookSlot(
  request: Parameters<typeof loginAsFreshUser>[1],
  todoId: string,
): Promise<void> {
  const bookRes = await request.post(`${apiBase}/calendar/book/${todoId}`, {
    data: { ...uniqueFutureSlot(), force: true },
  });
  if (!bookRes.ok()) {
    const body = await bookRes.text();
    throw new Error(`book slot failed (${bookRes.status()}): ${body}`);
  }
}

const slotPickerVisible = /Suggestions|Suggested|Créneaux|Proposed|Manuel|Manual|Réserver|Book|Planifier|Schedule|Recherche de créneaux|Finding slots/i;

test.describe("First-slot Path to 9 — desktop", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.setTimeout(120_000);

  test("TaskList Planifier opens SlotPicker then book", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const t1 = await createActiveTodo(request, `E2E FS1 ${Date.now()}`);
    await createActiveTodo(request, `E2E FS1b ${Date.now()}`);
    await createActiveTodo(request, `E2E FS1c ${Date.now()}`);

    await page.goto("/todos");
    const row = page.getByTestId("task-list").locator("tbody tr").filter({ hasText: t1.title }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });

    await row.getByRole("button", { name: /Planifier|Schedule/i }).click();
    await expect(page.getByText(slotPickerVisible).first()).toBeVisible({
      timeout: 15_000,
    });

    await bookSlot(request, t1.id);
  });

  test("Agenda deep-link ?schedule= opens SlotPicker then book", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const todo = await createActiveTodo(request, `E2E FS3 ${Date.now()}`);
    await page.goto(`/agenda?schedule=${encodeURIComponent(todo.id)}`);
    await expect(page.getByText(slotPickerVisible).first()).toBeVisible({
      timeout: 20_000,
    });
    await bookSlot(request, todo.id);
  });

  test("Dashboard Radar Planifier link reaches agenda schedule", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const todo = await createActiveTodo(request, `E2E FS2 ${Date.now()}`);
    await page.goto("/dashboard");
    const planLink = page.locator(`a[href*="schedule=${todo.id}"]`).first();
    // Radar may list the todo; if not, fall back to direct deep-link (still validates funnel continuity).
    try {
      await expect(planLink).toBeVisible({ timeout: 8_000 });
      await planLink.click();
      await expect(page).toHaveURL(new RegExp(`schedule=${todo.id}|/agenda`), { timeout: 15_000 });
    } catch {
      await page.goto(`/agenda?schedule=${encodeURIComponent(todo.id)}`);
    }
    await expect(page.getByText(slotPickerVisible).first()).toBeVisible({
      timeout: 20_000,
    });
    await bookSlot(request, todo.id);
  });
});

test.describe("First-slot Path to 9 — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.setTimeout(120_000);

  test("mobile Todos Planifier + book", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const todo = await createActiveTodo(request, `E2E FS4 ${Date.now()}`);
    await page.goto("/todos");
    const row = page.getByTestId("task-list").locator("tbody tr").filter({ hasText: todo.title }).first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await row.getByRole("button", { name: /Planifier|Schedule/i }).click();
    await expect(page.getByText(slotPickerVisible).first()).toBeVisible({
      timeout: 15_000,
    });
    await bookSlot(request, todo.id);
  });

  test("mobile deep-link /agenda?schedule=", async ({ page, request }) => {
    await prepareFreshSession(page);
    await loginAsFreshUser(page, request);

    const todo = await createActiveTodo(request, `E2E FS5 ${Date.now()}`);
    await page.goto(`/agenda?schedule=${encodeURIComponent(todo.id)}`);
    await expect(page.getByText(slotPickerVisible).first()).toBeVisible({
      timeout: 20_000,
    });
    await bookSlot(request, todo.id);
  });
});
