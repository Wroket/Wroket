import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock("./authService", () => ({
  getNotificationFilterPrefs: vi.fn(),
}));

import webpush from "web-push";
import { getNotificationFilterPrefs } from "./authService";
import {
  buildWebPushPayload,
  notifOpenUrl,
  shouldSendWebPush,
  sendWebPushForNotification,
} from "./webPushService";
import {
  wirePushSubscriptionUserAccess,
  upsertPushSubscription,
  removePushSubscriptions,
  getWebPushEnabled,
} from "./pushSubscriptionService";
import type { Notification } from "./notificationService";

const mockedSend = webpush.sendNotification as unknown as ReturnType<typeof vi.fn>;
const mockedFilterPrefs = getNotificationFilterPrefs as unknown as ReturnType<typeof vi.fn>;

type TestUser = {
  webPushEnabled?: boolean;
  pushSubscriptions?: Array<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
    createdAt: string;
  }>;
};

const users = new Map<string, TestUser>();

beforeEach(() => {
  users.clear();
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "BKx-test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  process.env.FRONTEND_URL = "https://wroket.com";

  wirePushSubscriptionUserAccess({
    getUser(uid) {
      return users.get(uid);
    },
    persistUser(uid, user) {
      users.set(uid, user);
    },
  });

  users.set("u1", { webPushEnabled: false, pushSubscriptions: [] });
  mockedFilterPrefs.mockReturnValue({ disabledOutbound: [], disabledInApp: [] });
});

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("push subscription CRUD", () => {
  it("upserts and enables web push", () => {
    const stored = upsertPushSubscription("u1", {
      endpoint: "https://push.example/sub/1",
      keys: { p256dh: "p256", auth: "auth" },
    });
    expect(stored.endpoint).toBe("https://push.example/sub/1");
    expect(getWebPushEnabled("u1")).toBe(true);
    expect(users.get("u1")?.pushSubscriptions).toHaveLength(1);
  });

  it("removes one subscription by endpoint", () => {
    upsertPushSubscription("u1", {
      endpoint: "https://push.example/sub/1",
      keys: { p256dh: "a", auth: "b" },
    });
    const removed = removePushSubscriptions("u1", "https://push.example/sub/1");
    expect(removed).toBe(1);
    expect(getWebPushEnabled("u1")).toBe(false);
  });
});

describe("web push payload", () => {
  it("builds deep link for task_assigned", () => {
    const url = notifOpenUrl("task_assigned", { todoId: "todo-42" });
    expect(url).toBe("https://wroket.com/todos?task=todo-42");
  });

  it("shapes notification payload", () => {
    const notif: Notification = {
      id: "n1",
      userId: "u1",
      type: "task_declined",
      title: "Tâche refusée",
      message: "Alice a refusé la tâche",
      read: false,
      data: { todoId: "t9" },
      createdAt: new Date().toISOString(),
    };
    const payload = buildWebPushPayload(notif);
    expect(payload).toEqual({
      title: "Tâche refusée",
      body: "Alice a refusé la tâche",
      url: "https://wroket.com/todos?task=t9",
      notifId: "n1",
      type: "task_declined",
    });
  });
});

describe("sendWebPushForNotification", () => {
  it("skips when outbound type is disabled", async () => {
    upsertPushSubscription("u1", {
      endpoint: "https://push.example/sub/1",
      keys: { p256dh: "a", auth: "b" },
    });
    mockedFilterPrefs.mockReturnValue({ disabledOutbound: ["task_assigned"], disabledInApp: [] });
    expect(shouldSendWebPush("u1", "task_assigned")).toBe(false);

    await sendWebPushForNotification("u1", {
      id: "n1",
      userId: "u1",
      type: "task_assigned",
      title: "x",
      message: "y",
      read: false,
      createdAt: new Date().toISOString(),
    });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("sends and prunes expired subscription (410)", async () => {
    upsertPushSubscription("u1", {
      endpoint: "https://push.example/sub/expired",
      keys: { p256dh: "a", auth: "b" },
    });
    mockedSend.mockRejectedValueOnce({ statusCode: 410 });

    await sendWebPushForNotification("u1", {
      id: "n2",
      userId: "u1",
      type: "deadline_approaching",
      title: "Échéance",
      message: "Demain",
      read: false,
      data: { todoId: "t1" },
      createdAt: new Date().toISOString(),
    });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(users.get("u1")?.pushSubscriptions).toHaveLength(0);
    expect(getWebPushEnabled("u1")).toBe(false);
  });
});
