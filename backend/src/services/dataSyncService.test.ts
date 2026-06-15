import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import {
  applyDataSyncDiff,
  computeDataSyncDiff,
} from "./dataSyncService";
import {
  listDatabaseRows,
  updateDatabaseRow,
  updateUserDatabase,
} from "./userDatabaseService";
import type { DataSyncSnapshot } from "./notionApiService";

const UID = "user-data-sync-test";

function makeSnapshot(
  rows: DataSyncSnapshot["rows"],
  databaseId = "db-data-1",
  columns = [{ id: "col-name", name: "Name", type: "text" as const, externalKey: "notion-prop:name" }],
): DataSyncSnapshot {
  return {
    provider: "notion",
    connectionId: "conn-1",
    sourceDatabaseId: databaseId,
    sourceLabel: "Inventory",
    columns,
    rows,
  };
}

beforeEach(() => {
  const store = getStore();
  store.userDatabases = {};
  store.userDatabaseRows = {};
});

describe("dataSyncService", () => {
  it("creates database and rows on first apply", () => {
    const snapshot = makeSnapshot([
      { externalId: "page-1", values: { "col-name": "Widget A" } },
      { externalId: "page-2", values: { "col-name": "Widget B" } },
    ]);
    const result = applyDataSyncDiff(UID, snapshot);
    expect(result.databaseCreated).toBe(true);
    expect(result.rowsCreated).toBe(2);
    expect(result.rowsUpdated).toBe(0);
    expect(result.rowsPreserved).toBe(0);
    expect(result.database.name).toBe("Inventory");
  });

  it("is idempotent on re-sync", () => {
    const snapshot = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A" } }]);
    applyDataSyncDiff(UID, snapshot);
    const second = applyDataSyncDiff(UID, snapshot);
    expect(second.rowsCreated).toBe(0);
    expect(second.rowsUpdated).toBe(0);
    expect(second.rowsPreserved).toBe(1);
    const diff = computeDataSyncDiff(UID, snapshot);
    expect(diff.summary.creates).toBe(0);
    expect(diff.summary.preserved).toBe(0);
    expect(diff.rows.unchanged).toBe(1);
  });

  it("marks diverging existing rows as preserved (never applied)", () => {
    const snapshot = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A" } }]);
    applyDataSyncDiff(UID, snapshot);
    const updated = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A+" } }]);
    const diff = computeDataSyncDiff(UID, updated);
    expect(diff.summary.preserved).toBe(1);
    expect(diff.rows.preserved[0]?.changedFields).toContain("Name");
  });

  it("never overwrites a locally edited row on re-sync (additive model)", () => {
    const first = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A" } }]);
    const applied = applyDataSyncDiff(UID, first);
    const dbId = applied.databaseId;

    const row = listDatabaseRows(UID, dbId)[0];
    updateDatabaseRow(UID, dbId, row.id, { "col-name": "Local edit" });

    const reSync = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Notion changed" } }]);
    const result = applyDataSyncDiff(UID, reSync);

    expect(result.rowsCreated).toBe(0);
    expect(result.rowsUpdated).toBe(0);
    expect(result.rowsPreserved).toBe(1);
    expect(listDatabaseRows(UID, dbId)[0].values["col-name"]).toBe("Local edit");
  });

  it("adds new Notion rows on re-sync while keeping existing ones untouched", () => {
    const first = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A" } }]);
    const applied = applyDataSyncDiff(UID, first);
    const dbId = applied.databaseId;
    updateDatabaseRow(UID, dbId, listDatabaseRows(UID, dbId)[0].id, { "col-name": "Local edit" });

    const reSync = makeSnapshot([
      { externalId: "page-1", values: { "col-name": "Notion changed" } },
      { externalId: "page-2", values: { "col-name": "Widget B" } },
    ]);
    const result = applyDataSyncDiff(UID, reSync);

    expect(result.rowsCreated).toBe(1);
    expect(result.rowsPreserved).toBe(1);
    const labels = listDatabaseRows(UID, dbId).map((r) => r.values["col-name"]);
    expect(labels).toContain("Local edit");
    expect(labels).toContain("Widget B");
    expect(labels).not.toContain("Notion changed");
  });

  it("preserves local database name and renamed columns on re-sync", () => {
    const first = makeSnapshot([{ externalId: "page-1", values: { "col-name": "Widget A" } }]);
    const applied = applyDataSyncDiff(UID, first);
    const dbId = applied.databaseId;

    updateUserDatabase(UID, dbId, {
      name: "Mon inventaire",
      columns: applied.database.columns.map((c) =>
        c.externalKey === "notion-prop:name" ? { ...c, name: "Produit" } : c,
      ),
    });

    const reSync = makeSnapshot([
      { externalId: "page-1", values: { "col-name": "Widget A" } },
      { externalId: "page-2", values: { "col-name": "Widget B" } },
    ]);
    const result = applyDataSyncDiff(UID, reSync);

    expect(result.database.name).toBe("Mon inventaire");
    expect(result.database.columns.find((c) => c.externalKey === "notion-prop:name")?.name).toBe("Produit");
  });
});
