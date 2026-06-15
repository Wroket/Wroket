/**
 * Notion generic database sync — diff preview and apply for user databases.
 */

import type { ExternalProvider } from "./externalRef";
import type { DataSyncSnapshot } from "./notionApiService";
import {
  findDatabaseByExternalId,
  findRowByExternalId,
  listDatabaseRows,
  listUserDatabases,
  upsertDatabaseRowFromSync,
  upsertUserDatabaseFromSync,
  remapSnapshotRowValues,
  type UserDatabase,
} from "./userDatabaseService";

export type DataSyncAction = "create" | "update" | "unchanged";

/** Row-level outcome under the additive sync model (existing rows are never overwritten). */
export type DataSyncRowAction = "create" | "preserved";

export interface DataSyncEntityChange {
  externalId: string;
  label: string;
  action: DataSyncRowAction;
  internalId?: string;
  /** For preserved rows: fields that differ in Notion but are kept as-is locally. */
  changedFields?: string[];
}

export interface DataSyncOrphan {
  internalId: string;
  label: string;
}

export interface DataSyncDiff {
  provider: ExternalProvider;
  database: {
    action: DataSyncAction;
    internalId: string | null;
    name: string;
    nameChanged: boolean;
  };
  rows: {
    create: DataSyncEntityChange[];
    /** Existing rows kept as-is. May differ from Notion (see changedFields) but are never overwritten. */
    preserved: DataSyncEntityChange[];
    unchanged: number;
    orphans: DataSyncOrphan[];
  };
  summary: { creates: number; preserved: number; orphans: number };
}

export interface ApplyDataSyncResult {
  databaseId: string;
  databaseCreated: boolean;
  rowsCreated: number;
  /** Always 0 under the additive model — kept for response compatibility. */
  rowsUpdated: number;
  /** Existing rows left untouched on re-sync. */
  rowsPreserved: number;
  orphans: number;
  database: UserDatabase;
}

function rowLabel(
  values: Record<string, string | number | boolean | null>,
  columns: { id: string; name: string }[],
): string {
  const titleCol = columns[0];
  if (titleCol) {
    const v = values[titleCol.id];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  for (const col of columns) {
    const v = values[col.id];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "—";
}

function valuesChanged(
  existing: Record<string, string | number | boolean | null>,
  incoming: Record<string, string | number | boolean | null>,
  columns: { id: string; name: string }[],
): string[] {
  const changed: string[] = [];
  for (const col of columns) {
    const a = existing[col.id] ?? null;
    const b = incoming[col.id] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(col.name);
  }
  return changed;
}

export function computeDataSyncDiff(ownerUid: string, snapshot: DataSyncSnapshot): DataSyncDiff {
  const diff: DataSyncDiff = {
    provider: snapshot.provider,
    database: {
      action: "create",
      internalId: null,
      name: snapshot.sourceLabel,
      nameChanged: false,
    },
    rows: { create: [], preserved: [], unchanged: 0, orphans: [] },
    summary: { creates: 0, preserved: 0, orphans: 0 },
  };

  const existingDb = findDatabaseByExternalId(ownerUid, snapshot.sourceDatabaseId);
  const dbId = existingDb?.id;

  if (existingDb) {
    diff.database = {
      action: existingDb.name === snapshot.sourceLabel ? "unchanged" : "update",
      internalId: existingDb.id,
      name: snapshot.sourceLabel,
      nameChanged: existingDb.name !== snapshot.sourceLabel,
    };
  }

  const snapshotIds = new Set(snapshot.rows.map((r) => r.externalId));

  for (const row of snapshot.rows) {
    const label = rowLabel(row.values, snapshot.columns);
    const existingRow = dbId ? findRowByExternalId(dbId, row.externalId) : undefined;
    if (!existingRow) {
      diff.rows.create.push({ externalId: row.externalId, label, action: "create" });
      continue;
    }
    const changedFields = valuesChanged(existingRow.values, row.values, snapshot.columns);
    if (changedFields.length === 0) {
      diff.rows.unchanged += 1;
    } else {
      // Additive model: existing rows are kept as-is. We still surface the diverging
      // fields for transparency, but they will NOT be applied (no overwrite of local edits).
      diff.rows.preserved.push({
        externalId: row.externalId,
        label,
        action: "preserved",
        internalId: existingRow.id,
        changedFields,
      });
    }
  }

  if (dbId) {
    for (const row of listDatabaseRows(ownerUid, dbId)) {
      const ref = row.externalRef;
      if (!ref) continue;
      if (ref.externalParentId !== snapshot.sourceDatabaseId) continue;
      if (snapshotIds.has(ref.externalId)) continue;
      diff.rows.orphans.push({
        internalId: row.id,
        label: rowLabel(row.values, snapshot.columns),
      });
    }
  }

  diff.summary = {
    creates: diff.rows.create.length,
    preserved: diff.rows.preserved.length,
    orphans: diff.rows.orphans.length,
  };

  return diff;
}

export function applyDataSyncDiff(ownerUid: string, snapshot: DataSyncSnapshot): ApplyDataSyncResult {
  let databaseCreated = false;
  let rowsCreated = 0;
  let rowsPreserved = 0;

  const existingDb = findDatabaseByExternalId(ownerUid, snapshot.sourceDatabaseId);
  const db = upsertUserDatabaseFromSync(ownerUid, {
    name: snapshot.sourceLabel,
    columns: snapshot.columns,
    externalId: snapshot.sourceDatabaseId,
    connectionId: snapshot.connectionId,
    sourceId: snapshot.sourceDatabaseId,
    provider: snapshot.provider,
  });

  if (!existingDb) databaseCreated = true;

  for (const row of snapshot.rows) {
    // Additive model: only new Notion pages create a row. Existing rows are left
    // untouched so local edits (values) are never overwritten on re-sync.
    if (findRowByExternalId(db.id, row.externalId)) {
      rowsPreserved += 1;
      continue;
    }
    const remapped = remapSnapshotRowValues(db, snapshot.columns, row.values);
    const result = upsertDatabaseRowFromSync(
      ownerUid,
      db.id,
      { externalId: row.externalId, values: remapped },
      {
        connectionId: snapshot.connectionId,
        sourceId: snapshot.sourceDatabaseId,
        provider: snapshot.provider,
      },
    );
    if (result.created) rowsCreated += 1;
  }

  const diff = computeDataSyncDiff(ownerUid, snapshot);

  return {
    databaseId: db.id,
    databaseCreated,
    rowsCreated,
    rowsUpdated: 0,
    rowsPreserved,
    orphans: diff.summary.orphans,
    database: listUserDatabases(ownerUid).find((d) => d.id === db.id) ?? db,
  };
}
