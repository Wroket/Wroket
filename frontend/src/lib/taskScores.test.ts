import { describe, expect, it } from "vitest";
import type { Todo } from "@/lib/api";
import { computeTaskScores, radarDotPlacement, spreadRadarDots } from "./taskScores";

function baseTodo(over: Partial<Todo> = {}): Todo {
  return {
    id: "t1",
    userId: "u1",
    parentId: null,
    projectId: null,
    phaseId: null,
    assignedTo: null,
    assignmentStatus: null,
    title: "Test",
    priority: "medium",
    effort: "medium",
    estimatedMinutes: null,
    startDate: null,
    deadline: null,
    tags: [],
    scheduledSlot: null,
    suggestedSlot: null,
    recurrence: null,
    status: "active",
    statusChangedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("computeTaskScores", () => {
  it("places low/light with deadline in 6 months in eliminate", () => {
    const now = new Date("2026-01-01T12:00:00.000Z").getTime();
    const deadline = new Date("2026-07-01T12:00:00.000Z").toISOString();
    const s = computeTaskScores(
      baseTodo({ priority: "low", effort: "light", deadline }),
      now,
    );
    expect(s.quadrant).toBe("eliminate");
    expect(s.U).toBeLessThan(50);
    expect(s.I).toBeLessThan(50);
  });

  it("keeps high-priority far deadline as schedule not do-first", () => {
    const now = new Date("2026-01-01T12:00:00.000Z").getTime();
    const deadline = new Date("2026-04-01T12:00:00.000Z").toISOString();
    const s = computeTaskScores(
      baseTodo({ priority: "high", effort: "medium", deadline }),
      now,
    );
    expect(s.quadrant).toBe("schedule");
  });

  it("no deadline low+light maps to delegate region (urgent x not important heuristic)", () => {
    const s = computeTaskScores(baseTodo({ priority: "low", effort: "light", deadline: null }));
    expect(s.quadrant).toBe("delegate");
    expect(s.U).toBeGreaterThanOrEqual(50);
    expect(s.I).toBeLessThan(50);
  });

  it("overdue bumps urgency", () => {
    const now = new Date("2026-06-15T12:00:00.000Z").getTime();
    const deadline = new Date("2026-06-01T12:00:00.000Z").toISOString();
    const s = computeTaskScores(baseTodo({ priority: "high", effort: "light", deadline }), now);
    expect(s.U).toBeGreaterThanOrEqual(72);
    expect(s.quadrant).toBe("do-first");
  });
});

describe("radarDotPlacement", () => {
  const bounds = {
    "do-first": { l0: 8, l1: 46, b0: 54, b1: 94 },
    delegate: { l0: 54, l1: 94, b0: 54, b1: 94 },
    schedule: { l0: 8, l1: 46, b0: 6, b1: 46 },
    eliminate: { l0: 54, l1: 94, b0: 6, b1: 46 },
  } as const;

  it("eisenhower: dot stays in the visual cell of scores.quadrant", () => {
    const now = new Date("2026-06-15T12:00:00.000Z").getTime();
    const deadline = new Date("2026-06-01T12:00:00.000Z").toISOString();
    const todo = baseTodo({ id: "radar-1", priority: "high", effort: "light", deadline });
    const s = computeTaskScores(todo, now);
    expect(s.quadrant).toBe("do-first");
    const p = radarDotPlacement(todo.id, s, "eisenhower");
    const b = bounds["do-first"];
    expect(p.left).toBeGreaterThanOrEqual(b.l0);
    expect(p.left).toBeLessThanOrEqual(b.l1);
    expect(p.bottom).toBeGreaterThanOrEqual(b.b0);
    expect(p.bottom).toBeLessThanOrEqual(b.b1);
  });

  it("eisenhower: delegate dot is not in do-first box", () => {
    const todo = baseTodo({ id: "radar-2", priority: "low", effort: "light", deadline: null });
    const s = computeTaskScores(todo);
    expect(s.quadrant).toBe("delegate");
    const p = radarDotPlacement(todo.id, s, "eisenhower");
    const b = bounds.delegate;
    expect(p.left).toBeGreaterThanOrEqual(b.l0);
    expect(p.left).toBeLessThanOrEqual(b.l1);
    expect(p.bottom).toBeGreaterThanOrEqual(b.b0);
    expect(p.bottom).toBeLessThanOrEqual(b.b1);
    expect(p.left).toBeGreaterThan(46);
  });
});

describe("spreadRadarDots", () => {
  it("separates two tasks in the same bin", () => {
    const items = [
      { id: "a", left: 30, bottom: 70, quadrant: "do-first" as const },
      { id: "b", left: 31, bottom: 71, quadrant: "do-first" as const },
    ];
    const m = spreadRadarDots(items);
    const pa = m.get("a")!;
    const pb = m.get("b")!;
    const dist = Math.hypot(pa.left - pb.left, pa.bottom - pb.bottom);
    expect(dist).toBeGreaterThan(1.5);
  });
});
