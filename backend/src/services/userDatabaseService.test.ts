import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import {
  createUserDatabase,
  createDatabaseRow,
  updateDatabaseRow,
  deleteDatabaseRow,
  deleteUserDatabase,
  listUserDatabases,
  listArchivedUserDatabases,
  restoreArchivedUserDatabase,
  permanentlyDeleteArchivedUserDatabase,
  listDatabaseRows,
  updateUserDatabase,
} from "./userDatabaseService";

const UID = "user-db-test";

beforeEach(() => {
  const store = getStore();
  store.userDatabases = {};
  store.userDatabaseRows = {};
  store.archivedUserDatabases = {};
  store.archivedUserDatabaseRows = {};
});

describe("userDatabaseService", () => {
  it("creates a database with columns", () => {
    const db = createUserDatabase(UID, {
      name: "Inventaire",
      columns: [
        { id: "c1", name: "Nom", type: "text" },
        { id: "c2", name: "Qté", type: "number" },
      ],
    });
    expect(db.name).toBe("Inventaire");
    expect(db.columns).toHaveLength(2);
    expect(listUserDatabases(UID)).toHaveLength(1);
  });

  it("creates and updates rows", () => {
    const db = createUserDatabase(UID, {
      name: "Test",
      columns: [{ id: "c1", name: "Label", type: "text" }],
    });
    const row = createDatabaseRow(UID, db.id, { c1: "Alpha" });
    expect(row.values.c1).toBe("Alpha");
    const updated = updateDatabaseRow(UID, db.id, row.id, { c1: "Beta" });
    expect(updated.values.c1).toBe("Beta");
    deleteDatabaseRow(UID, db.id, row.id);
    expect(createDatabaseRow(UID, db.id, { c1: "Gamma" }).values.c1).toBe("Gamma");
  });

  it("updates board view settings", () => {
    const db = createUserDatabase(UID, {
      name: "Board",
      columns: [{ id: "status", name: "Status", type: "select", options: ["A", "B"] }],
    });
    const updated = updateUserDatabase(UID, db.id, {
      defaultView: "board",
      boardGroupColumnId: "status",
    });
    expect(updated.defaultView).toBe("board");
    expect(updated.boardGroupColumnId).toBe("status");
  });

  it("appends new rows at the end", () => {
    const db = createUserDatabase(UID, {
      name: "Order",
      columns: [{ id: "c1", name: "Label", type: "text" }],
    });
    const first = createDatabaseRow(UID, db.id, { c1: "First" });
    const second = createDatabaseRow(UID, db.id, { c1: "Second" });
    const rows = listDatabaseRows(UID, db.id);
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("renames columns via update", () => {
    const db = createUserDatabase(UID, {
      name: "Cols",
      columns: [{ id: "c1", name: "Old", type: "text" }],
    });
    const updated = updateUserDatabase(UID, db.id, {
      columns: [{ id: "c1", name: "SIRET", type: "text" }],
    });
    expect(updated.columns[0]?.name).toBe("SIRET");
  });

  it("archives and restores a database with rows", () => {
    const db = createUserDatabase(UID, {
      name: "Archive me",
      columns: [{ id: "c1", name: "Label", type: "text" }],
    });
    const row = createDatabaseRow(UID, db.id, { c1: "Keep" });
    deleteUserDatabase(UID, db.id);
    expect(listUserDatabases(UID)).toHaveLength(0);
    expect(listArchivedUserDatabases(UID)).toHaveLength(1);
    const restored = restoreArchivedUserDatabase(UID, db.id);
    expect(restored.name).toBe("Archive me");
    expect(listDatabaseRows(UID, db.id)[0]?.id).toBe(row.id);
    deleteUserDatabase(UID, db.id);
    permanentlyDeleteArchivedUserDatabase(UID, db.id);
    expect(listArchivedUserDatabases(UID)).toHaveLength(0);
  });
});
