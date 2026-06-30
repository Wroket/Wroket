import { Request, Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listConnectionSummariesForUser,
  getConnectionForUser,
  deleteConnectionForUser,
} from "../services/externalConnectionService";
import {
  exchangeNotionOAuthCode,
  getNotionAuthorizeUrl,
  isNotionOAuthConfigured,
} from "../services/notionOAuthService";
import {
  exchangeMondayOAuthCode,
  getMondayAuthorizeUrl,
  isMondayOAuthConfigured,
} from "../services/mondayOAuthService";
import {
  buildNotionDatabaseSnapshot,
  buildNotionContactsSnapshot,
  buildNotionDataSnapshot,
  getNotionDatabaseKind,
  listNotionDatabaseProperties,
  assertNotionDatabaseKindForProjectSync,
  assertNotionDatabaseKindForContactsSync,
  assertNotionDatabaseKindForDataSync,
  listNotionDatabases,
  type ContactColumnMapping,
} from "../services/notionApiService";
import {
  buildMondayBoardSnapshot,
  buildMondayBoardDataSnapshot,
  buildMondayDocDataSnapshot,
  buildMondayDocsSnapshot,
  listMondayBoards,
  listMondayDocs,
  listMondayImportSources,
  type MondayImportTarget,
  type MondaySourceKind,
} from "../services/mondayApiService";
import {
  applyDataSyncDiff,
  computeDataSyncDiff,
} from "../services/dataSyncService";
import {
  applyMondayDocSyncDiff,
  computeMondayDocSyncDiff,
  type MondayDocImportMode,
} from "../services/mondayDocSyncService";
import {
  applySyncDiff,
  assertSyncEntitlement,
  computeSyncDiff,
  type SyncImportMode,
} from "../services/externalSyncService";
import {
  applyContactSyncDiff,
  computeContactSyncDiff,
} from "../services/contactSyncService";
import { findProjectByExternalRef, getProjectById } from "../services/projectService";
import { consumeOAuthState, sanitizeOAuthReturnTo } from "../utils/oauthState";
import { findUserByUid, getEntitlementsForUid } from "../services/authService";
import { getEffectiveEntitlementsForUid } from "../services/teamService";
import { ForbiddenError, ValidationError } from "../utils/errors";

function assertIntegrationsEntitlement(uid: string): void {
  assertSyncEntitlement(uid);
}

export async function listConnections(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email;
  const connections = listConnectionSummariesForUser(uid, email);
  res.status(200).json({ connections });
}

export async function notionConnect(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  if (!isNotionOAuthConfigured()) {
    throw new ValidationError(
      "Intégration Notion non configurée sur le serveur (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET)",
      "NOTION_OAUTH_NOT_CONFIGURED",
    );
  }
  const returnTo = sanitizeOAuthReturnTo(
    typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
  );
  const url = getNotionAuthorizeUrl(req.user!.uid, returnTo);
  res.redirect(url);
}

export async function notionCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code || !state) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=notion_auth_failed`);
    return;
  }

  const statePayload = consumeOAuthState(state);
  if (!statePayload) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=notion_auth_failed`);
    return;
  }
  const { uid, returnTo } = statePayload;

  const userEmail = findUserByUid(uid)?.email ?? "";
  if (!getEffectiveEntitlementsForUid(uid, userEmail).integrations) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=integrations_plan_required`);
    return;
  }

  const user = findUserByUid(uid);
  if (!user?.email) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=notion_auth_failed`);
    return;
  }

  try {
    await exchangeNotionOAuthCode(code, uid, user.email);
    const successPath = returnTo
      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}notion=connected`
      : `${frontendUrl}/settings?tab=integrations&notion=connected`;
    res.redirect(successPath.startsWith("/") ? `${frontendUrl}${successPath}` : successPath);
  } catch (err) {
    console.error("[notion-oauth] callback error:", err);
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=notion_auth_failed`);
  }
}

export async function listNotionDatabasesHandler(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté — connectez-vous depuis les paramètres", "NOTION_NOT_CONNECTED");
  }
  const databases = await listNotionDatabases(conn);
  res.status(200).json({ databases, connectionId: conn.id, workspaceName: conn.workspaceName ?? null });
}

function parseImportMode(raw: unknown): SyncImportMode {
  return raw === "create_new" ? "create_new" : "merge";
}

