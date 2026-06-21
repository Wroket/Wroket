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
