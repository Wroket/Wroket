import { describe, expect, it, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockDoc = vi.fn((id: string) => ({ id, delete: mockDelete, ref: { delete: mockDelete } }));
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = vi.fn(() => ({
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));
const mockWhereGet = vi.fn();
const mockWhere = vi.fn(() => ({ get: mockWhereGet }));
const mockCollection = vi.fn(() => ({
  where: mockWhere,
  doc: mockDoc,
}));
const mockRunTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
  const tx = {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
    set: vi.fn(),
  };
  await fn(tx);
});

vi.mock("@google-cloud/firestore", () => ({
  Firestore: class MockFirestore {
    collection = mockCollection;
    batch = mockBatch;
    runTransaction = mockRunTransaction;
  },
}));

describe("todos_v2 zero-loss invariants", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockDelete.mockReset();
    mockDoc.mockClear();
    mockBatchDelete.mockReset();
    mockBatchCommit.mockClear();
    mockBatch.mockClear();
    mockWhereGet.mockReset();
    mockWhere.mockClear();
    mockCollection.mockClear();
    mockRunTransaction.mockClear();
    process.env.USE_LOCAL_STORE = "false";
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.TODOS_STORAGE_MODE = "v2";
  });

  it("syncOwnerTodosV2 upserts only — never deletes docs absent from partial RAM", async () => {
    mockWhereGet.mockResolvedValue({
      docs: [
        { id: "keep-in-fs-only", ref: { delete: mockDelete }, data: () => ({ ownerUid: "u1" }) },
        { id: "in-ram", ref: { delete: mockDelete }, data: () => ({ ownerUid: "u1" }) },
      ],
    });

    const { syncOwnerTodosV2 } = await import("./todoDocStore");
    await syncOwnerTodosV2("u1", [
      {
        id: "in-ram",
        ownerUid: "u1",
        updatedAt: "2026-11-14T12:00:00.000Z",
        title: "Partial snapshot",
      },
    ]);

    expect(mockRunTransaction).toHaveBeenCalled();
    expect(mockWhere).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
  });

  it("deleteTodosV2ByIds deletes only explicit ids and logs reason", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { deleteTodosV2ByIds } = await import("./todoDocStore");
    const n = await deleteTodosV2ByIds(["a", "b", "a"], "explicit_ids");
    expect(n).toBe(2);
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"todos_v2.delete"'),
    );
    logSpy.mockRestore();
  });
});
