import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";
import { normalizeExternalRef, type ExternalProvider, type ExternalRef } from "./externalRef";

export type DatabaseColumnType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "email"
  | "phone"
  | "relation";

export interface DatabaseColumnDef {
  id: string;
  name: string;
  type: DatabaseColumnType;
  options?: string[];
  externalKey?: string;
  /** Target database for relation columns. */
  relationDatabaseId?: string;
}

export interface UserDatabase {
  id: string;
  ownerUid: string;
  name: string;
  columns: DatabaseColumnDef[];
  externalRef: ExternalRef | null;
  defaultView: "table" | "board";
  boardGroupColumnId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the database is in `archivedUserDatabases`. */
  archivedAt?: string;
}

export interface DatabaseRow {
  id: string;
  databaseId: string;
  values: Record<string, string | number | boolean | null>;
  externalRef: ExternalRef | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_DATABASES_PER_OWNER = 50;
const MAX_ROWS_PER_OWNER = 5000;
const MAX_COLUMNS_PER_DB = 30;
const MAX_COLUMN_NAME_LEN = 80;
const MAX_DB_NAME_LEN = 120;
const MAX_SELECT_OPTIONS = 20;
const MAX_TEXT_VALUE_LEN = 2000;

const COLUMN_TYPES: readonly DatabaseColumnType[] = [
  "text", "number", "date", "select", "checkbox", "email", "phone", "relation",
];

function getDatabaseStore(): Record<string, UserDatabase[]> {
  const store = getStore();
  if (!store.userDatabases) store.userDatabases = {};
  return store.userDatabases as Record<string, UserDatabase[]>;
}

function getRowStore(): Record<string, DatabaseRow[]> {
  const store = getStore();
  if (!store.userDatabaseRows) store.userDatabaseRows = {};
  return store.userDatabaseRows as Record<string, DatabaseRow[]>;
}

function getArchivedDatabaseStore(): Record<string, UserDatabase[]> {
  const store = getStore();
  if (!store.archivedUserDatabases) store.archivedUserDatabases = {};
  return store.archivedUserDatabases as Record<string, UserDatabase[]>;
}

function getArchivedRowStore(): Record<string, DatabaseRow[]> {
  const store = getStore();
  if (!store.archivedUserDatabaseRows) store.archivedUserDatabaseRows = {};
  return store.archivedUserDatabaseRows as Record<string, DatabaseRow[]>;
}

function persistDatabases(): void {
  scheduleSave("userDatabases");
}

function persistRows(): void {
  scheduleSave("userDatabaseRows");
}

function persistArchivedDatabases(): void {
  scheduleSave("archivedUserDatabases");
}

function persistArchivedRows(): void {
  scheduleSave("archivedUserDatabaseRows");
}

function countRowsForOwner(ownerUid: string): number {
  const dbs = getDatabaseStore()[ownerUid] ?? [];
  let total = 0;
  for (const db of dbs) {
    total += (getRowStore()[db.id] ?? []).length;
  }
  return total;
}

function assertOwnerDatabase(ownerUid: string, databaseId: string): UserDatabase {
  const db = (getDatabaseStore()[ownerUid] ?? []).find((d) => d.id === databaseId);
  if (!db) throw new NotFoundError("Base introuvable");
  return db;
}

function normalizeColumnName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Nom de colonne requis");
  if (trimmed.length > MAX_COLUMN_NAME_LEN) {
    throw new ValidationError(`Nom de colonne trop long (max ${MAX_COLUMN_NAME_LEN})`);
  }
  return trimmed;
}

function normalizeSelectOptions(options: string[] | undefined): string[] | undefined {
  if (!options?.length) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    const opt = raw.trim();
    if (!opt || seen.has(opt)) continue;
    seen.add(opt);
    out.push(opt);
    if (out.length >= MAX_SELECT_OPTIONS) break;
  }
  return out.length ? out : undefined;
}