export async function previewNotionSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);

  if (databaseKind.suggestedKind === "contacts") {
    res.status(200).json({
      databaseKind,
      blockedAsContacts: true,
      connectionId: conn.id,
      workspaceName: conn.workspaceName ?? null,
    });
    return;
  }

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot, mappingReport } = await buildNotionDatabaseSnapshot(conn, databaseId, projectName);
  const diff = await computeSyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId,
    importMode,
  });

  const mergeTarget = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "notion",
    snapshot.projectExternalId,
  );
  const existingProject = mergeTarget
    ? { id: mergeTarget.id, name: mergeTarget.name }
    : null;

  res.status(200).json({
    diff,
    snapshot: {
      projectName: snapshot.projectName,
      projectExternalId: snapshot.projectExternalId,
      phaseCount: snapshot.phases.length,
      taskCount: snapshot.tasks.length,
      milestoneCount: snapshot.milestones?.length ?? 0,
      customFieldCount: snapshot.customFieldDefs?.length ?? 0,
    },
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
    existingProject,
    mappingReport,
    databaseKind,
  });
}

export async function confirmNotionSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);
  assertNotionDatabaseKindForProjectSync(databaseKind.suggestedKind);

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot } = await buildNotionDatabaseSnapshot(conn, databaseId, projectName);
  const existingProject = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "notion",
    snapshot.projectExternalId,
  );

  const result = await applySyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId: importMode === "merge" && existingProject ? existingProject.id : targetProjectId,
    importMode: existingProject ? importMode : "merge",
  });

  const project = getProjectById(result.projectId);
  if (!project) throw new ValidationError("Projet introuvable après synchronisation");

  res.status(200).json({
    project,
    ...result,
    connectionId: conn.id,
  });
}

export async function previewNotionContactsSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);
  assertNotionDatabaseKindForContactsSync(databaseKind.suggestedKind);

  const columnMapping = parseContactColumnMapping(req.body?.columnMapping);
  const { snapshot, mappingReport } = await buildNotionContactsSnapshot(conn, databaseId, columnMapping);
  const diff = computeContactSyncDiff(req.user!.uid, snapshot);
  const notionProperties = await listNotionDatabaseProperties(conn, databaseId);

  res.status(200).json({
    diff,
    snapshot: {
      sourceLabel: snapshot.sourceLabel,
      sourceDatabaseId: snapshot.sourceDatabaseId,
      contactCount: snapshot.contacts.length,
    },
    mappingReport,
    notionProperties,
    databaseKind,
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
  });
}

function parseContactColumnMapping(raw: unknown): ContactColumnMapping[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ContactColumnMapping[] = [];
  const allowed = new Set(["firstName", "lastName", "email", "phone", "company", "tags", "notes", "ignore"]);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const notionProperty = typeof m.notionProperty === "string" ? m.notionProperty.trim() : "";
    const target = typeof m.target === "string" ? m.target : "";
    if (!notionProperty || !allowed.has(target)) continue;
    out.push({ notionProperty, target: target as ContactColumnMapping["target"] });
  }
  return out.length ? out : undefined;
}

export async function confirmNotionContactsSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);
  assertNotionDatabaseKindForContactsSync(databaseKind.suggestedKind);

  const columnMapping = parseContactColumnMapping(req.body?.columnMapping);
  const { snapshot } = await buildNotionContactsSnapshot(conn, databaseId, columnMapping);
  const result = await applyContactSyncDiff(req.user!.uid, snapshot);

  res.status(200).json({
    ...result,
    connectionId: conn.id,
    sourceLabel: snapshot.sourceLabel,
  });
}

export async function previewNotionDataSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);
  assertNotionDatabaseKindForDataSync(databaseKind.suggestedKind);

  const { snapshot } = await buildNotionDataSnapshot(conn, databaseId);
  const diff = computeDataSyncDiff(req.user!.uid, snapshot);

  res.status(200).json({
    diff,
    snapshot: {
      sourceLabel: snapshot.sourceLabel,
      sourceDatabaseId: snapshot.sourceDatabaseId,
      rowCount: snapshot.rows.length,
      columnCount: snapshot.columns.length,
    },
    databaseKind,
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
  });
}

