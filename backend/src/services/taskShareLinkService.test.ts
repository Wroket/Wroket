import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import { register } from "./authService";
import { createTodo } from "./todoService";
import {
  createTaskShareLink,
  getSharedTaskView,
  purgeTaskShareLinksForOwner,
  reloadTaskShareLinksFromStore,
  revokeTaskShareLink,
} from "./taskShareLinkService";

describe("taskShareLinkService", () => {
  beforeEach(() => {
    getStore().taskShareLinks = {};
    reloadTaskShareLinksFromStore();
  });

  it("create resolve revoke", async () => {
    const user = register({
      email: `task-share-${Date.now()}@test.local`,
      password: "password123",
    });
    const todo = await createTodo(user.uid, user.email, {
      title: "Shared task",
      priority: "high",
      tags: ["alpha"],
    });

    const link = await createTaskShareLink(user.uid, user.email, todo.id, { expiryDays: 7 });
    expect(link.token).toBeTruthy();

    const view = await getSharedTaskView(link.token);
    expect(view.title).toBe("Shared task");
    expect(view.tags).toEqual(["alpha"]);
    expect(view.summary).toContain("alpha");

    await revokeTaskShareLink(user.uid, user.email, todo.id, link.id);
    await expect(getSharedTaskView(link.token)).rejects.toThrow();

    expect(purgeTaskShareLinksForOwner(user.uid)).toBeGreaterThanOrEqual(1);
  });
});