export function sanitizeColumnInput(input: {
  id?: string;
  name: string;
  type: DatabaseColumnType;
  options?: string[];
  externalKey?: string;
  relationDatabaseId?: string;
}): DatabaseColumnDef {
  if (!COLUMN_TYPES.includes(input.type)) {
    throw new ValidationError("Type de colonne invalide");
  }
  const col: DatabaseColumnDef = {
    id: input.id?.trim() || crypto.randomUUID(),
    name: normalizeColumnName(input.name),
    type: input.type,
  };
  if (input.type === "select") {
    col.options = normalizeSelectOptions(input.options) ?? [];
  }
  if (input.externalKey?.trim()) col.externalKey = input.externalKey.trim();
  if (input.type === "relation" && input.relationDatabaseId?.trim()) {
    col.relationDatabaseId = input.relationDatabaseId.trim();
  }
  return col;
}

function validateRowValues(
  columns: DatabaseColumnDef[],
  values: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  const colById = new Map(columns.map((c) => [c.id, c]));
  for (const [colId, raw] of Object.entries(values ?? {})) {
    const col = colById.get(colId);
    if (!col) continue;
    if (raw === null || raw === undefined || raw === "") {
      out[colId] = null;
      continue;
    }
    switch (col.type) {
      case "text":
      case "email":
      case "phone": {
        if (typeof raw !== "string") throw new ValidationError(`Colonne « ${col.name} » : texte attendu`);
        out[colId] = raw.trim().slice(0, MAX_TEXT_VALUE_LEN) || null;
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) throw new ValidationError(`Colonne « ${col.name} » : nombre attendu`);
        out[colId] = n;
        break;
      }
      case "date": {
        if (typeof raw !== "string") throw new ValidationError(`Colonne « ${col.name} » : date attendue`);
        const d = raw.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          throw new ValidationError(`Colonne « ${col.name} » : format date YYYY-MM-DD`);
        }
        out[colId] = d;
        break;
      }
      case "select": {
        if (typeof raw !== "string") throw new ValidationError(`Colonne « ${col.name} » : option attendue`);
        const opt = raw.trim();
        if (col.options?.length && !col.options.includes(opt)) {
          throw new ValidationError(`Colonne « ${col.name} » : option invalide`);
        }
        out[colId] = opt || null;
        break;
      }
      case "checkbox": {
        out[colId] = Boolean(raw);
        break;
      }
      case "relation": {
        if (typeof raw !== "string") throw new ValidationError(`Colonne « ${col.name} » : relation attendue`);
        out[colId] = raw.trim() || null;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function listUserDatabases(ownerUid: string): UserDatabase[] {
  return (getDatabaseStore()[ownerUid] ?? []).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function getUserDatabase(ownerUid: string, databaseId: string): UserDatabase {
  return assertOwnerDatabase(ownerUid, databaseId);
}

export function createUserDatabase(
  ownerUid: string,
  input: { name: string; columns?: DatabaseColumnDef[] },
): UserDatabase {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Nom de base requis");
  if (name.length > MAX_DB_NAME_LEN) throw new ValidationError("Nom de base trop long");

  const store = getDatabaseStore();
  const list = store[ownerUid] ?? [];
  if (list.length >= MAX_DATABASES_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_DATABASES_PER_OWNER} bases atteinte`, "DATABASE_QUOTA_EXCEEDED");
  }

  const columns = (input.columns ?? []).slice(0, MAX_COLUMNS_PER_DB).map((c) =>
    sanitizeColumnInput(c),
  );

  const now = new Date().toISOString();
  const db: UserDatabase = {
    id: crypto.randomUUID(),
    ownerUid,
    name,
    columns,
    externalRef: null,
    defaultView: "table",
    boardGroupColumnId: null,
    createdAt: now,
    updatedAt: now,
  };

  store[ownerUid] = [db, ...list];
  getRowStore()[db.id] = [];
  persistDatabases();
  persistRows();
  return db;
}

export function updateUserDatabase(
  ownerUid: string,
  databaseId: string,
  input: {
    name?: string;
    columns?: DatabaseColumnDef[];
    defaultView?: "table" | "board";
    boardGroupColumnId?: string | null;
  },
): UserDatabase {
  const store = getDatabaseStore();
  const list = store[ownerUid] ?? [];
  const idx = list.findIndex((d) => d.id === databaseId);
  if (idx === -1) throw new NotFoundError("Base introuvable");

  const db = list[idx];
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Nom de base requis");
    if (name.length > MAX_DB_NAME_LEN) throw new ValidationError("Nom de base trop long");
    db.name = name;
  }
  if (input.columns !== undefined) {
    if (input.columns.length > MAX_COLUMNS_PER_DB) {
      throw new ValidationError(`Maximum ${MAX_COLUMNS_PER_DB} colonnes`);
    }
    db.columns = input.columns.map((c) => sanitizeColumnInput(c));
  }
  if (input.defaultView !== undefined) {
    db.defaultView = input.defaultView;
  }
  if (input.boardGroupColumnId !== undefined) {
    db.boardGroupColumnId = input.boardGroupColumnId;
  }
  db.updatedAt = new Date().toISOString();
  list[idx] = db;
  store[ownerUid] = list;
  persistDatabases();
  return db;
}

export function deleteUserDatabase(ownerUid: string, databaseId: string): void {
  const store = getDatabaseStore();
  const list = store[ownerUid] ?? [];
  const idx = list.findIndex((d) => d.id === databaseId);
  if (idx === -1) throw new NotFoundError("Base introuvable");
  const [db] = list.splice(idx, 1);
  store[ownerUid] = list;

  const rowStore = getRowStore();
  const rows = rowStore[databaseId] ?? [];
  delete rowStore[databaseId];

  const now = new Date().toISOString();
  const archivedDb: UserDatabase = { ...db, archivedAt: now, updatedAt: now };
  const archDbStore = getArchivedDatabaseStore();
  archDbStore[ownerUid] = [archivedDb, ...(archDbStore[ownerUid] ?? [])];
  getArchivedRowStore()[databaseId] = rows;

  persistDatabases();
  persistRows();
  persistArchivedDatabases();
  persistArchivedRows();
}

export function listArchivedUserDatabases(ownerUid: string): UserDatabase[] {
  return (getArchivedDatabaseStore()[ownerUid] ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.archivedAt ?? b.updatedAt).getTime() - new Date(a.archivedAt ?? a.updatedAt).getTime(),
    );
}

export function restoreArchivedUserDatabase(ownerUid: string, databaseId: string): UserDatabase {
  const archDbStore = getArchivedDatabaseStore();
  const archived = archDbStore[ownerUid] ?? [];
  const idx = archived.findIndex((d) => d.id === databaseId);
  if (idx === -1) throw new NotFoundError("Base introuvable");
  const active = getDatabaseStore()[ownerUid] ?? [];
  if (active.length >= MAX_DATABASES_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_DATABASES_PER_OWNER} bases atteinte`, "DATABASE_QUOTA_EXCEEDED");
  }
  const [db] = archived.splice(idx, 1);
  archDbStore[ownerUid] = archived;

  const archRows = getArchivedRowStore()[databaseId] ?? [];
  delete getArchivedRowStore()[databaseId];

  const now = new Date().toISOString();
  const restored: UserDatabase = { ...db, archivedAt: undefined, updatedAt: now };
  getDatabaseStore()[ownerUid] = [restored, ...active];
  getRowStore()[databaseId] = archRows;

  persistDatabases();
  persistRows();
  persistArchivedDatabases();
  persistArchivedRows();
  return restored;
}

export function permanentlyDeleteArchivedUserDatabase(ownerUid: string, databaseId: string): void {
  const archDbStore = getArchivedDatabaseStore();
  const archived = archDbStore[ownerUid] ?? [];
  const idx = archived.findIndex((d) => d.id === databaseId);
  if (idx === -1) throw new NotFoundError("Base introuvable");
  archived.splice(idx, 1);
  archDbStore[ownerUid] = archived;
  delete getArchivedRowStore()[databaseId];
  persistArchivedDatabases();
  persistArchivedRows();
}

function findArchivedDatabaseByExternalId(
  ownerUid: string,
  externalId: string,
): UserDatabase | undefined {
  return (getArchivedDatabaseStore()[ownerUid] ?? []).find(
    (d) => d.externalRef?.externalId === externalId,
  );
}

export function listDatabaseRows(ownerUid: string, databaseId: string): DatabaseRow[] {
  assertOwnerDatabase(ownerUid, databaseId);
  return (getRowStore()[databaseId] ?? [])
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createDatabaseRow(
  ownerUid: string,
  databaseId: string,
  values?: Record<string, string | number | boolean | null>,
): DatabaseRow {
  const db = assertOwnerDatabase(ownerUid, databaseId);
  if (countRowsForOwner(ownerUid) >= MAX_ROWS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_ROWS_PER_OWNER} lignes atteinte`, "DATABASE_ROW_QUOTA_EXCEEDED");
  }

  const now = new Date().toISOString();
  const row: DatabaseRow = {
    id: crypto.randomUUID(),
    databaseId,
    values: validateRowValues(db.columns, values),
    externalRef: null,
    createdAt: now,
    updatedAt: now,
  };

  const rowStore = getRowStore();
  rowStore[databaseId] = [...(rowStore[databaseId] ?? []), row];
  persistRows();
  return row;
}

export function updateDatabaseRow(
  ownerUid: string,
  databaseId: string,
  rowId: string,
  values: Record<string, string | number | boolean | null>,
): DatabaseRow {
  const db = assertOwnerDatabase(ownerUid, databaseId);
  const rowStore = getRowStore();
  const rows = rowStore[databaseId] ?? [];
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) throw new NotFoundError("Ligne introuvable");

  rows[idx].values = validateRowValues(db.columns, { ...rows[idx].values, ...values });
  rows[idx].updatedAt = new Date().toISOString();
  rowStore[databaseId] = rows;
  persistRows();
  return rows[idx];
}

export function deleteDatabaseRow(ownerUid: string, databaseId: string, rowId: string): void {
  assertOwnerDatabase(ownerUid, databaseId);
  const rowStore = getRowStore();
  const rows = rowStore[databaseId] ?? [];
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) throw new NotFoundError("Ligne introuvable");
  rows.splice(idx, 1);
  rowStore[databaseId] = rows;
  persistRows();
}

export function findDatabaseByExternalId(
  ownerUid: string,
  externalId: string,
): UserDatabase | undefined {
  return (getDatabaseStore()[ownerUid] ?? []).find(
    (d) => d.externalRef?.externalId === externalId,
  );
}

export function findRowByExternalId(
  databaseId: string,
  externalId: string,
): DatabaseRow | undefined {
  return (getRowStore()[databaseId] ?? []).find(
    (r) => r.externalRef?.externalId === externalId,
  );
}

export function listAllDatabasesForOwner(ownerUid: string): UserDatabase[] {
  return (getDatabaseStore()[ownerUid] ?? []).slice();
}

export function exportDatabasesForOwner(ownerUid: string): { databases: UserDatabase[]; rows: Record<string, DatabaseRow[]> } {
  const databases = [
    ...listAllDatabasesForOwner(ownerUid),
    ...listArchivedUserDatabases(ownerUid),
  ];
  const rows: Record<string, DatabaseRow[]> = {};
  for (const db of databases) {
    const activeRows = getRowStore()[db.id] ?? [];
    const archivedRows = getArchivedRowStore()[db.id] ?? [];
    rows[db.id] = activeRows.length ? activeRows.slice() : archivedRows.slice();
  }
  return { databases, rows };
}

export function purgeDatabasesForOwner(ownerUid: string): void {
  const store = getDatabaseStore();
  const archStore = getArchivedDatabaseStore();
  const rowStore = getRowStore();
  const archRowStore = getArchivedRowStore();
  for (const db of store[ownerUid] ?? []) {
    delete rowStore[db.id];
  }
  for (const db of archStore[ownerUid] ?? []) {
    delete archRowStore[db.id];
  }
  delete store[ownerUid];
  delete archStore[ownerUid];
  persistDatabases();
  persistRows();
  persistArchivedDatabases();
  persistArchivedRows();
}

export interface DatabaseSyncRowInput {
  externalId: string;
  values: Record<string, string | number | boolean | null>;
}

export interface UpsertRowFromSyncResult {
  row: DatabaseRow;
  created: boolean;
  updated: boolean;
  changedFields: string[];
}

export function upsertDatabaseRowFromSync(
  ownerUid: string,
  databaseId: string,
  input: DatabaseSyncRowInput,
  refs: { connectionId: string; sourceId: string; provider: ExternalProvider },
): UpsertRowFromSyncResult {
  const db = assertOwnerDatabase(ownerUid, databaseId);
  const now = new Date().toISOString();
  const externalRef: ExternalRef = {
    provider: refs.provider,
    externalId: input.externalId,
    connectionId: refs.connectionId,
    externalParentId: refs.sourceId,
    lastSyncedAt: now,
  };

  const validated = validateRowValues(db.columns, input.values);
  let existing = findRowByExternalId(databaseId, input.externalId);

  if (existing) {
    const changedFields: string[] = [];
    for (const col of db.columns) {
      const prev = existing.values[col.id] ?? null;
      const next = validated[col.id] ?? null;
      if (JSON.stringify(prev) !== JSON.stringify(next)) changedFields.push(col.name);
    }
    existing.values = validated;
    existing.externalRef = externalRef;
    existing.updatedAt = now;
    persistRows();
    return { row: existing, created: false, updated: changedFields.length > 0, changedFields };
  }

  if (countRowsForOwner(ownerUid) >= MAX_ROWS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_ROWS_PER_OWNER} lignes atteinte`, "DATABASE_ROW_QUOTA_EXCEEDED");
  }

  const row: DatabaseRow = {
    id: crypto.randomUUID(),
    databaseId,
    values: validated,
    externalRef,
    createdAt: now,
    updatedAt: now,
  };
  const rowStore = getRowStore();
  rowStore[databaseId] = [...(rowStore[databaseId] ?? []), row];
  persistRows();
  return { row, created: true, updated: false, changedFields: [] };
}

