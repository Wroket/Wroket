import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { logActivity } from "../services/activityLogService";
import {
  listUserDatabases,
  getUserDatabase,
  createUserDatabase,
  updateUserDatabase,
  deleteUserDatabase,
  listDatabaseRows,
  createDatabaseRow,
  updateDatabaseRow,
  deleteDatabaseRow,
  listArchivedUserDatabases,
  restoreArchivedUserDatabase,
  permanentlyDeleteArchivedUserDatabase,
  type DatabaseColumnDef,
} from "../services/userDatabaseService";

export function list(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ databases: listUserDatabases(req.user!.uid) });
}

export function getOne(req: AuthenticatedRequest, res: Response): void {
  const database = getUserDatabase(req.user!.uid, req.params.id as string);
  const rows = listDatabaseRows(req.user!.uid, database.id);
  res.status(200).json({ database, rows });
}

export function create(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as { name?: string; columns?: DatabaseColumnDef[] };
  const database = createUserDatabase(req.user!.uid, {
    name: body.name ?? "",
    columns: body.columns,
  });
  logActivity(req.user!.uid, req.user!.email ?? "", "create", "database", database.id, { name: database.name });
  res.status(201).json(database);
}

export function update(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as {
    name?: string;
    columns?: DatabaseColumnDef[];
    defaultView?: "table" | "board";
    boardGroupColumnId?: string | null;
  };
  const database = updateUserDatabase(req.user!.uid, req.params.id as string, body);
  logActivity(req.user!.uid, req.user!.email ?? "", "update", "database", database.id, { name: database.name, fields: Object.keys(body) });
  res.status(200).json(database);
}

export function remove(req: AuthenticatedRequest, res: Response): void {
  deleteUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "delete", "database", req.params.id as string);
  res.status(204).send();
}

export function listArchived(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ databases: listArchivedUserDatabases(req.user!.uid) });
}

export function restoreArchived(req: AuthenticatedRequest, res: Response): void {
  const database = restoreArchivedUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "restore", "database", database.id, { name: database.name });
  res.status(200).json(database);
}

export function purgeArchived(req: AuthenticatedRequest, res: Response): void {
  permanentlyDeleteArchivedUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "purge", "database", req.params.id as string);
  res.status(204).send();
}

export function listRows(req: AuthenticatedRequest, res: Response): void {
  const rows = listDatabaseRows(req.user!.uid, req.params.id as string);
  res.status(200).json({ rows });
}

export function createRow(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as { values?: Record<string, string | number | boolean | null> };
  const row = createDatabaseRow(req.user!.uid, req.params.id as string, body.values);
  logActivity(req.user!.uid, req.user!.email ?? "", "create", "database_row", row.id, { databaseId: req.params.id as string });
  res.status(201).json(row);
}

export function updateRow(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as { values: Record<string, string | number | boolean | null> };
  const row = updateDatabaseRow(
    req.user!.uid,
    req.params.id as string,
    req.params.rowId as string,
    body.values ?? {},
  );
  logActivity(req.user!.uid, req.user!.email ?? "", "update", "database_row", row.id, { databaseId: req.params.id as string, fields: Object.keys(body.values ?? {}) });
  res.status(200).json(row);
}

export function removeRow(req: AuthenticatedRequest, res: Response): void {
  deleteDatabaseRow(req.user!.uid, req.params.id as string, req.params.rowId as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "delete", "database_row", req.params.rowId as string, { databaseId: req.params.id as string });
  res.status(204).send();
}
