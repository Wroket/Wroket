import { describe, expect, test } from "vitest";

import { register, setBillingPlanForUid } from "./authService";
import {
  addManualTimeSession,
  listTimeSessionsForTodo,
  startTimeTimer,
  stopTimeTimer,
  sumMinutesForTodo,
} from "./timeSessionService";
import { createTodo } from "./todoService";

describe("timeSessionService", () => {
  test("timer start/stop records session", async () => {
    const user = register({ email: "timer@test.com", password: "password123" });
    setBillingPlanForUid(user.uid, "small");
    const todo = await createTodo(user.uid, user.email, { title: "T", priority: "medium" });
    const started = startTimeTimer(user.uid, user.email, todo.id);
    expect(started.endedAt).toBeNull();

    const stopped = stopTimeTimer(user.uid, todo.id);
    expect(stopped.durationMinutes).toBeGreaterThanOrEqual(1);

    const sessions = listTimeSessionsForTodo(todo.id);
    expect(sessions).toHaveLength(1);
    expect(sumMinutesForTodo(todo.id)).toBe(stopped.durationMinutes);
  });

  test("manual session adds minutes", async () => {
    const user = register({ email: "manual@test.com", password: "password123" });
    setBillingPlanForUid(user.uid, "small");
    const todo = await createTodo(user.uid, user.email, { title: "T2", priority: "low" });
    addManualTimeSession(user.uid, todo.id, 30);
    expect(sumMinutesForTodo(todo.id)).toBe(30);
  });
});