export function upsertUserDatabaseFromSync(
  ownerUid: string,
  input: {
    name: string;
    columns: DatabaseColumnDef[];
    externalId: string;
    connectionId: string;
    sourceId: string;
    provider: ExternalProvider;
  },
): UserDatabase {
  const now = new Date().toISOString();
  const externalRef: ExternalRef = {
    provider: input.provider,
    externalId: input.externalId,
    connectionId: input.connectionId,
    externalParentId: input.sourceId,
    lastSyncedAt: now,
  };

  let existing = findDatabaseByExternalId(ownerUid, input.externalId);
  if (!existing) {
    const archived = findArchivedDatabaseByExternalId(ownerUid, input.externalId);
    if (archived) {
      restoreArchivedUserDatabase(ownerUid, archived.id);
      existing = findDatabaseByExternalId(ownerUid, input.externalId);
    }
  }
  if (existing) {
    // Additive model: never overwrite the user's local schema choices on re-sync.
    // We keep the existing database name and existing column names/types, only
    // adding new Notion columns and merging select options. The Notion name is
    // used solely on first import (creation branch below).
    const mergedCols = mergeColumnsByExternalKey(existing.columns, input.columns);
    existing.columns = mergedCols;
    existing.externalRef = externalRef;
    existing.updatedAt = now;
    persistDatabases();
    return existing;
  }

  const created = createUserDatabase(ownerUid, { name: input.name, columns: input.columns });
  created.externalRef = externalRef;
  created.updatedAt = now;
  const store = getDatabaseStore();
  const list = store[ownerUid] ?? [];
  const idx = list.findIndex((d) => d.id === created.id);
  if (idx >= 0) list[idx] = created;
  store[ownerUid] = list;
  persistDatabases();
  return created;
}

