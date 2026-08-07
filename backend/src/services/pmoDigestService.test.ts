import { describe, expect, it } from "vitest";

import type { Todo } from "./todoService";
import { isEffectivelyOverdue } from "./projectSteeringService";

function todo(partial: Partial<Todo> & { id: string; title: string }): Todo {
  const now = new Date().toISOString();
  return {
    userId: "u1",
    status: "active",
    priority: "medium",
    effort: "medium",
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    assignedTo: null,
    assignmentStatus: null,
    parentId: null,
    projectId: null,
    phaseId: null,
    tags: [],
    deadline: null,
    startDate: null,
    scheduledSlot: null,
    ...partial,
  } as Todo;
}

describe("isEffectivelyOverdue", () => {
  it("flags past deadline", () => {
    const t = todo({ id: "1", title: "A", deadline: "2020-01-01" });
    expect(isEffectivelyOverdue(t, new Date("2026-08-07"))).toBe(true);
  });

  it("ignores future deadline", () => {
    const t = todo({ id: "2", title: "B", deadline: "2099-01-01" });
    expect(isEffectivelyOverdue(t, new Date("2026-08-07"))).toBe(false);
  });
});