export async function confirmNotionDataSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "notion");
  if (!conn) {
    throw new ForbiddenError("Notion n'est pas connecté", "NOTION_NOT_CONNECTED");
  }

  const databaseId = (req.body?.databaseId as string | undefined)?.trim();
  if (!databaseId) throw new ValidationError("databaseId requis");

  const databaseKind = await getNotionDatabaseKind(conn, databaseId);
  assertNotionDatabaseKindForDataSync(databaseKind.suggestedKind);

  const { snapshot } = await buildNotionDataSnapshot(conn, databaseId);
  const result = applyDataSyncDiff(req.user!.uid, snapshot);

  res.status(200).json({
    ...result,
    connectionId: conn.id,
    sourceLabel: snapshot.sourceLabel,
  });
}

export async function disconnectNotion(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const removed = deleteConnectionForUser(req.user!.uid, "notion");
  res.status(200).json({ disconnected: removed });
}

export async function mondayConnect(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  if (!isMondayOAuthConfigured()) {
    throw new ValidationError(
      "Intégration Monday non configurée sur le serveur (MONDAY_CLIENT_ID / MONDAY_CLIENT_SECRET)",
      "MONDAY_OAUTH_NOT_CONFIGURED",
    );
  }
  const returnTo = sanitizeOAuthReturnTo(
    typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
  );
  const url = getMondayAuthorizeUrl(req.user!.uid, returnTo);
  res.redirect(url);
}

export async function mondayCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code || !state) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=monday_auth_failed`);
    return;
  }

  const statePayload = consumeOAuthState(state);
  if (!statePayload) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=monday_auth_failed`);
    return;
  }
  const { uid, returnTo } = statePayload;

  const userEmail = findUserByUid(uid)?.email ?? "";
  if (!getEffectiveEntitlementsForUid(uid, userEmail).integrations) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=integrations_plan_required`);
    return;
  }

  const user = findUserByUid(uid);
  if (!user?.email) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=monday_auth_failed`);
    return;
  }

  try {
    await exchangeMondayOAuthCode(code, uid, user.email);
    const successPath = returnTo
      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}monday=connected`
      : `${frontendUrl}/settings?tab=integrations&monday=connected`;
    res.redirect(successPath.startsWith("/") ? `${frontendUrl}${successPath}` : successPath);
  } catch (err) {
    console.error("[monday-oauth] callback error:", err);
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=monday_auth_failed`);
  }
}

export async function listMondayBoardsHandler(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté — connectez-vous depuis les paramètres", "MONDAY_NOT_CONNECTED");
  }
  const boards = await listMondayBoards(conn);
  res.status(200).json({ boards, connectionId: conn.id, workspaceName: conn.workspaceName ?? null });
}

export async function listMondaySourcesHandler(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté — connectez-vous depuis les paramètres", "MONDAY_NOT_CONNECTED");
  }
  const { sources, docsScopeMissing } = await listMondayImportSources(conn);
  res.status(200).json({
    sources,
    docsScopeMissing,
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
    grantedScopes: conn.grantedScopes ?? null,
  });
}

function parseMondaySourceKind(raw: unknown): MondaySourceKind {
  return raw === "doc" ? "doc" : "board";
}

function parseMondayImportTarget(raw: unknown): MondayImportTarget {
  if (raw === "database" || raw === "document") return raw;
  return "project";
}

export async function previewMondayDataSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const sourceKind = parseMondaySourceKind(req.body?.sourceKind);
  const sourceId = String(req.body?.sourceId ?? "").trim();
  if (!sourceId) throw new ValidationError("sourceId requis");

  const databaseName = (req.body?.databaseName as string | undefined)?.trim();

  const { snapshot, mappingReport } =
    sourceKind === "doc"
      ? await buildMondayDocDataSnapshot(conn, sourceId, databaseName)
      : await buildMondayBoardDataSnapshot(conn, sourceId, databaseName);

  const diff = computeDataSyncDiff(req.user!.uid, snapshot);

  res.status(200).json({
    diff,
    snapshot: {
      sourceLabel: snapshot.sourceLabel,
      sourceDatabaseId: snapshot.sourceDatabaseId,
      rowCount: snapshot.rows.length,
      columnCount: snapshot.columns.length,
    },
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
    mappingReport,
    sourceKind,
    sourceId,
  });
}