/**
 * Additive column merge for re-sync: preserves the user's existing columns
 * (id, name, type, order) and any local-only columns. For synced columns it only
 * union-merges Notion select options; genuinely new Notion columns are appended.
 * Local schema edits (rename, retype, reorder) are therefore never overwritten.
 */
function mergeColumnsByExternalKey(
  existing: DatabaseColumnDef[],
  incoming: DatabaseColumnDef[],
): DatabaseColumnDef[] {
  const incomingByKey = new Map(
    incoming.filter((c) => c.externalKey).map((c) => [c.externalKey!, c]),
  );

  const merged: DatabaseColumnDef[] = existing.map((prev) => {
    if (!prev.externalKey) return prev;
    const inc = incomingByKey.get(prev.externalKey);
    if (!inc) return prev;
    if (prev.type === "select") {
      const union = [...(prev.options ?? [])];
      for (const opt of inc.options ?? []) {
        if (opt && !union.includes(opt)) union.push(opt);
      }
      return { ...prev, options: union };
    }
    return prev;
  });

  const existingKeys = new Set(
    existing.filter((c) => c.externalKey).map((c) => c.externalKey!),
  );
  for (const inc of incoming) {
    if (inc.externalKey && existingKeys.has(inc.externalKey)) continue;
    merged.push(inc);
  }

  return merged;
}

