import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { logActivity } from "../services/activityLogService";
import { createNotification, listNotifications } from "../services/notificationService";
import {
  listUserDatabases,
  createUserDatabase,
  updateUserDatabase,
  deleteUserDatabase,
  createDatabaseRowAsUser,
  updateDatabaseRowAsUser,
  deleteDatabaseRowAsUser,
  listArchivedUserDatabases,
  restoreArchivedUserDatabase,
  permanentlyDeleteArchivedUserDatabase,
  listSharedUserDatabases,
  requireDatabaseAccess,
  listDatabaseRowsById,
  type DatabaseColumnDef,
  type UpdateUserDatabaseInput,
} from "../services/userDatabaseService";
import {
  touchDatabasePresence,
  listDatabasePresence,
} from "../services/databasePresenceStore";
import {
  listDatabaseRevisions,
  getDatabaseRevision,
  pushDatabaseRevision,
  snapshotFromDatabase,
  replaceDatabaseRows,
  assertRevisionActor,
} from "../services/contentRevisionService";
import { findUserByUid } from "../services/authService";

function notifyDatabaseShared(
  actorUid: string,
  actorEmail: string,
  database: { id: string; name: string; sharedWithUid?: string; teamId?: string; shared?: boolean },
  prev: { sharedWithUid?: string; teamId?: string; shared?: boolean },
): void {
  const title = "Base partagée avec vous";
  if (database.sharedWithUid && database.sharedWithUid !== prev.sharedWithUid) {
    const recent = listNotifications(database.sharedWithUid).slice(0, 20);
    const dup = recent.some(
      (n) =>
        n.type === "database_shared" &&
        n.data?.databaseId === database.id &&
        Date.now() - Date.parse(n.createdAt) < 60_000,
    );
    if (!dup) {
      createNotification(
        database.sharedWithUid,
        "database_shared",
        title,
        `${actorEmail} a partagé la base « ${database.name} » avec vous`,
        { databaseId: database.id, databaseName: database.name },
      );
    }
  }
  // Team share: notify is skipped V1 (many members); direct share is the primary path.
  void actorUid;
  void prev;
}

export function list(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ databases: listUserDatabases(req.user!.uid) });
}

export function listShared(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({
    databases: listSharedUserDatabases(req.user!.uid, req.user!.email ?? ""),
  });
}

export function getOne(req: AuthenticatedRequest, res: Response): void {
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", req.params.id as string);
  const rows = listDatabaseRowsById(access.database.id);
  const ownerEmail =
    access.ownerUid === req.user!.uid
      ? undefined
      : findUserByUid(access.ownerUid)?.email ?? access.ownerUid;
  res.status(200).json({
    database: { ...access.database, ownerEmail },
    rows,
    canWrite: access.canWrite,
  });
}

export function create(req: AuthenticatedRequest, res: Response): void {
  const body = req.body as { name?: string; columns?: DatabaseColumnDef[] };
  const database = createUserDatabase(req.user!.uid, {
    name: body.name ?? "",
    columns: body.columns,
  });
  logActivity(req.user!.uid, req.user!.email ?? "", "create", "database", database.id, {
    name: database.name,
  });
  res.status(201).json(database);
}

export function update(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id, { ownerOnly: true });
  const body = req.body as UpdateUserDatabaseInput;
  const prev = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id).database;
  const beforeSnap = snapshotFromDatabase(prev, listDatabaseRowsById(id));

  const database = updateUserDatabase(req.user!.uid, id, body);

  const contentChanged =
    body.name !== undefined ||
    body.columns !== undefined ||
    body.defaultView !== undefined ||
    body.boardGroupColumnId !== undefined;
  if (contentChanged) {
    pushDatabaseRevision(id, beforeSnap, req.user!.uid, req.user!.email ?? undefined);
  }

  notifyDatabaseShared(req.user!.uid, req.user!.email ?? "", database, prev);

  logActivity(req.user!.uid, req.user!.email ?? "", "update", "database", database.id, {
    name: database.name,
    fields: Object.keys(body),
  });
  res.status(200).json(database);
}

export function remove(req: AuthenticatedRequest, res: Response): void {
  requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", req.params.id as string, {
    ownerOnly: true,
  });
  deleteUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "delete", "database", req.params.id as string);
  res.status(204).send();
}

export function listArchived(req: AuthenticatedRequest, res: Response): void {
  res.status(200).json({ databases: listArchivedUserDatabases(req.user!.uid) });
}

