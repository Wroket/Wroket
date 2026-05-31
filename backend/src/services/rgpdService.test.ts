import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
  process.env.TODOS_STORAGE_MODE = "v2";
});

vi.mock("./todoDocStore", () => ({
  deleteAllTodosV2ForOwner: vi.fn().mockResolvedValue(0),
}));

vi.mock("./attachmentService", () => ({
  purgeAttachmentsForTodoIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./stripeBillingService", () => ({
  cancelStripeSubscriptionsById: vi.fn().mockResolvedValue(undefined),
}));

import { getStore, initStore } from "../persistence";
import { deleteUserData } from "./rgpdService";
import { register, findUserByUid, purgeAuthRuntimeForUid } from "./authService";
import { purgeTodoRuntimeForUid, listTodoIdsForOwner } from "./todoService";
import { purgeNotesRuntimeForUid } from "./noteService";
import { deleteAllTodosV2ForOwner } from "./todoDocStore";
import { cancelStripeSubscriptionsById } from "./stripeBillingService";

describe("deleteUserData", () => {
  beforeAll(async () => {
    await initStore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    const persistence = await import("../persistence");
    await persistence.flushNow();
  });

  it("removes user from store and purges runtime caches", async () => {
    const { uid } = register({ email: "rgpd-delete@test.local", password: "password123" });
    const store = getStore();
    const users = store.users as Record<string, Record<string, unknown>>;
    users[uid] = { ...users[uid], stripeSubscriptionId: "sub_test_123" };

    const purgeTodoSpy = vi.spyOn(await import("./todoService"), "purgeTodoRuntimeForUid");
    const purgeAuthSpy = vi.spyOn(await import("./authService"), "purgeAuthRuntimeForUid");

    await deleteUserData(uid);

    expect(users[uid]).toBeUndefined();
    expect(findUserByUid(uid)).toBeNull();
    expect(listTodoIdsForOwner(uid)).toEqual([]);
    expect(deleteAllTodosV2ForOwner).toHaveBeenCalledWith(uid);
    expect(cancelStripeSubscriptionsById).toHaveBeenCalledWith(uid, ["sub_test_123"]);
    expect(purgeTodoSpy).toHaveBeenCalledWith(uid);
    expect(purgeAuthSpy).toHaveBeenCalledWith(uid);

    purgeTodoSpy.mockRestore();
    purgeAuthSpy.mockRestore();
  });

  it("purgeAuthRuntimeForUid clears sessions for uid", () => {
    const { uid } = register({ email: "rgpd-session@test.local", password: "password123" });
    expect(findUserByUid(uid)).not.toBeNull();
    purgeAuthRuntimeForUid(uid);
    expect(findUserByUid(uid)).toBeNull();
  });

  it("purgeTodoRuntimeForUid removes todos from memory", () => {
    purgeTodoRuntimeForUid("orphan-uid");
    expect(listTodoIdsForOwner("orphan-uid")).toEqual([]);
    purgeNotesRuntimeForUid("orphan-uid");
  });
});
