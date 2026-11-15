import { parseApiErrorResponse } from "@/lib/apiErrors";
import {
  API_BASE_URL,
  apiFetchDefaults,
  parseJsonOrThrow,
} from "./core";

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
  relationDatabaseId?: string;
}

export interface UserDatabase {
  id: string;
  ownerUid: string;
  name: string;
  columns: DatabaseColumnDef[];
  externalRef?: import("./todos").ExternalRef | null;
  defaultView: "table" | "board";
  boardGroupColumnId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  shared?: boolean;
  teamId?: string;
  sharedWithUid?: string;
  sharedWithEmail?: string;
  collaboratorWrite?: boolean;
  ownerEmail?: string;
}

export interface DatabaseRow {
  id: string;
  databaseId: string;
  values: Record<string, string | number | boolean | null>;
  externalRef?: import("./todos").ExternalRef | null;
  createdAt: string;
  updatedAt: string;
  updatedByUid?: string;
}

export interface DatabasePresencePeer {
  uid: string;
  displayName: string;
  at: string;
  cursor?: { rowId: string; columnId: string } | null;
}

export interface DatabaseRevisionMeta {
  id: string;
  at: string;
  byUid: string;
  byEmail?: string;
}

export async function listUserDatabases(): Promise<UserDatabase[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { databases: UserDatabase[] };
  return data.databases;
}

export async function listSharedUserDatabases(): Promise<UserDatabase[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases/shared`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { databases: UserDatabase[] };
  return data.databases;
}

export async function getUserDatabase(
  id: string,
): Promise<{ database: UserDatabase; rows: DatabaseRow[]; canWrite?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${id}`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<{ database: UserDatabase; rows: DatabaseRow[]; canWrite?: boolean }>;
}

export async function createUserDatabase(body: {
  name: string;
  columns?: DatabaseColumnDef[];
}): Promise<UserDatabase> {
  const res = await fetch(`${API_BASE_URL}/user-databases`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<UserDatabase>;
}

export async function updateUserDatabase(
  id: string,
  body: Partial<{
    name: string;
    columns: DatabaseColumnDef[];
    defaultView: "table" | "board";
    boardGroupColumnId: string | null;
    shared: boolean;
    teamId: string | null;
    sharedWithEmail: string | null;
    collaboratorWrite: boolean;
  }>,
): Promise<UserDatabase> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${id}`, {
    ...apiFetchDefaults,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<UserDatabase>;
}

export async function deleteUserDatabase(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${id}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function getArchivedUserDatabases(): Promise<UserDatabase[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases/archived`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { databases: UserDatabase[] };
  return data.databases;
}

export async function restoreArchivedUserDatabase(id: string): Promise<UserDatabase> {
  const res = await fetch(`${API_BASE_URL}/user-databases/archived/${id}/restore`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<UserDatabase>;
}

export async function purgeArchivedUserDatabase(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/user-databases/archived/${id}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function createDatabaseRow(
  databaseId: string,
  values?: Record<string, string | number | boolean | null>,
): Promise<DatabaseRow> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/rows`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<DatabaseRow>;
}

export async function updateDatabaseRow(
  databaseId: string,
  rowId: string,
  values: Record<string, string | number | boolean | null>,
  opts?: { baseUpdatedAt?: string; force?: boolean },
): Promise<DatabaseRow> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/rows/${rowId}`, {
    ...apiFetchDefaults,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values,
      baseUpdatedAt: opts?.baseUpdatedAt,
      force: opts?.force,
    }),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<DatabaseRow>;
}

export async function deleteDatabaseRow(databaseId: string, rowId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/rows/${rowId}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function postDatabasePresence(
  databaseId: string,
  body: { displayName?: string; cursor?: { rowId: string; columnId: string } | null },
): Promise<DatabasePresencePeer[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/presence`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { presence: DatabasePresencePeer[] };
  return data.presence;
}

export async function getDatabaseLive(databaseId: string): Promise<{
  database: UserDatabase;
  canWrite: boolean;
  presence: DatabasePresencePeer[];
  rows: DatabaseRow[];
}> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/live`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<{
    database: UserDatabase;
    canWrite: boolean;
    presence: DatabasePresencePeer[];
    rows: DatabaseRow[];
  }>;
}

export async function listDatabaseRevisions(databaseId: string): Promise<DatabaseRevisionMeta[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/revisions`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { revisions: DatabaseRevisionMeta[] };
  return data.revisions;
}

export async function restoreDatabaseRevision(
  databaseId: string,
  revId: string,
): Promise<{ database: UserDatabase; rows: DatabaseRow[] }> {
  const res = await fetch(
    `${API_BASE_URL}/user-databases/${databaseId}/revisions/${revId}/restore`,
    { ...apiFetchDefaults, method: "POST" },
  );
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<{ database: UserDatabase; rows: DatabaseRow[] }>;
}