export function restoreArchived(req: AuthenticatedRequest, res: Response): void {
  const database = restoreArchivedUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "restore", "database", database.id, {
    name: database.name,
  });
  res.status(200).json(database);
}

export function purgeArchived(req: AuthenticatedRequest, res: Response): void {
  permanentlyDeleteArchivedUserDatabase(req.user!.uid, req.params.id as string);
  logActivity(req.user!.uid, req.user!.email ?? "", "purge", "database", req.params.id as string);
  res.status(204).send();
}

export function listRows(req: AuthenticatedRequest, res: Response): void {
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", req.params.id as string);
  res.status(200).json({ rows: listDatabaseRowsById(access.database.id) });
}

export function createRow(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id, { write: true });
  const beforeSnap = snapshotFromDatabase(access.database, listDatabaseRowsById(id));
  const body = req.body as { values?: Record<string, string | number | boolean | null> };
  const row = createDatabaseRowAsUser(req.user!.uid, req.user!.email ?? "", id, body.values);
  pushDatabaseRevision(id, beforeSnap, req.user!.uid, req.user!.email ?? undefined);
  logActivity(req.user!.uid, req.user!.email ?? "", "create", "database_row", row.id, {
    databaseId: id,
  });
  res.status(201).json(row);
}

export function updateRow(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id, { write: true });
  const beforeSnap = snapshotFromDatabase(access.database, listDatabaseRowsById(id));
  const body = req.body as {
    values?: Record<string, string | number | boolean | null>;
    baseUpdatedAt?: string;
    force?: boolean;
  };
  const row = updateDatabaseRowAsUser(
    req.user!.uid,
    req.user!.email ?? "",
    id,
    req.params.rowId as string,
    body.values ?? {},
    { baseUpdatedAt: body.baseUpdatedAt, force: body.force === true },
  );
  pushDatabaseRevision(id, beforeSnap, req.user!.uid, req.user!.email ?? undefined);
  logActivity(req.user!.uid, req.user!.email ?? "", "update", "database_row", row.id, {
    databaseId: id,
    fields: Object.keys(body.values ?? {}),
  });
  res.status(200).json(row);
}

export function removeRow(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id, { write: true });
  const beforeSnap = snapshotFromDatabase(access.database, listDatabaseRowsById(id));
  deleteDatabaseRowAsUser(req.user!.uid, req.user!.email ?? "", id, req.params.rowId as string);
  pushDatabaseRevision(id, beforeSnap, req.user!.uid, req.user!.email ?? undefined);
  logActivity(req.user!.uid, req.user!.email ?? "", "delete", "database_row", req.params.rowId as string, {
    databaseId: id,
  });
  res.status(204).send();
}

export async function postPresence(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id);
  const body = req.body as {
    displayName?: string;
    cursor?: { rowId: string; columnId: string } | null;
  };
  const presence = await touchDatabasePresence(id, {
    uid: req.user!.uid,
    displayName: (body.displayName || req.user!.email || "User").slice(0, 80),
    at: new Date().toISOString(),
    cursor: body.cursor === undefined ? undefined : body.cursor,
  });
  res.status(200).json({ presence });
}

export async function getLive(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id);
  const presence = await listDatabasePresence(id, req.user!.uid);
  res.status(200).json({
    database: access.database,
    canWrite: access.canWrite,
    presence,
    rows: listDatabaseRowsById(id),
  });
}

export function listRevisions(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id);
  const revisions = listDatabaseRevisions(id).map(({ snapshot: _s, ...meta }) => meta);
  res.status(200).json({ revisions });
}

export function restoreRevision(req: AuthenticatedRequest, res: Response): void {
  const id = req.params.id as string;
  const revId = req.params.revId as string;
  const access = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id, { write: true });
  assertRevisionActor(access.canWrite);
  const rev = getDatabaseRevision(id, revId);
  const currentSnap = snapshotFromDatabase(access.database, listDatabaseRowsById(id));
  pushDatabaseRevision(id, currentSnap, req.user!.uid, req.user!.email ?? undefined);

  updateUserDatabase(access.ownerUid, id, {
    name: rev.snapshot.name,
    columns: rev.snapshot.columns,
    defaultView: rev.snapshot.defaultView,
    boardGroupColumnId: rev.snapshot.boardGroupColumnId,
  });
  replaceDatabaseRows(id, rev.snapshot.rows);

  const database = requireDatabaseAccess(req.user!.uid, req.user!.email ?? "", id).database;
  const rows = listDatabaseRowsById(id);
  logActivity(req.user!.uid, req.user!.email ?? "", "restore", "database", id, { revId });
  res.status(200).json({ database, rows });
}
