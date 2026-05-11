import { describe, expect, test } from "vitest";

import { computeTeamReportingSnapshot } from "./teamReportingService";
import type { Todo } from "./todoService";

function makeTodo(partial: Partial<Todo> & Pick<Todo, "id" | "userId" | "title" | "status" | "createdAt" | "updatedAt" | "statusChangedAt">): Todo {
  return {
    id: partial.id,
    userId: partial.userId,
    parentId: partial.parentId ?? null,
    projectId: partial.projectId ?? null,
    phaseId: partial.phaseId ?? null,
    assignedTo: partial.assignedTo ?? null,
    assignmentStatus: partial.assignmentStatus ?? null,
    title: partial.title,
    priority: partial.priority ?? "medium",
    effort: partial.effort ?? "medium",
    estimatedMinutes: partial.estimatedMinutes ?? null,
    startDate: partial.startDate ?? null,
    deadline: partial.deadline ?? null,
    tags: partial.tags ?? [],
    status: partial.status,
    scheduledSlot: partial.scheduledSlot ?? null,
    suggestedSlot: partial.suggestedSlot ?? null,
    recurrence: partial.recurrence ?? null,
    sortOrder: partial.sortOrder ?? null,
    statusChangedAt: partial.statusChangedAt,
    createdAt: partial.createdAt,
    updatedAt: partial.updatedAt,
  };
}

describe("computeTeamReportingSnapshot", () => {
  test("counts active, created, completed in period and excludes deleted", () => {
    const now = new Date("2026-05-11T12:00:00.000Z");
    const cutoff = "2026-05-04T13:00:00.000Z";
    const old = "2026-04-01T00:00:00.000Z";

    const todos: Todo[] = [
      makeTodo({
        id: "a1",
        userId: "u1",
        projectId: "p1",
        title: "Active",
        status: "active",
        createdAt: cutoff,
        updatedAt: cutoff,
        statusChangedAt: cutoff,
      }),
      makeTodo({
        id: "c1",
        userId: "u1",
        projectId: "p1",
        title: "Completed in period",
        status: "completed",
        createdAt: old,
        updatedAt: cutoff,
        statusChangedAt: "2026-05-10T10:00:00.000Z",
      }),
      makeTodo({
        id: "d1",
        userId: "u1",
        projectId: "p1",
        title: "Deleted",
        status: "deleted",
        createdAt: cutoff,
        updatedAt: cutoff,
        statusChangedAt: cutoff,
      }),
      makeTodo({
        id: "x1",
        userId: "u1",
        projectId: "p_out",
        title: "Other project",
        status: "active",
        createdAt: cutoff,
        updatedAt: cutoff,
        statusChangedAt: cutoff,
      }),
    ];

    const result = computeTeamReportingSnapshot({
      todos,
      projectIdSet: new Set(["p1"]),
      memberEmailByUid: { u1: "a@ex.com" },
      periodDays: 7,
      now,
    });

    expect(result.summary.active).toBe(1);
    expect(result.summary.completedInPeriod).toBe(1);
    expect(result.summary.createdInPeriod).toBe(1);
    expect(result.byProject).toHaveLength(1);
    expect(result.byProject[0].projectId).toBe("p1");
  });

  test("velocity buckets are 4 calendar weeks starting Monday UTC", () => {
    const now = new Date("2026-05-11T12:00:00.000Z"); // Monday
    const todos: Todo[] = [
      makeTodo({
        id: "c1",
        userId: "u1",
        projectId: "p1",
        title: "Done",
        status: "completed",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-11T12:00:00.000Z",
        statusChangedAt: "2026-05-06T10:00:00.000Z",
      }),
    ];
    const result = computeTeamReportingSnapshot({
      todos,
      projectIdSet: new Set(["p1"]),
      memberEmailByUid: { u1: "a@ex.com" },
      periodDays: 7,
      now,
    });

    expect(result.velocityWeeks).toHaveLength(4);
    // weekEndUtc should be 7 days after weekStartUtc
    expect(result.velocityWeeks[3].weekStartUtc).toBe("2026-05-11");
    expect(result.velocityWeeks[3].weekEndUtc).toBe("2026-05-18");
  });
});

