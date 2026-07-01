import { afterEach, describe, expect, it, vi } from "vitest";

const { logActivity } = vi.hoisted(() => ({ logActivity: vi.fn() }));
vi.mock("../services/activityLogService", () => ({ logActivity }));

vi.mock("../services/userDatabaseService", () => ({
  listUserDatabases: vi.fn(() => []),
  getUserDatabase: vi.fn(() => ({ id: "db1", name: "Budget" })),
  createUserDatabase: vi.fn(() => ({ id: "db1", name: "Budget" })),
  updateUserDatabase: vi.fn(() => ({ id: "db1", name: "Budget 2" })),
  deleteUserDatabase: vi.fn(),
  listDatabaseRows: vi.fn(() => []),
  createDatabaseRow: vi.fn(() => ({ id: "row1" })),
  updateDatabaseRow: vi.fn(() => ({ id: "row1" })),
  deleteDatabaseRow: vi.fn(),
  listArchivedUserDatabases: vi.fn(() => []),
  restoreArchivedUserDatabase: vi.fn(() => ({ id: "db1", name: "Budget" })),
  permanentlyDeleteArchivedUserDatabase: vi.fn(),
}));

vi.mock("../services/noteService", () => ({
  listNotes: vi.fn(() => []),
  listSharedNotes: vi.fn(() => []),
  listNotesByTodo: vi.fn(() => []),
  getTodoNoteMap: vi.fn(() => ({})),
  getNote: vi.fn(() => ({ id: "n1", title: "Ma note", content: "" })),
  createNote: vi.fn(() => ({ id: "n1", title: "Ma note" })),
  updateNote: vi.fn(() => ({ id: "n1", title: "Ma note" })),
  deleteNote: vi.fn(),
  listArchivedNotes: vi.fn(() => []),
  restoreArchivedNote: vi.fn(() => ({ id: "n1", title: "Ma note" })),
  permanentlyDeleteArchivedNote: vi.fn(),
  syncNotes: vi.fn(() => []),
  shareNoteWithUser: vi.fn(),
}));
vi.mock("../services/commentService", () => ({ newMentionsOnly: vi.fn(() => []) }));
vi.mock("../services/notificationService", () => ({ createNotification: vi.fn() }));
vi.mock("../services/authService", () => ({ findUserByEmail: vi.fn(() => null) }));
vi.mock("../services/noteFolderService", () => ({
  createNoteFolder: vi.fn(),
  listNoteFolderSummaries: vi.fn(() => []),
  removePersistedNoteFolderIfPresent: vi.fn(),
}));

import * as dbCtrl from "./userDatabaseController";
import * as noteCtrl from "./noteController";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRes(): any {
  const res: Record<string, unknown> = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(over: Record<string, unknown> = {}): any {
  return { user: { uid: "u1", email: "a@test.com" }, params: {}, body: {}, query: {}, ...over };
}

afterEach(() => logActivity.mockClear());

describe("userDatabaseController activity logging", () => {
  it("logs database create with name", () => {
    dbCtrl.create(req({ body: { name: "Budget" } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "create", "database", "db1", { name: "Budget" });
  });

  it("logs database update with changed fields", () => {
    dbCtrl.update(req({ params: { id: "db1" }, body: { name: "Budget 2" } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "update", "database", "db1", { name: "Budget 2", fields: ["name"] });
  });

  it("logs database delete", () => {
    dbCtrl.remove(req({ params: { id: "db1" } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "delete", "database", "db1");
  });

  it("logs row update with fields and databaseId", () => {
    dbCtrl.updateRow(req({ params: { id: "db1", rowId: "row1" }, body: { values: { amount: 10 } } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "update", "database_row", "row1", { databaseId: "db1", fields: ["amount"] });
  });
});

describe("noteController activity logging", () => {
  it("logs note create with title", async () => {
    await noteCtrl.create(req({ body: { title: "Ma note" } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "create", "note", "n1", { title: "Ma note" });
  });

  it("logs note update with changed fields", async () => {
    await noteCtrl.update(req({ params: { id: "n1" }, body: { title: "X", tags: ["a"] } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "update", "note", "n1", { title: "Ma note", fields: ["title", "tags"] });
  });

  it("logs note delete with title", async () => {
    await noteCtrl.remove(req({ params: { id: "n1" } }), mockRes());
    expect(logActivity).toHaveBeenCalledWith("u1", "a@test.com", "delete", "note", "n1", { title: "Ma note" });
  });
});
