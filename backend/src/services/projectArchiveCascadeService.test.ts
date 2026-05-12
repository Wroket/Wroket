import fs from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// persistence.ts reads USE_LOCAL at module load — must be set before importing project/todo services.
vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-proj-cascade-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import type { Project } from "./projectService";
import * as projectService from "./projectService";
import * as todoService from "./todoService";
import * as calendarBookingCleanup from "./calendarBookingCleanup";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

describe("projectArchiveCascadeService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("cascadeArchiveActiveSubprojects archives only active direct children and their todos", async () => {
    const { cascadeArchiveActiveSubprojects } = await import("./projectArchiveCascadeService");
    const active = { id: "c-active", status: "active" } as Project;
    const alreadyArchived = { id: "c-done", status: "archived" } as Project;
    vi.spyOn(projectService, "listChildProjects").mockReturnValue([active, alreadyArchived]);
    vi.spyOn(projectService, "updateProject").mockReturnValue(active as Project);
    const archiveSpy = vi.spyOn(todoService, "archiveTodosByProjectId").mockResolvedValue(0);

    await cascadeArchiveActiveSubprojects("uid-1", "a@b.co", "parent-1");

    expect(projectService.listChildProjects).toHaveBeenCalledWith("parent-1");
    expect(projectService.updateProject).toHaveBeenCalledTimes(1);
    expect(projectService.updateProject).toHaveBeenCalledWith("uid-1", "a@b.co", "c-active", { status: "archived" });
    expect(archiveSpy).toHaveBeenCalledTimes(1);
    expect(archiveSpy).toHaveBeenCalledWith("c-active");
  });

  it("cascadeRestoreArchivedSubprojects reactivates only archived direct children", async () => {
    const { cascadeRestoreArchivedSubprojects } = await import("./projectArchiveCascadeService");
    const archived = { id: "x1", status: "archived" } as Project;
    const active = { id: "x2", status: "active" } as Project;
    vi.spyOn(projectService, "listChildProjects").mockReturnValue([archived, active]);
    const updateSpy = vi.spyOn(projectService, "updateProject").mockReturnValue(archived as Project);

    cascadeRestoreArchivedSubprojects("uid-1", "a@b.co", "parent-1");

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith("uid-1", "a@b.co", "x1", { status: "active" });
  });
});

describe("project archive / purge → external calendar cleanup", () => {
  let scheduleSpy: Mock<(todos: import("./todoService").Todo[]) => void>;

  beforeAll(async () => {
    const persistence = await import("../persistence");
    await persistence.initStore();
  });

  beforeEach(() => {
    // Clear spies from sibling describe (e.g. archiveTodosByProjectId mock) so real archive runs here.
    vi.restoreAllMocks();
    scheduleSpy = vi
      .spyOn(calendarBookingCleanup, "scheduleExternalCleanupForFutureSlots")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    scheduleSpy.mockRestore();
  });

  afterAll(() => {
    try {
      if (process.env.UPLOAD_DIR) fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("archiveTodosByProjectId calls cleanup with snapshots of active todos (future linked slots)", async () => {
    const u = uid("owner");
    const email = "owner@example.com";
    const proj = projectService.createProject(u, email, { name: "P-archive-cal" });
    const future = new Date(Date.now() + 3_600_000).toISOString();

    await todoService.createTodo(u, email, {
      title: "Active booked",
      priority: "medium",
      projectId: proj.id,
      scheduledSlot: {
        start: future,
        end: future,
        calendarEventId: "ev-archive-1",
        bookingProvider: "google",
        bookingCalendarId: "primary",
      },
    });

    await todoService.archiveTodosByProjectId(proj.id);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const passed = scheduleSpy.mock.calls[0][0];
    expect(passed).toHaveLength(1);
    expect(passed[0].scheduledSlot?.calendarEventId).toBe("ev-archive-1");
    expect(passed[0].status).toBe("active");
  });

  it("permanentlyPurgeTodosByProjectId calls cleanup before purge (all project todos)", async () => {
    const u = uid("owner2");
    const email = "o2@example.com";
    const proj = projectService.createProject(u, email, { name: "P-purge-cal" });
    const future = new Date(Date.now() + 3_600_000).toISOString();

    await todoService.createTodo(u, email, {
      title: "Booked",
      priority: "medium",
      projectId: proj.id,
      status: "completed",
      scheduledSlot: {
        start: future,
        end: future,
        calendarEventId: "ev-purge-1",
        bookingProvider: "google",
      },
    });

    await todoService.permanentlyPurgeTodosByProjectId(proj.id);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const passed = scheduleSpy.mock.calls[0][0];
    expect(passed).toHaveLength(1);
    expect(passed[0].scheduledSlot?.calendarEventId).toBe("ev-purge-1");
  });

  it("cascadeArchiveActiveSubprojects runs archiveTodosByProjectId which schedules cleanup for child tasks", async () => {
    const u = uid("cascade-u");
    const email = "cascade@example.com";
    const parent = projectService.createProject(u, email, { name: "Parent" });
    const child = projectService.createProject(u, email, {
      name: "Child",
      parentProjectId: parent.id,
    });
    const future = new Date(Date.now() + 3_600_000).toISOString();

    await todoService.createTodo(u, email, {
      title: "On child",
      priority: "medium",
      projectId: child.id,
      scheduledSlot: {
        start: future,
        end: future,
        calendarEventId: "ev-child-1",
        bookingProvider: "microsoft",
        bookingAccountId: "ms-acc",
        bookingCalendarId: "cal-1",
      },
    });

    const { cascadeArchiveActiveSubprojects } = await import("./projectArchiveCascadeService");
    await cascadeArchiveActiveSubprojects(u, email, parent.id);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const arg = scheduleSpy.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].id).toBeTruthy();
    expect(arg[0].projectId).toBe(child.id);
    expect(arg[0].scheduledSlot?.calendarEventId).toBe("ev-child-1");
  });
});
