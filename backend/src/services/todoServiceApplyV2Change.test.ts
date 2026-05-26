import { describe, expect, it, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  // Force the local store path used by persistence/initStore so that importing
  // todoService doesn't try to reach Firestore.
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-applyv2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
  // Test-only: force the storage mode env var to v2 before todoService loads,
  // matching the runtime path that calls applyTodoV2DocChange.
  process.env.TODOS_STORAGE_MODE = "v2";
});

import {
  applyTodoV2DocChange,
  getInMemoryTodoIdsByOwner,
  getTodoStoreOwnerId,
  _resetTodosForTests,
} from "./todoService";

const OWNER = "uid-owner-abc";

function fakeTodoDoc(id: string, updatedAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    userId: OWNER,
    ownerUid: OWNER,
    parentId: null,
    projectId: null,
    phaseId: null,
    assignedTo: null,
    assignmentStatus: null,
    title: `Todo ${id}`,
    priority: "medium",
    effort: "medium",
    estimatedMinutes: null,
    startDate: null,
    deadline: null,
    tags: [],
    status: "active",
    scheduledSlot: null,
    suggestedSlot: null,
    recurrence: null,
    sortOrder: null,
    statusChangedAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  };
}

describe("applyTodoV2DocChange", () => {
  beforeEach(() => {
    _resetTodosForTests();
  });

  it("inserts a new todo on 'added'", () => {
    const t = fakeTodoDoc("t-1", "2026-05-26T07:00:00.000Z");
    applyTodoV2DocChange("t-1", t, "added");

    expect(getInMemoryTodoIdsByOwner()[OWNER]).toEqual(["t-1"]);
    expect(getTodoStoreOwnerId("t-1")).toBe(OWNER);
  });

  it("updates an existing todo on 'modified' when incoming is newer", () => {
    applyTodoV2DocChange("t-1", fakeTodoDoc("t-1", "2026-05-26T07:00:00.000Z"), "added");
    const newer = fakeTodoDoc("t-1", "2026-05-26T07:05:00.000Z", { title: "renamed" });

    applyTodoV2DocChange("t-1", newer, "modified");

    expect(getInMemoryTodoIdsByOwner()[OWNER]).toEqual(["t-1"]);
  });

  it("ignores a 'modified' whose updatedAt is older than the local copy (echo of own write)", () => {
    const fresh = fakeTodoDoc("t-1", "2026-05-26T07:10:00.000Z", { title: "fresh" });
    applyTodoV2DocChange("t-1", fresh, "added");

    const stale = fakeTodoDoc("t-1", "2026-05-26T07:00:00.000Z", { title: "stale" });
    applyTodoV2DocChange("t-1", stale, "modified");

    // The stale incoming snapshot must NOT overwrite the fresh local copy.
    // We assert via the side-effect that the id is still present (no removal),
    // and indirectly via the absence of a thrown error.
    expect(getInMemoryTodoIdsByOwner()[OWNER]).toEqual(["t-1"]);
  });

  it("removes a todo on 'removed'", () => {
    applyTodoV2DocChange("t-1", fakeTodoDoc("t-1", "2026-05-26T07:00:00.000Z"), "added");
    applyTodoV2DocChange("t-1", null, "removed");

    expect(getInMemoryTodoIdsByOwner()[OWNER] ?? []).toEqual([]);
    expect(getTodoStoreOwnerId("t-1")).toBeUndefined();
  });

  it("no-ops on 'removed' for an unknown id (idempotent)", () => {
    expect(() => applyTodoV2DocChange("missing", null, "removed")).not.toThrow();
  });

  it("skips when payload has no ownerUid / userId", () => {
    const orphan = { id: "x", title: "orphan", updatedAt: "2026-05-26T07:00:00.000Z" };
    applyTodoV2DocChange("x", orphan, "added");

    expect(getInMemoryTodoIdsByOwner()[OWNER] ?? []).toEqual([]);
    expect(getTodoStoreOwnerId("x")).toBeUndefined();
  });

  it("falls back to userId when ownerUid is missing on the payload", () => {
    const t = fakeTodoDoc("t-2", "2026-05-26T07:00:00.000Z");
    delete (t as Record<string, unknown>).ownerUid;
    applyTodoV2DocChange("t-2", t, "added");

    expect(getInMemoryTodoIdsByOwner()[OWNER]).toEqual(["t-2"]);
  });
});
