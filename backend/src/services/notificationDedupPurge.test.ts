import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(
    tmpdir(),
    `wroket-notif-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import {
  _resetNotificationsForTests,
  createNotification,
  listNotifications,
  purgeNotificationsForTodo,
} from "./notificationService";
import { filterNotificationsForDisplay } from "./notificationDisplayPolicy";
import { createTodo, _resetTodosForTests } from "./todoService";

describe("notification dedup + purge", () => {
  beforeAll(async () => {
    const { initStore } = await import("../persistence");
    await initStore();
  });

  beforeEach(() => {
    _resetNotificationsForTests();
    _resetTodosForTests();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("dedups identical type+todoId within the short window", () => {
    const a = createNotification("uid-a", "task_assigned", "A1", "msg1", { todoId: "t1" });
    const b = createNotification("uid-a", "task_assigned", "A2", "msg2", { todoId: "t1" });
    expect(b.id).toBe(a.id);
    expect(listNotifications("uid-a")).toHaveLength(1);
  });

  it("does not dedup different resource ids", () => {
    createNotification("uid-a", "task_assigned", "A1", "msg1", { todoId: "t1" });
    createNotification("uid-a", "task_assigned", "A2", "msg2", { todoId: "t2" });
    expect(listNotifications("uid-a")).toHaveLength(2);
  });

  it("purges task-linked notifications for a todo across users", () => {
    createNotification("assignee", "task_assigned", "Assign", "you got t1", { todoId: "t1" });
    createNotification("owner", "task_accepted", "Accepted", "accepted t1", { todoId: "t1" });
    createNotification("assignee", "task_assigned", "Other", "other", { todoId: "t2" });
    const removed = purgeNotificationsForTodo("t1");
    expect(removed).toBe(2);
    expect(listNotifications("assignee")).toHaveLength(1);
    expect(listNotifications("assignee")[0]!.data?.todoId).toBe("t2");
    expect(listNotifications("owner")).toHaveLength(0);
  });

  it("hides orphan task_assigned when todo is missing for viewer", async () => {
    createNotification("uid-viewer", "task_assigned", "Assign", "gone", { todoId: "missing-todo" });
    const visible = filterNotificationsForDisplay(listNotifications("uid-viewer"), "uid-viewer");
    expect(visible).toHaveLength(0);
  });

  it("keeps task_assigned while todo is still active for viewer", async () => {
    const todo = await createTodo("uid-owner", "owner@test.local", {
      title: "Keep me",
      priority: "medium",
    });
    createNotification("uid-owner", "task_assigned", "Assign", "active", { todoId: todo.id });
    const visible = filterNotificationsForDisplay(listNotifications("uid-owner"), "uid-owner");
    expect(visible.some((n) => n.data?.todoId === todo.id)).toBe(true);
  });
});
