import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-slot-phase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import * as projectService from "./projectService";
import { assertScheduledSlotWithinPhaseBounds, createTodo, updateTodo } from "./todoService";
import { ValidationError } from "../utils/errors";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

describe("assertScheduledSlotWithinPhaseBounds", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops when phaseId is null", () => {
    expect(() => assertScheduledSlotWithinPhaseBounds(null, "2025-06-15T10:00:00.000Z", "2025-06-15T11:00:00.000Z")).not.toThrow();
  });

  it("allows slot fully inside phase (UTC days)", () => {
    vi.spyOn(projectService, "findPhaseById").mockReturnValue({
      id: "ph1",
      projectId: "p1",
      name: "Phase",
      color: "#000",
      order: 0,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      createdAt: "",
    });
    expect(() =>
      assertScheduledSlotWithinPhaseBounds("ph1", "2025-06-15T10:00:00.000Z", "2025-06-15T11:00:00.000Z"),
    ).not.toThrow();
  });

  it("rejects slot starting before phase start", () => {
    vi.spyOn(projectService, "findPhaseById").mockReturnValue({
      id: "ph1",
      projectId: "p1",
      name: "Phase",
      color: "#000",
      order: 0,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      createdAt: "",
    });
    expect(() =>
      assertScheduledSlotWithinPhaseBounds("ph1", "2025-05-31T22:00:00.000Z", "2025-06-01T02:00:00.000Z"),
    ).toThrow(ValidationError);
  });

  it("rejects slot whose last occupied UTC day is after phase end", () => {
    vi.spyOn(projectService, "findPhaseById").mockReturnValue({
      id: "ph1",
      projectId: "p1",
      name: "Phase",
      color: "#000",
      order: 0,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      createdAt: "",
    });
    expect(() =>
      assertScheduledSlotWithinPhaseBounds("ph1", "2025-06-30T22:00:00.000Z", "2025-07-01T02:00:00.000Z"),
    ).toThrow(ValidationError);
  });
});

describe("createTodo / updateTodo scheduledSlot vs phase", () => {
  beforeAll(async () => {
    const persistence = await import("../persistence");
    await persistence.initStore();
  });

  afterAll(async () => {
    try {
      const f = await import("node:fs");
      if (process.env.UPLOAD_DIR) f.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("createTodo rejects scheduledSlot outside phase", async () => {
    const u = uid("owner-slot");
    const email = "slot-owner@example.com";
    const proj = projectService.createProject(u, email, { name: "P-slot-phase" });
    const phase = projectService.addPhase(proj.id, {
      name: "Juin",
      startDate: "2030-06-01",
      endDate: "2030-06-30",
    });
    const futureInside = "2030-06-15T10:00:00.000Z";
    const futureEnd = "2030-06-15T11:00:00.000Z";
    await expect(
      createTodo(u, email, {
        title: "Out of phase slot",
        priority: "medium",
        projectId: proj.id,
        phaseId: phase.id,
        deadline: "2030-06-15",
        scheduledSlot: { start: "2030-07-01T10:00:00.000Z", end: "2030-07-01T11:00:00.000Z", calendarEventId: null },
      }),
    ).rejects.toThrow(ValidationError);

    const todo = await createTodo(u, email, {
      title: "In phase",
      priority: "medium",
      projectId: proj.id,
      phaseId: phase.id,
      deadline: "2030-06-15",
      scheduledSlot: { start: futureInside, end: futureEnd, calendarEventId: null },
    });
    expect(todo.scheduledSlot?.start).toBe(futureInside);
  });

  it("updateTodo rejects moving scheduledSlot outside phase", async () => {
    const u = uid("owner-slot2");
    const email = "slot2@example.com";
    const proj = projectService.createProject(u, email, { name: "P-slot-phase-2" });
    const phase = projectService.addPhase(proj.id, {
      name: "Juin",
      startDate: "2030-06-01",
      endDate: "2030-06-30",
    });
    const todo = await createTodo(u, email, {
      title: "Move me",
      priority: "medium",
      projectId: proj.id,
      phaseId: phase.id,
      deadline: "2030-06-15",
      scheduledSlot: {
        start: "2030-06-10T10:00:00.000Z",
        end: "2030-06-10T11:00:00.000Z",
        calendarEventId: null,
      },
    });

    await expect(
      updateTodo(u, email, todo.id, {
        scheduledSlot: {
          start: "2030-07-05T10:00:00.000Z",
          end: "2030-07-05T11:00:00.000Z",
          calendarEventId: null,
        },
      }),
    ).rejects.toThrow(ValidationError);
  });
});