export async function confirmMondayDataSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const sourceKind = parseMondaySourceKind(req.body?.sourceKind);
  const sourceId = String(req.body?.sourceId ?? "").trim();
  if (!sourceId) throw new ValidationError("sourceId requis");

  const databaseName = (req.body?.databaseName as string | undefined)?.trim();

  const { snapshot } =
    sourceKind === "doc"
      ? await buildMondayDocDataSnapshot(conn, sourceId, databaseName)
      : await buildMondayBoardDataSnapshot(conn, sourceId, databaseName);

  const result = applyDataSyncDiff(req.user!.uid, snapshot);

  res.status(200).json({
    ...result,
    connectionId: conn.id,
    sourceLabel: snapshot.sourceLabel,
    sourceKind,
    sourceId,
  });
}

export async function previewMondaySync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const boardId = (req.body?.boardId as string | undefined)?.trim();
  if (!boardId) throw new ValidationError("boardId requis");

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot, mappingReport } = await buildMondayBoardSnapshot(conn, boardId, projectName);
  const diff = await computeSyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId,
    importMode,
  });

  const mergeTarget = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "monday",
    snapshot.projectExternalId,
  );
  const existingProject = mergeTarget ? { id: mergeTarget.id, name: mergeTarget.name } : null;

  res.status(200).json({
    diff,
    snapshot: {
      projectName: snapshot.projectName,
      projectExternalId: snapshot.projectExternalId,
      phaseCount: snapshot.phases.length,
      taskCount: snapshot.tasks.length,
    },
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
    existingProject,
    mappingReport,
  });
}

export async function confirmMondaySync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const boardId = (req.body?.boardId as string | undefined)?.trim();
  if (!boardId) throw new ValidationError("boardId requis");

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot } = await buildMondayBoardSnapshot(conn, boardId, projectName);
  const existingProject = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "monday",
    snapshot.projectExternalId,
  );

  const result = await applySyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId: importMode === "merge" && existingProject ? existingProject.id : targetProjectId,
    importMode: existingProject ? importMode : "merge",
  });

  const project = getProjectById(result.projectId);
  if (!project) throw new ValidationError("Projet introuvable après synchronisation");

  res.status(200).json({
    project,
    ...result,
    connectionId: conn.id,
  });
}

export async function disconnectMonday(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const removed = deleteConnectionForUser(req.user!.uid, "monday");
  res.status(200).json({ disconnected: removed });
}

function parseMondayDocImportMode(raw: unknown): MondayDocImportMode {
  return raw === "create_new" ? "create_new" : "merge";
}

export async function listMondayDocsHandler(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté — connectez-vous depuis les paramètres", "MONDAY_NOT_CONNECTED");
  }
  const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const docs = await listMondayDocs(conn, workspaceId);
  res.status(200).json({ docs, connectionId: conn.id, workspaceName: conn.workspaceName ?? null });
}

export async function previewMondayDocsSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const docIds = Array.isArray(req.body?.docIds)
    ? (req.body.docIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (docIds.length === 0) throw new ValidationError("docIds requis");

  const folder = (req.body?.folder as string | undefined)?.trim() || "Monday";
  const projectId = (req.body?.projectId as string | undefined)?.trim() || null;
  const importMode = parseMondayDocImportMode(req.body?.importMode);

  const { snapshot, mappingReport } = await buildMondayDocsSnapshot(conn, docIds);
  const diff = computeMondayDocSyncDiff(req.user!.uid, snapshot, { folder, projectId, importMode });

  res.status(200).json({
    diff,
    snapshot: {
      docCount: snapshot.docs.length,
      titles: snapshot.docs.map((d) => d.title),
    },
    connectionId: conn.id,
    workspaceName: conn.workspaceName ?? null,
    mappingReport,
    folder,
    projectId,
  });
}

export async function confirmMondayDocsSync(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitlement(req.user!.uid);
  const conn = getConnectionForUser(req.user!.uid, "monday");
  if (!conn) {
    throw new ForbiddenError("Monday n'est pas connecté", "MONDAY_NOT_CONNECTED");
  }

  const docIds = Array.isArray(req.body?.docIds)
    ? (req.body.docIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (docIds.length === 0) throw new ValidationError("docIds requis");

  const folder = (req.body?.folder as string | undefined)?.trim() || "Monday";
  const projectId = (req.body?.projectId as string | undefined)?.trim() || null;
  const importMode = parseMondayDocImportMode(req.body?.importMode);

  const { snapshot } = await buildMondayDocsSnapshot(conn, docIds);
  const result = applyMondayDocSyncDiff(req.user!.uid, snapshot, { folder, projectId, importMode });

  res.status(200).json({
    ...result,
    connectionId: conn.id,
    folder,
    projectId,
  });
}
