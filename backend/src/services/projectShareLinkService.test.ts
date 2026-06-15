import { describe, expect, test } from "vitest";

import { getStore } from "../persistence";
import {
  createProjectShareLink,
  getSharedProjectView,
  reloadShareLinksFromStore,
  revokeProjectShareLink,
} from "./projectShareLinkService";
import { createProject } from "./projectService";
import { createTodo } from "./todoService";

describe("projectShareLinkService", () => {
  test("create and resolve public view", async () => {
    reloadShareLinksFromStore();
    const project = createProject("owner-1", "owner@test.fr", { name: "Client Alpha" });
    await createTodo("owner-1", "owner@test.fr", {
      title: "Task visible",
      priority: "medium",
      projectId: project.id,
    });

    const link = createProjectShareLink("owner-1", "owner@test.fr", project.id, { expiryDays: 7 });
    expect(link.token).toBeTruthy();

    const view = getSharedProjectView(link.token);
    expect(view.projectName).toBe("Client Alpha");
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0].title).toBe("Task visible");
    expect(view.steering.activeCount).toBe(1);
  });

  test("revoked link returns not found", async () => {
    reloadShareLinksFromStore();
    const project = createProject("owner-2", "o2@test.fr", { name: "Revoke test" });
    const link = createProjectShareLink("owner-2", "o2@test.fr", project.id);
    revokeProjectShareLink("owner-2", "o2@test.fr", project.id, link.id);
    expect(() => getSharedProjectView(link.token)).toThrow();
  });

  test("link stores and exposes selected tabs only", async () => {
    reloadShareLinksFromStore();
    const project = createProject("owner-3", "o3@test.fr", { name: "Tabs test" });

    const link = createProjectShareLink("owner-3", "o3@test.fr", project.id, {
      tabs: ["kanban", "gantt"],
    });
    expect(link.allowedTabs).toEqual(["kanban", "gantt"]);

    const view = getSharedProjectView(link.token);
    expect(view.allowedTabs).toEqual(["kanban", "gantt"]);
  });

  test("legacy link without allowedTabs exposes all tabs", async () => {
    reloadShareLinksFromStore();
    const project = createProject("owner-4", "o4@test.fr", { name: "Legacy tabs" });
    const link = createProjectShareLink("owner-4", "o4@test.fr", project.id);
    const stored = getStore().projectShareLinks?.[link.token] as Record<string, unknown>;
    delete stored.allowedTabs;
    reloadShareLinksFromStore();

    const view = getSharedProjectView(link.token);
    expect(view.allowedTabs).toEqual(["pilotage", "kanban", "gantt"]);
  });
});