/** Remaps snapshot row values (snapshot column ids) to persisted column ids via externalKey. */
export function remapSnapshotRowValues(
  db: UserDatabase,
  snapshotColumns: DatabaseColumnDef[],
  values: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const snapByKey = new Map(
    snapshotColumns.filter((c) => c.externalKey).map((c) => [c.externalKey!, c.id]),
  );
  const dbByKey = new Map(
    db.columns.filter((c) => c.externalKey).map((c) => [c.externalKey!, c.id]),
  );
  const out: Record<string, string | number | boolean | null> = {};
  for (const [extKey, snapColId] of snapByKey.entries()) {
    const dbColId = dbByKey.get(extKey);
    if (!dbColId) continue;
    out[dbColId] = values[snapColId] ?? null;
  }
  return out;
}

(function hydrateUserDatabases() {
  const store = getStore();
  if (
    !store.userDatabases
    && !store.userDatabaseRows
    && !store.archivedUserDatabases
    && !store.archivedUserDatabaseRows
  ) {
    return;
  }
  let dbCount = 0;
  let archivedDbCount = 0;
  let rowCount = 0;
  let archivedRowCount = 0;

  const sanitizeDbList = (uid: string, list: unknown[]): UserDatabase[] =>
    list
      .filter((d): d is UserDatabase => typeof (d as UserDatabase).id === "string")
      .map((d) => ({
        ...d,
        ownerUid: uid,
        externalRef: normalizeExternalRef(d.externalRef),
        defaultView: (d.defaultView === "board" ? "board" : "table") as "table" | "board",
        boardGroupColumnId: typeof d.boardGroupColumnId === "string" ? d.boardGroupColumnId : null,
      }));

  for (const [uid, list] of Object.entries(store.userDatabases ?? {})) {
    if (!Array.isArray(list)) continue;
    const sanitized = sanitizeDbList(uid, list);
    (store.userDatabases as Record<string, UserDatabase[]>)[uid] = sanitized;
    dbCount += sanitized.length;
  }
  for (const [uid, list] of Object.entries(store.archivedUserDatabases ?? {})) {
    if (!Array.isArray(list)) continue;
    const sanitized = sanitizeDbList(uid, list);
    (store.archivedUserDatabases as Record<string, UserDatabase[]>)[uid] = sanitized;
    archivedDbCount += sanitized.length;
  }

  const sanitizeRows = (rows: unknown[]): DatabaseRow[] =>
    rows
      .filter((r): r is DatabaseRow => typeof (r as DatabaseRow).id === "string")
      .map((r) => ({ ...r, externalRef: normalizeExternalRef(r.externalRef) }));

  for (const [dbId, rows] of Object.entries(store.userDatabaseRows ?? {})) {
    if (!Array.isArray(rows)) continue;
    (store.userDatabaseRows as Record<string, DatabaseRow[]>)[dbId] = sanitizeRows(rows);
    rowCount += (store.userDatabaseRows as Record<string, DatabaseRow[]>)[dbId].length;
  }
  for (const [dbId, rows] of Object.entries(store.archivedUserDatabaseRows ?? {})) {
    if (!Array.isArray(rows)) continue;
    (store.archivedUserDatabaseRows as Record<string, DatabaseRow[]>)[dbId] = sanitizeRows(rows);
    archivedRowCount += (store.archivedUserDatabaseRows as Record<string, DatabaseRow[]>)[dbId].length;
  }

  if (dbCount > 0 || archivedDbCount > 0) {
    console.log(
      "[user-databases] %d base(s) active(s), %d archivée(s), %d + %d ligne(s)",
      dbCount,
      archivedDbCount,
      rowCount,
      archivedRowCount,
    );
  }
})();
