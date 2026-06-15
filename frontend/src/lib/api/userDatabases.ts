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
}

export interface DatabaseRow {
  id: string;
  databaseId: string;
  values: Record<string, string | number | boolean | null>;
  externalRef?: import("./todos").ExternalRef | null;
  createdAt: string;
  updatedAt: string;
}

export async function listUserDatabases(): Promise<UserDatabase[]> {
  const res = await fetch(`${API_BASE_URL}/user-databases`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await res.json()) as { databases: UserDatabase[] };
  return data.databases;
}

export async function getUserDatabase(id: string): Promise<{ database: UserDatabase; rows: DatabaseRow[] }> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${id}`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return res.json() as Promise<{ database: UserDatabase; rows: DatabaseRow[] }>;
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
): Promise<DatabaseRow> {
  const res = await fetch(`${API_BASE_URL}/user-databases/${databaseId}/rows/${rowId}`, {
    ...apiFetchDefaults,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
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
