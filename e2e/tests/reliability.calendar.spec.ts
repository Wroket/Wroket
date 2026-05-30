import { test, expect } from "@playwright/test";

import { apiBase } from "../helpers/apiBase";
import { createVerifiedUser } from "../helpers/localAuth";

function futureSlot(daysFromNow = 3, hour = 10, durationMinutes = 60) {
  const start = new Date();
  start.setDate(start.getDate() + daysFromNow);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

test.describe("Reliability — calendar error codes (local store)", () => {
  test.beforeEach(async ({ request }) => {
    await createVerifiedUser(request);
  });

  test("book slot validation returns machine-readable codes", async ({ request }) => {
    const todoRes = await request.post(`${apiBase}/todos`, {
      data: { title: `E2E calendar codes ${Date.now()}`, priority: "medium" },
    });
    expect(todoRes.status()).toBe(201);
    const todo = (await todoRes.json()) as { id: string };

    const cases: Array<{ body: Record<string, unknown>; expectedCode: string; expectedStatus: number }> = [
      { body: {}, expectedCode: "CALENDAR_SLOT_MISSING_RANGE", expectedStatus: 400 },
      { body: { start: 1, end: 2 }, expectedCode: "CALENDAR_SLOT_RANGE_TYPE", expectedStatus: 400 },
      { body: { start: "not-a-date", end: "also-not" }, expectedCode: "CALENDAR_SLOT_INVALID_DATE", expectedStatus: 400 },
      { body: { start: "2030-06-01T10:00:00.000Z", end: "2030-06-01T09:00:00.000Z" }, expectedCode: "CALENDAR_SLOT_INVALID_RANGE", expectedStatus: 400 },
      {
        body: { start: "2030-06-01T10:00:00.000Z", end: "2030-06-15T10:00:00.000Z" },
        expectedCode: "CALENDAR_SLOT_TOO_LONG",
        expectedStatus: 400,
      },
    ];

    for (const c of cases) {
      const res = await request.post(`${apiBase}/calendar/book/${todo.id}`, { data: c.body });
      expect(res.status(), JSON.stringify(c.body)).toBe(c.expectedStatus);
      const json = await res.json();
      expect(json.code, JSON.stringify(c.body)).toBe(c.expectedCode);
    }

    const missingTodo = await request.post(`${apiBase}/calendar/book/nonexistent-todo-id`, {
      data: futureSlot(),
    });
    expect(missingTodo.status()).toBe(404);
    const missingJson = await missingTodo.json();
    expect(missingJson.code).toBe("CALENDAR_TODO_NOT_FOUND");
  });

  test("overlapping in-app slots return CALENDAR_SLOT_CONFLICT", async ({ request }) => {
    const slot = futureSlot(5, 14, 60);
    const todoA = await request.post(`${apiBase}/todos`, {
      data: { title: `E2E slot A ${Date.now()}`, priority: "medium" },
    });
    const todoB = await request.post(`${apiBase}/todos`, {
      data: { title: `E2E slot B ${Date.now()}`, priority: "medium" },
    });
    expect(todoA.status()).toBe(201);
    expect(todoB.status()).toBe(201);
    const a = (await todoA.json()) as { id: string };
    const b = (await todoB.json()) as { id: string };

    const first = await request.post(`${apiBase}/calendar/book/${a.id}`, { data: slot });
    expect(first.ok()).toBeTruthy();

    const overlapStart = new Date(slot.start);
    overlapStart.setMinutes(overlapStart.getMinutes() + 30);
    const overlapEnd = new Date(overlapStart.getTime() + 30 * 60_000);

    const conflict = await request.post(`${apiBase}/calendar/book/${b.id}`, {
      data: { start: overlapStart.toISOString(), end: overlapEnd.toISOString() },
    });
    expect(conflict.status()).toBe(409);
    const conflictJson = await conflict.json();
    expect(conflictJson.code).toBe("CALENDAR_SLOT_CONFLICT");
    expect(Array.isArray(conflictJson.conflicts)).toBe(true);
    expect(conflictJson.conflicts.length).toBeGreaterThan(0);
  });
});
