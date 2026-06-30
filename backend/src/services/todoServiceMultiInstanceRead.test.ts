import { describe, expect, it, beforeEach, vi } from "vitest";

const mockListByAssignedTo = vi.fn();
const mockListByProject = vi.fn();
const mockListByOwner = vi.fn();

vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "false";
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-mi-read-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
  process.env.TODOS_STORAGE_MODE = "v2";
  process.env.TODOS_READ_SOURCE = "firestore";
  process.env.TODOS_BOOT_HYDRATION = "lazy";
});

vi.mock("./todoDocStore", () => ({
  syncOwnerTodosV2: vi.fn(),
  loadAllTodosV2ByOwner: vi.fn(),
  listTodosV2ByOwner: (...args: unknown[]) => mockListByOwner(...args),
  listTodosV2ByAssignedTo: (...args: unknown[]) => mockListByAssignedTo(...args),
  listTodosV2ByProject: (...args: unknown[]) => mockListByProject(...args),
}));

import {
  _resetTodosForTests,
  applyTodoV2DocChange,
  listAssignedToMe,
  listProjectTodos,
  normalizeTodoFromV2Row,
} from "./todoService";

const OWNER = "uid-owner";
const ASSIGNEE = "uid-assignee";
const PROJECT = "proj-abc";

function row(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ownerUid: OWNER,
    userId: OWNER,
    title: `Todo ${id}`,
    priority: "medium",
    effort: "medium",
    estimatedMinutes: null,
    startDate: null,
    deadline: null,
    tags: [],
    status: "active",
    projectId: null,
    phaseId: null,
    parentId: null,
    assignedTo: ASSIGNEE,
    assignmentStatus: "pending",
    scheduledSlot: null,
    suggestedSlot: null,
    recurrence: null,
    sortOrder: null,
    blockedByTodoIds: [],
    statusChangedAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...extra,
  };
}

describe("multi-instance todo reads (Firestore source)", () => {
  beforeEach(() => {
    _resetTodosForTests();
    mockListByAssignedTo.mockReset();
    mockListByProject.mockReset();
    mockListByOwner.mockReset();
  });

  it("listAssignedToMe returns Firestore rows when RAM has no owner cache", async () => {
    mockListByAssignedTo.mockResolvedValue([
      { id: "t-1", ownerUid: OWNER, ...row("t-1") },
    ]);

    const todos = await listAssignedToMe(ASSIGNEE);

    expect(mockListByAssignedTo).toHaveBeenCalledWith(ASSIGNEE);
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe("t-1");
    expect(todos[0].assignedTo).toBe(ASSIGNEE);
  });

  it("listProjectTodos returns Firestore rows when RAM is empty", async () => {
    mockListByProject.mockResolvedValue([
      { id: "t-2", ownerUid: OWNER, ...row("t-2", { projectId: PROJECT, assignedTo: null, assignmentStatus: null }) },
    ]);

    const todos = await listProjectTodos(PROJECT);

    expect(mockListByProject).toHaveBeenCalledWith(PROJECT);
    expect(todos).toHaveLength(1);
    expect(todos[0].projectId).toBe(PROJECT);
  });

  it("normalizeTodoFromV2Row applies legacy defaults", () => {
    const todo = normalizeTodoFromV2Row(
      { title: 123 as unknown as string, status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      "x-1",
      OWNER,
    );
    expect(todo.title).toBe("");
    expect(todo.effort).toBe("medium");
    expect(todo.blockedByTodoIds).toEqual([]);
  });

  it("applyTodoV2DocChange still merges snapshot into RAM", () => {
    applyTodoV2DocChange("t-3", row("t-3"), "added");
    expect(mockListByAssignedTo).not.toHaveBeenCalled();
  });
});
