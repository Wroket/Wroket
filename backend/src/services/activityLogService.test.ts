import { afterEach, describe, expect, it, vi } from "vitest";

const scheduleSave = vi.fn();

vi.mock("../persistence", () => ({
  getStore: () => ({}),
  scheduleSave,
}));

describe("activityLogService legacy flush", () => {
  afterEach(() => {
    scheduleSave.mockClear();
    delete process.env.USE_LOCAL_STORE;
    delete process.env.GOOGLE_CLOUD_PROJECT;
  });

  it("does not schedule store/activityLog flush in Firestore prod mode", async () => {
    process.env.USE_LOCAL_STORE = "false";
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    vi.resetModules();
    const { logActivity } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "todo_created", "todo", "t1");
    expect(scheduleSave).not.toHaveBeenCalled();
  });

  it("schedules store/activityLog flush in local store mode", async () => {
    process.env.USE_LOCAL_STORE = "true";
    vi.resetModules();
    const { logActivity } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "todo_created", "todo", "t1");
    expect(scheduleSave).toHaveBeenCalledWith("activityLog");
  });
});

describe("activityLogService update throttle", () => {
  afterEach(() => {
    delete process.env.USE_LOCAL_STORE;
    delete process.env.ACTIVITY_LOG_THROTTLE_MS;
  });

  it("collapses identical consecutive updates within the window", async () => {
    process.env.USE_LOCAL_STORE = "true";
    vi.resetModules();
    const { logActivity, getActivityLog } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "update", "note", "n1", { fields: ["content"] });
    logActivity("u1", "a@test.com", "update", "note", "n1", { fields: ["content"] });
    logActivity("u1", "a@test.com", "update", "note", "n1", { fields: ["content"] });
    const { entries } = await getActivityLog({ entityId: "n1" });
    expect(entries).toHaveLength(1);
  });

  it("keeps updates that touch different fields", async () => {
    process.env.USE_LOCAL_STORE = "true";
    vi.resetModules();
    const { logActivity, getActivityLog } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "update", "note", "n1", { fields: ["content"] });
    logActivity("u1", "a@test.com", "update", "note", "n1", { fields: ["title"] });
    const { entries } = await getActivityLog({ entityId: "n1" });
    expect(entries).toHaveLength(2);
  });

  it("never throttles create/delete", async () => {
    process.env.USE_LOCAL_STORE = "true";
    vi.resetModules();
    const { logActivity, getActivityLog } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "create", "note", "n2", { title: "x" });
    logActivity("u1", "a@test.com", "create", "note", "n2", { title: "x" });
    const { entries } = await getActivityLog({ entityId: "n2" });
    expect(entries).toHaveLength(2);
  });

  it("disables throttle when ACTIVITY_LOG_THROTTLE_MS=0", async () => {
    process.env.USE_LOCAL_STORE = "true";
    process.env.ACTIVITY_LOG_THROTTLE_MS = "0";
    vi.resetModules();
    const { logActivity, getActivityLog } = await import("./activityLogService");
    logActivity("u1", "a@test.com", "update", "note", "n3", { fields: ["content"] });
    logActivity("u1", "a@test.com", "update", "note", "n3", { fields: ["content"] });
    const { entries } = await getActivityLog({ entityId: "n3" });
    expect(entries).toHaveLength(2);
  });
});
