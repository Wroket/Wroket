import { describe, expect, it } from "vitest";

import { register, setBillingPlanForUid } from "./authService";
import { createOkr, computeOkrProgress, updateOkr } from "./okrService";
import { createAutomationRule, evaluateAutomationRules } from "./projectAutomationService";
import { createTodo } from "./todoService";

describe("premium mvp services", () => {
  it("okr progress from KR current/target", () => {
    const user = register({ email: `okr-${Date.now()}@test.local`, password: "password123" });
    setBillingPlanForUid(user.uid, "large");
    const okr = createOkr(user.uid, {
      title: "Ship portal",
      keyResults: [
        { title: "KR1", target: 100, current: 50, unit: "%", linkedTodoIds: [], linkedProjectIds: [] },
      ],
    });
    expect(computeOkrProgress(okr)).toBe(50);
    const updated = updateOkr(user.uid, okr.id, {
      keyResults: [{ ...okr.keyResults[0], current: 100 }],
    });
    expect(computeOkrProgress(updated)).toBe(100);
  });

  it("automation add_tag on todo_created", async () => {
    const user = register({ email: `auto-${Date.now()}@test.local`, password: "password123" });
    setBillingPlanForUid(user.uid, "small");
    createAutomationRule(user.uid, {
      name: "Tag new",
      trigger: "todo_created",
      action: "add_tag",
      actionValue: "auto",
    });
    const todo = await createTodo(user.uid, user.email, { title: "T", priority: "medium" });
    const hits = evaluateAutomationRules(user.uid, "todo_created", todo);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].patch.tags).toContain("auto");
  });
});
