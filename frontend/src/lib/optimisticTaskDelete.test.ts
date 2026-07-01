import { describe, expect, it } from "vitest";

import type { Todo } from "@/lib/api";
import {
  applyOptimisticDeleteToList,
  markTodoDeleted,
  restoreTodosInList,
  snapshotAffectedTodos,
} from "./optimisticTaskDelete";

const base = (overrides: Partial<Todo> = {}): Todo =>
  ({
    id: "t1",
    title: "Task",
    status: "active",
    userId: "u1",
    priority: "medium",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }) as Todo;

describe("optimisticTaskDelete", () => {
  it("marks parent deleted and promotes subtasks", () => {
    const parent = base({ id: "p" });
    const sub = base({ id: "s", parentId: "p" });
    const next = applyOptimisticDeleteToList([parent, sub], parent, [sub], "promote");
    expect(next.find((t) => t.id === "p")?.status).toBe("deleted");
    expect(next.find((t) => t.id === "s")?.parentId).toBeNull();
  });

  it("restores snapshot after rollback", () => {
    const list = [base({ id: "a" }), base({ id: "b" })];
    const snap = snapshotAffectedTodos(list, new Set(["a"]));
    const mutated = list.map((t) => (t.id === "a" ? markTodoDeleted(t) : t));
    expect(restoreTodosInList(mutated, snap)).toEqual(list);
  });
});
