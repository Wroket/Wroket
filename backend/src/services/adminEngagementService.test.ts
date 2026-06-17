import { describe, expect, test } from "vitest";

import { getStore } from "../persistence";
import { logActivity } from "./activityLogService";
import { computeAdminEngagementSnapshot } from "./adminEngagementService";

describe("computeAdminEngagementSnapshot", () => {
  test("aggregates users, tasks and activity from store", async () => {
    const { _resetTodosForTests } = await import("./todoService");
    _resetTodosForTests();

    const store = getStore();
    const recent = "2026-05-10T10:00:00.000Z";
    const old = "2026-04-01T00:00:00.000Z";
    const now = new Date("2026-05-11T12:00:00.000Z");

    store.users = {
      u1: {
        uid: "u1",
        email: "a@test.com",
        emailVerified: true,
        createdAt: recent,
        passwordHashB64: "short",
      },
      u2: {
        uid: "u2",
        email: "b@test.com",
        emailVerified: false,
        createdAt: old,
        passwordHashB64: "short",
      },
    };

    store.todos = {
      u1: {
        t1: {
          id: "t1",
          userId: "u1",
          title: "Active",
          status: "active",
          priority: "high",
          effort: "low",
          createdAt: recent,
          updatedAt: recent,
          statusChangedAt: recent,
        },
        t2: {
          id: "t2",
          userId: "u1",
          title: "Done",
          status: "completed",
          priority: "medium",
          effort: "medium",
          createdAt: old,
          updatedAt: recent,
          statusChangedAt: recent,
        },
      },
    };

    logActivity("u1", "a@test.com", "todo_created", "todo", "t1", {});
    logActivity("u2", "b@test.com", "todo_created", "todo", "t2", {});

    const snap = await computeAdminEngagementSnapshot({ periodDays: 7, now });
    expect(snap.activeUsers.totalUsers).toBe(2);
    expect(snap.activeUsers.wau).toBeGreaterThanOrEqual(1);
    expect(snap.growth.emailVerificationRate).toBe(50);
    expect(snap.tasks.summary.active).toBe(1);
    expect(snap.tasks.summary.completedInPeriod).toBe(1);
    expect(snap.tasks.byStatus.active).toBe(1);
    expect(snap.tasks.byStatus.completed).toBe(1);
    expect(snap.tasks.byPriority.high).toBe(1);
    expect(snap.growth.weeklyTrends).toHaveLength(8);
    expect(snap.tasks.velocityWeeks).toHaveLength(4);
    expect(snap.adoption.length).toBeGreaterThan(0);
  });
});
