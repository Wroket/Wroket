import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
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
  res.status(200).json(database);
}

export function remove(req: AuthenticatedRequest, res: Response): void {
  deleteUserDatabase(req.user!.uid, req.params.id as string);
  res.status(204).send();
}

export function listArchived(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ databases: listArchivedUserDatabases(req.user!.uid) });
}

export function restoreArchived(req: AuthenticatedRequest, res: Response): void {
  const database = restoreArchivedUserDatabase(req.user!.uid, req.params.id as string);
  res.status(200).json(database);
}

export function purgeArchived(req: AuthenticatedRequest, res: Response): void {
  permanentlyDeleteArchivedUserDatabase(req.user!.uid, req.params.id as string);
  res.status(204).send();
}

export function listRows(req: AuthenticatedRequest, res: Response): void {
  const rows = listDatabaseRows(req.user!.uid, req.params.id as string);
  res.status(200).json({ rows });
}

export function createRow(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as { values?: Record<string, string | number | boolean | null> };
  const row = createDatabaseRow(req.user!.uid, req.params.id as string, body.values);
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
  res.status(200).json(row);
}

export function removeRow(req: AuthenticatedRequest, res: Response): void {
  deleteDatabaseRow(req.user!.uid, req.params.id as string, req.params.rowId as string);
  res.status(204).send();
}
