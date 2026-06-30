import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-move-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import * as projectService from "./projectService";
import { createTodo, moveTodo, _resetTodosForTests } from "./todoService";
import { UnprocessableEntityError } from "../utils/errors";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

describe("moveTodo", () => {
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

  it("returns 422 TASK_PHASE_DATE_MISMATCH on default strategy when dates exceed phase", async () => {
    const userId = uid("owner");
    const projectId = "proj-1";
    const phaseA = "ph-a";
    const phaseB = "ph-b";

    vi.spyOn(projectService, "findPhaseById").mockImplementation((id: string) => {
      if (id === phaseA) {
        return {
          id: phaseA,
          projectId,
          name: "A",
          color: "#000",
          order: 0,
          startDate: "2027-06-01",
          endDate: "2027-06-30",
          createdAt: "",
        };
      }
      if (id === phaseB) {
        return {
          id: phaseB,
          projectId,
          name: "B",
          color: "#111",
          order: 1,
          startDate: "2027-07-01",
          endDate: "2027-07-31",
          createdAt: "",
        };
      }
      return null;
    });

    vi.spyOn(projectService, "getProjectById").mockReturnValue({
      id: projectId,
      ownerUid: userId,
      name: "P",
      status: "active",
    } as ReturnType<typeof projectService.getProjectById>);

    vi.spyOn(projectService, "canEditProjectContent").mockReturnValue(true);

    const todo = await createTodo(userId, "u@test.com", {
      title: "Task",
      priority: "medium",
      projectId,
      phaseId: phaseA,
      deadline: "2027-06-20",
    });

    await expect(
      moveTodo(userId, "u@test.com", todo.id, { phaseId: phaseB, strategy: "default" }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "TASK_PHASE_DATE_MISMATCH",
    });
  });

  it("clamps dates with clampDatesToPhase strategy", async () => {
    const userId = uid("owner2");
    const projectId = "proj-2";
    const phaseA = "ph-a2";
    const phaseB = "ph-b2";

    vi.spyOn(projectService, "findPhaseById").mockImplementation((id: string) => {
      if (id === phaseA) {
        return {
          id: phaseA,
          projectId,
          name: "A",
          color: "#000",
          order: 0,
          startDate: "2027-06-01",
          endDate: "2027-06-30",
          createdAt: "",
        };
      }
      if (id === phaseB) {
        return {
          id: phaseB,
          projectId,
          name: "B",
          color: "#111",
          order: 1,
          startDate: "2027-07-01",
          endDate: "2027-07-31",
          createdAt: "",
        };
      }
      return null;
    });

    vi.spyOn(projectService, "getProjectById").mockReturnValue({
      id: projectId,
      ownerUid: userId,
      name: "P",
      status: "active",
    } as ReturnType<typeof projectService.getProjectById>);

    vi.spyOn(projectService, "canEditProjectContent").mockReturnValue(true);

    const todo = await createTodo(userId, "u2@test.com", {
      title: "Task2",
      priority: "medium",
      projectId,
      phaseId: phaseA,
      deadline: "2027-06-20",
    });

    const moved = await moveTodo(userId, "u2@test.com", todo.id, {
      phaseId: phaseB,
      strategy: "clampDatesToPhase",
    });

    expect(moved.phaseId).toBe(phaseB);
    expect(moved.deadline).toBe("2027-07-01");
  });

  it("returns 422 TASK_PHASE_SLOT_MISMATCH when slot outside target phase", async () => {
    const userId = uid("owner3");
    const projectId = "proj-3";
    const phaseA = "ph-a3";
    const phaseB = "ph-b3";

    vi.spyOn(projectService, "findPhaseById").mockImplementation((id: string) => {
      if (id === phaseA) {
        return {
          id: phaseA,
          projectId,
          name: "A",
          color: "#000",
          order: 0,
          startDate: "2027-06-01",
          endDate: "2027-06-30",
          createdAt: "",
        };
      }
      if (id === phaseB) {
        return {
          id: phaseB,
          projectId,
          name: "B",
          color: "#111",
          order: 1,
          startDate: "2027-08-01",
          endDate: "2027-08-31",
          createdAt: "",
        };
      }
      return null;
    });

    vi.spyOn(projectService, "getProjectById").mockReturnValue({
      id: projectId,
      ownerUid: userId,
      name: "P",
      status: "active",
    } as ReturnType<typeof projectService.getProjectById>);

    vi.spyOn(projectService, "canEditProjectContent").mockReturnValue(true);

    const todo = await createTodo(userId, "u3@test.com", {
      title: "Task3",
      priority: "medium",
      projectId,
      phaseId: phaseA,
      deadline: "2027-06-15",
      scheduledSlot: {
        start: "2027-06-15T10:00:00.000Z",
        end: "2027-06-15T11:00:00.000Z",
        calendarEventId: null,
      },
    });

    await expect(
      moveTodo(userId, "u3@test.com", todo.id, { phaseId: phaseB, strategy: "default" }),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);

    const moved = await moveTodo(userId, "u3@test.com", todo.id, {
      phaseId: phaseB,
      strategy: "clearScheduledSlot",
      deadline: "2027-08-15",
    });

    expect(moved.phaseId).toBe(phaseB);
    expect(moved.scheduledSlot).toBeNull();
  });
});
