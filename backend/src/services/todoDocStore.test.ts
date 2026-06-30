import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGet = vi.fn();
const mockWhere = vi.fn(() => ({ get: mockGet }));
const mockCollection = vi.fn(() => ({ where: mockWhere }));

vi.mock("@google-cloud/firestore", () => ({
  Firestore: class MockFirestore {
    collection = mockCollection;
  },
}));

describe("todoDocStore queries", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGet.mockReset();
    mockWhere.mockClear();
    mockCollection.mockClear();
    process.env.USE_LOCAL_STORE = "false";
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    delete process.env.TODOS_DOC_COLLECTION;
  });

  it("listTodosV2ByAssignedTo queries assignedTo field", async () => {
    mockGet.mockResolvedValue({
      docs: [{
        id: "t-1",
        data: () => ({
          ownerUid: "owner-a",
          assignedTo: "assignee-b",
          title: "Task",
          status: "active",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }),
      }],
    });

    const { listTodosV2ByAssignedTo } = await import("./todoDocStore");
    const rows = await listTodosV2ByAssignedTo("assignee-b");

    expect(mockCollection).toHaveBeenCalledWith("todos_v2");
    expect(mockWhere).toHaveBeenCalledWith("assignedTo", "==", "assignee-b");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("t-1");
    expect(rows[0].ownerUid).toBe("owner-a");
  });

  it("listTodosV2ByProject queries projectId field", async () => {
    mockGet.mockResolvedValue({
      docs: [{
        id: "t-2",
        data: () => ({
          ownerUid: "owner-a",
          projectId: "proj-1",
          title: "In project",
          status: "active",
          updatedAt: "2026-06-01T00:00:00.000Z",
        }),
      }],
    });

    const { listTodosV2ByProject } = await import("./todoDocStore");
    const rows = await listTodosV2ByProject("proj-1");

    expect(mockWhere).toHaveBeenCalledWith("projectId", "==", "proj-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe("proj-1");
  });
});
