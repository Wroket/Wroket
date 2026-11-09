import { describe, expect, it } from "vitest";

import { computeProjectSteering } from "./projectSteering";
import type { Project, Todo } from "./api";

function baseProject(over: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Demo",
    description: "",
    ownerUid: "u1",
    teamId: null,
    status: "active",
    parentProjectId: null,
    sortOrder: 0,
    tags: [],
    phases: [
      {
        id: "ph1",
        projectId: "p1",
        name: "Scoping",
        color: "#64748b",
        order: 0,
        startDate: "2026-11-09",
        endDate: "2026-11-22",
        createdAt: "2026-11-09T00:00:00.000Z",
      },
    ],
    milestones: [
      {
        id: "m1",
        projectId: "p1",
        title: "Scoping",
        date: "2026-11-22",
        order: 0,
        phaseId: "ph1",
        color: "#64748b",
        createdAt: "2026-11-09T00:00:00.000Z",
      },
    ],
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T00:00:00.000Z",
    ...over,
  } as Project;
}

describe("computeProjectSteering upcomingMilestones", () => {
  it("dedupes phase end when a milestone covers the same phase+date", () => {
    const snap = computeProjectSteering(baseProject(), [], new Date("2026-11-09T12:00:00"));
    const labels = snap.upcomingMilestones.map((m) => m.label);
    expect(labels.filter((l) => /Scoping/i.test(l))).toHaveLength(1);
    expect(labels).toContain("Scoping");
    expect(labels.some((l) => l.includes("("))).toBe(false);
  });

  it("keeps distinct milestone title with phase suffix", () => {
    const project = baseProject({
      milestones: [
        {
          id: "m2",
          projectId: "p1",
          title: "Gate review",
          date: "2026-11-22",
          order: 0,
          phaseId: "ph1",
          color: "#64748b",
          createdAt: "2026-11-09T00:00:00.000Z",
        },
      ],
    });
    const snap = computeProjectSteering(project, [], new Date("2026-11-09T12:00:00"));
    expect(snap.upcomingMilestones.map((m) => m.label)).toContain("Gate review (Scoping)");
    expect(snap.upcomingMilestones.some((m) => m.id === "phase:ph1")).toBe(false);
  });

  it("keeps phase end when no covering milestone", () => {
    const project = baseProject({ milestones: [] });
    const snap = computeProjectSteering(project, [], new Date("2026-11-09T12:00:00"));
    expect(snap.upcomingMilestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "phase:ph1", label: "Scoping", source: "phase" }),
      ]),
    );
  });
});

describe("computeProjectSteering health smoke", () => {
  it("marks undated when majority of active roots lack due dates", () => {
    const todos: Todo[] = [
      {
        id: "t1",
        title: "A",
        status: "active",
        projectId: "p1",
        priority: "medium",
        createdAt: "2026-11-09T00:00:00.000Z",
        updatedAt: "2026-11-09T00:00:00.000Z",
      } as Todo,
      {
        id: "t2",
        title: "B",
        status: "active",
        projectId: "p1",
        priority: "medium",
        createdAt: "2026-11-09T00:00:00.000Z",
        updatedAt: "2026-11-09T00:00:00.000Z",
      } as Todo,
    ];
    const snap = computeProjectSteering(baseProject({ milestones: [], phases: [] }), todos);
    expect(snap.health).toBe("undated");
  });
});
