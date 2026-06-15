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
import { exportUserData, deleteUserData } from "./rgpdService";
import { createUserDatabase, createDatabaseRow } from "./userDatabaseService";
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

describe("exportUserData", () => {
  beforeAll(async () => {
    await initStore();
  });

  it("includes user databases in export", () => {
    const { uid } = register({ email: "rgpd-export@test.local", password: "password123" });
    const db = createUserDatabase(uid, { name: "Export DB", columns: [{ id: "c1", name: "Nom", type: "text" }] });
    createDatabaseRow(uid, db.id, { c1: "Ligne 1" });
    const data = exportUserData(uid);
    expect(data.userDatabases).toHaveLength(1);
    expect((data.userDatabases[0] as { name: string }).name).toBe("Export DB");
    expect(Object.keys(data.userDatabaseRows)).toContain(db.id);
  });
});
