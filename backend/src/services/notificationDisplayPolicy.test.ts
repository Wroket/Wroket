import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-notif-policy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import {
  NOTIFICATION_DISPLAY_PAST_DAYS,
  filterNotificationsForDisplay,
  isNotificationDisplayable,
} from "./notificationDisplayPolicy";
import { createNotification, type Notification } from "./notificationService";
import { createTodo, _resetTodosForTests } from "./todoService";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysAheadIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T12:00:00";
}

describe("notificationDisplayPolicy", () => {
  beforeAll(async () => {
    const { initStore } = await import("../persistence");
    await initStore();
  });

  beforeEach(() => {
    _resetTodosForTests();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("hides generic notifications older than the rolling window", () => {
    const userId = uid("u");
    const old: Notification = {
      id: "n-old",
      userId,
      type: "task_assigned",
      title: "T",
      message: "M",
      read: true,
      createdAt: daysAgoIso(NOTIFICATION_DISPLAY_PAST_DAYS + 1),
    };
    const recent: Notification = {
      id: "n-recent",
      userId,
      type: "task_assigned",
      title: "T",
      message: "M",
      read: false,
      createdAt: daysAgoIso(2),
    };
    expect(isNotificationDisplayable(old, userId)).toBe(false);
    expect(isNotificationDisplayable(recent, userId)).toBe(true);
  });

  it("keeps unread team invites beyond the rolling window", () => {
    const userId = uid("u");
    const invite: Notification = {
      id: "n-invite",
      userId,
      type: "team_invite",
      title: "Invite",
      message: "Join",
      read: false,
      data: { inviterEmail: "a@test.com" },
      createdAt: daysAgoIso(NOTIFICATION_DISPLAY_PAST_DAYS + 3),
    };
    expect(isNotificationDisplayable(invite, userId)).toBe(true);
  });

  it("keeps deadline reminders while the task effective due is today or later", async () => {
    const userId = uid("u");
    const todo = await createTodo(userId, "u@test.com", {
      title: "Future task",
      priority: "medium",
      deadline: daysAheadIso(3),
    });

    const staleReminder: Notification = {
      id: "n-deadline",
      userId,
      type: "deadline_approaching",
      title: "Échéance proche",
      message: "…",
      read: false,
      data: { todoId: todo.id, todoTitle: todo.title },
      createdAt: daysAgoIso(NOTIFICATION_DISPLAY_PAST_DAYS + 2),
    };

    expect(isNotificationDisplayable(staleReminder, userId)).toBe(true);

    const filtered = filterNotificationsForDisplay([staleReminder], userId);
    expect(filtered).toHaveLength(1);
  });

  it("listNotificationsForDisplay and unreadCount stay aligned", async () => {
    const userId = uid("u");
    createNotification(userId, "task_assigned", "A", "Recent assign", { todoId: "x" });
    const svc = await import("./notificationService");
    const visible = svc.listNotificationsForDisplay(userId);
    const count = svc.unreadCount(userId);
    expect(count).toBe(visible.filter((n) => !n.read).length);
  });
});
