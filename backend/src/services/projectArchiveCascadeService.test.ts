import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "./projectService";

const listChildProjects = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());
const archiveTodosByProjectId = vi.hoisted(() => vi.fn().mockResolvedValue(0));

vi.mock("./projectService", () => ({
  listChildProjects,
  updateProject,
}));

vi.mock("./todoService", () => ({
  archiveTodosByProjectId,
}));

describe("projectArchiveCascadeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cascadeArchiveActiveSubprojects archives only active direct children and their todos", async () => {
    const { cascadeArchiveActiveSubprojects } = await import("./projectArchiveCascadeService");
    const active = { id: "c-active", status: "active" } as Project;
    const alreadyArchived = { id: "c-done", status: "archived" } as Project;
    listChildProjects.mockReturnValue([active, alreadyArchived]);

    await cascadeArchiveActiveSubprojects("uid-1", "a@b.co", "parent-1");

    expect(listChildProjects).toHaveBeenCalledWith("parent-1");
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(updateProject).toHaveBeenCalledWith("uid-1", "a@b.co", "c-active", { status: "archived" });
    expect(archiveTodosByProjectId).toHaveBeenCalledTimes(1);
    expect(archiveTodosByProjectId).toHaveBeenCalledWith("c-active");
  });

  it("cascadeRestoreArchivedSubprojects reactivates only archived direct children", async () => {
    const { cascadeRestoreArchivedSubprojects } = await import("./projectArchiveCascadeService");
    const archived = { id: "x1", status: "archived" } as Project;
    const active = { id: "x2", status: "active" } as Project;
    listChildProjects.mockReturnValue([archived, active]);

    cascadeRestoreArchivedSubprojects("uid-1", "a@b.co", "parent-1");

    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(updateProject).toHaveBeenCalledWith("uid-1", "a@b.co", "x1", { status: "active" });
  });
});
