import { describe, expect, it } from "vitest";
import type { Todo } from "@/lib/api";
import {
  computeRadarTaskScores,
  computeTaskScores,
  constellationLinks,
  radarConstellationRadiusPx,
  radarDotPlacement,
  spreadRadarDots,
  todoForRadarScoring,
} from "./taskScores";

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

describe("todoForRadarScoring / computeRadarTaskScores", () => {
  const now = new Date("2026-01-15T12:00:00.000Z").getTime();

  it("bubbles higher child priority without changing parent effort", () => {
    const parent = baseTodo({ id: "p", priority: "low", effort: "heavy", deadline: null });
    const child = baseTodo({
      id: "c",
      parentId: "p",
      priority: "high",
      effort: "light",
      deadline: null,
    });
    const { scoringTodo, bubbledFromSubtask } = todoForRadarScoring(parent, [child], now);
    expect(bubbledFromSubtask).toBe(true);
    expect(scoringTodo.priority).toBe("high");
    expect(scoringTodo.effort).toBe("heavy");
    const alone = computeTaskScores(parent, now);
    const withKids = computeRadarTaskScores(parent, [child], now);
    expect(withKids.I).toBeGreaterThan(alone.I);
    expect(withKids.bubbledFromSubtask).toBe(true);
  });

  it("bubbles sooner child deadline onto parent scoring", () => {
    const parent = baseTodo({
      id: "p",
      priority: "medium",
      deadline: "2026-06-01",
    });
    const child = baseTodo({
      id: "c",
      parentId: "p",
      priority: "medium",
      deadline: "2026-01-20",
    });
    const alone = computeTaskScores(parent, now);
    const withKids = computeRadarTaskScores(parent, [child], now);
    expect(withKids.bubbledFromSubtask).toBe(true);
    expect(withKids.U).toBeGreaterThan(alone.U);
    expect(withKids.daysLeft).not.toBeNull();
    expect(withKids.daysLeft!).toBeLessThan(alone.daysLeft!);
  });

  it("ignores completed children", () => {
    const parent = baseTodo({ id: "p", priority: "low", deadline: null });
    const child = baseTodo({
      id: "c",
      parentId: "p",
      priority: "high",
      status: "completed",
      deadline: null,
    });
    const { bubbledFromSubtask, scoringTodo } = todoForRadarScoring(parent, [child], now);
    expect(bubbledFromSubtask).toBe(false);
    expect(scoringTodo.priority).toBe("low");
  });
});

describe("radarDotPlacement", () => {
  const bounds = {
    "do-first": { l0: 8, l1: 46, b0: 54, b1: 94 },
    delegate: { l0: 54, l1: 94, b0: 54, b1: 94 },
    schedule: { l0: 8, l1: 46, b0: 6, b1: 46 },
    eliminate: { l0: 54, l1: 94, b0: 6, b1: 46 },
  } as const;

  it("radar view mode: dot stays in the visual cell of scores.quadrant", () => {
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

  it("radar view mode: delegate dot is not in do-first box", () => {
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

describe("radarConstellationRadiusPx", () => {
  it("stays smaller than legacy dots", () => {
    expect(radarConstellationRadiusPx(0, false)).toBeLessThan(4);
    expect(radarConstellationRadiusPx(100, false)).toBeLessThanOrEqual(7);
    expect(radarConstellationRadiusPx(100, true)).toBeLessThanOrEqual(5);
  });
});

describe("constellationLinks", () => {
  it("links tasks that share a project", () => {
    const links = constellationLinks([
      { id: "a", left: 20, bottom: 70, quadrant: "do-first", projectId: "p1" },
      { id: "b", left: 28, bottom: 72, quadrant: "do-first", projectId: "p1" },
      { id: "c", left: 30, bottom: 68, quadrant: "schedule", projectId: "p2" },
    ]);
    expect(links.some((l) => l.a === "a" && l.b === "b")).toBe(true);
    expect(links.some((l) => l.a === "a" && l.b === "c")).toBe(false);
    expect(links.some((l) => l.a === "b" && l.b === "c")).toBe(false);
  });

  it("links same-project tasks across quadrants", () => {
    const links = constellationLinks([
      { id: "a", left: 22, bottom: 78, quadrant: "do-first", projectId: "p1" },
      { id: "b", left: 24, bottom: 22, quadrant: "schedule", projectId: "p1" },
      { id: "c", left: 78, bottom: 20, quadrant: "eliminate", projectId: "p1" },
      { id: "other", left: 70, bottom: 75, quadrant: "delegate", projectId: "p2" },
    ]);
    const ab = links.find((l) => l.a === "a" && l.b === "b");
    expect(ab).toBeTruthy();
    expect(ab!.sameQuadrant).toBe(false);
    expect(links.some((l) => l.a === "a" && l.b === "other")).toBe(false);
    expect(links.some((l) => (l.a === "b" || l.b === "b") && (l.a === "c" || l.b === "c"))).toBe(true);
  });

  it("links parent and child even across quadrants / distance", () => {
    const links = constellationLinks([
      { id: "parent", left: 20, bottom: 80, quadrant: "do-first", parentId: null, projectId: null },
      { id: "child", left: 80, bottom: 20, quadrant: "eliminate", parentId: "parent", projectId: null },
      { id: "lone", left: 22, bottom: 78, quadrant: "do-first", parentId: null, projectId: null },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].a).toBe("child");
    expect(links[0].b).toBe("parent");
  });

  it("does not link independent tasks without project or parent relation", () => {
    const links = constellationLinks([
      { id: "a", left: 20, bottom: 70, quadrant: "do-first" },
      { id: "b", left: 28, bottom: 72, quadrant: "do-first" },
    ]);
    expect(links).toHaveLength(0);
  });

  it("caps degree per node among same-project peers", () => {
    const links = constellationLinks(
      [
        { id: "c", left: 25, bottom: 70, quadrant: "do-first", projectId: "p1" },
        { id: "n1", left: 28, bottom: 70, quadrant: "do-first", projectId: "p1" },
        { id: "n2", left: 25, bottom: 73, quadrant: "do-first", projectId: "p1" },
        { id: "n3", left: 22, bottom: 70, quadrant: "do-first", projectId: "p1" },
        { id: "n4", left: 25, bottom: 67, quadrant: "do-first", projectId: "p1" },
      ],
      { maxDist: 20, maxDegree: 2 },
    );
    const deg = new Map<string, number>();
    for (const l of links) {
      deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
      deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
    }
    for (const d of deg.values()) expect(d).toBeLessThanOrEqual(2);
  });
});
