import { parseApiErrorResponse } from "@/lib/apiErrors";
import {
  API_BASE_URL,
  apiFetchDefaults,
  parseJsonOrThrow,
  extractApiMessage,
} from "./core";
import type { Project } from "./projects";
import { broadcastResourceChange } from "@/lib/useResourceSync";
import type { SyncDiff, SyncImportMode, DataSyncDiff } from "./notionImport";

export interface MondayBoardSummary {
  id: string;
  name: string;
  state: string | null;
}

export type MondaySourceKind = "board" | "doc";
export type MondayImportTarget = "project" | "database" | "document";

export interface MondayImportSource {
  id: string;
  name: string;
  kind: MondaySourceKind;
  suggestedTarget: MondayImportTarget;
  hasTable?: boolean;
  url?: string | null;
}

export interface MondayDataMappingReport {
  warnings: string[];
}

export interface MondayDataSyncPreview {
  diff: DataSyncDiff;
  snapshot: {
    sourceLabel: string;
    sourceDatabaseId: string;
    rowCount: number;
    columnCount: number;
  };
  connectionId: string;
  workspaceName: string | null;
  mappingReport?: MondayDataMappingReport;
  sourceKind: MondaySourceKind;
  sourceId: string;
}

export interface MondayDataSyncConfirmResult {
  databaseId: string;
  databaseCreated: boolean;
  rowsCreated: number;
  rowsUpdated: number;
  rowsPreserved: number;
  orphans: number;
  connectionId: string;
  sourceLabel: string;
  sourceKind: MondaySourceKind;
  sourceId: string;
}

export interface MondayMappingReport {
  nativeFields: {
    title?: string;
    phase?: string;
    status?: string;
    due?: string;
    start?: string;
  };
  warnings: string[];
}

export interface MondaySyncPreview {
  diff?: SyncDiff;
  snapshot?: {
    projectName: string;
    projectExternalId: string;
    phaseCount: number;
    taskCount: number;
  };
  connectionId?: string;
  workspaceName: string | null;
  existingProject?: { id: string; name: string } | null;
  mappingReport?: MondayMappingReport;
}

export interface MondaySyncConfirmResult {
  project: Project;
  projectId: string;
  projectCreated: boolean;
  phasesCreated: number;
  phasesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  orphanPhases: number;
  orphanTasks: number;
  connectionId?: string;
}

export async function listMondaySources(): Promise<{
  sources: MondayImportSource[];
  docsScopeMissing: boolean;
  grantedScopes: string | null;
  connectionId: string;
  workspaceName: string | null;
}> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/sources`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_NOT_CONNECTED");
  }
  return res.json() as Promise<{
    sources: MondayImportSource[];
    docsScopeMissing: boolean;
    grantedScopes: string | null;
    connectionId: string;
    workspaceName: string | null;
  }>;
}

export async function previewMondayDataSync(body: {
  sourceKind: MondaySourceKind;
  sourceId: string;
  databaseName?: string;
}): Promise<MondayDataSyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/preview-data-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  return res.json() as Promise<MondayDataSyncPreview>;
}

export async function confirmMondayDataSync(body: {
  sourceKind: MondaySourceKind;
  sourceId: string;
  databaseName?: string;
}): Promise<MondayDataSyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/confirm-data-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  const result = (await res.json()) as MondayDataSyncConfirmResult;
  broadcastResourceChange("notes");
  return result;
}

export async function listMondayBoards(): Promise<{
  boards: MondayBoardSummary[];
  connectionId: string;
  workspaceName: string | null;
}> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/boards`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_NOT_CONNECTED");
  }
  return res.json() as Promise<{
    boards: MondayBoardSummary[];
    connectionId: string;
    workspaceName: string | null;
  }>;
}

export async function previewMondaySync(body: {
  boardId: string;
  projectName?: string;
  teamId?: string | null;
  targetProjectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<MondaySyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/preview-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  return res.json() as Promise<MondaySyncPreview>;
}

export async function confirmMondaySync(body: {
  boardId: string;
  projectName?: string;
  teamId?: string | null;
  targetProjectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<MondaySyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/confirm-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  const result = (await res.json()) as MondaySyncConfirmResult;
  broadcastResourceChange("projects");
  return result;
}

export async function previewMondayCsvImport(
  file: File,
  options?: {
    projectName?: string;
    teamId?: string | null;
    targetProjectId?: string | null;
    importMode?: SyncImportMode;
  },
): Promise<MondaySyncPreview> {
  const form = new FormData();
  form.append("file", file);
  if (options?.projectName) form.append("projectName", options.projectName);
  if (options?.teamId) form.append("teamId", options.teamId);
  if (options?.targetProjectId) form.append("targetProjectId", options.targetProjectId);
  if (options?.importMode) form.append("importMode", options.importMode);

  const res = await fetch(`${API_BASE_URL}/import/monday/preview`, {
    ...apiFetchDefaults,
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.IMPORT_MONDAY_INVALID");
  }
  return res.json() as Promise<MondaySyncPreview>;
}

export async function confirmMondayCsvImport(
  file: File,
  options?: {
    projectName?: string;
    teamId?: string | null;
    targetProjectId?: string | null;
    importMode?: SyncImportMode;
  },
): Promise<MondaySyncConfirmResult> {
  const form = new FormData();
  form.append("file", file);
  if (options?.projectName) form.append("projectName", options.projectName);
  if (options?.teamId) form.append("teamId", options.teamId);
  if (options?.targetProjectId) form.append("targetProjectId", options.targetProjectId);
  if (options?.importMode) form.append("importMode", options.importMode);

  const res = await fetch(`${API_BASE_URL}/import/monday/confirm`, {
    ...apiFetchDefaults,
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Import Monday impossible"));
  }
  const result = (await res.json()) as MondaySyncConfirmResult;
  broadcastResourceChange("projects");
  return result;
}

// ─── Monday Docs → Wroket Documents ─────────────────────────────────────────

export interface MondayDocSummary {
  id: string;
  objectId: string;
  name: string;
  workspaceId: string | null;
  updatedAt: string | null;
  url: string | null;
}

export interface MondayDocMappingReport {
  warnings: string[];
}

export interface MondayDocSyncDiff {
  provider: "monday";
  docs: {
    create: Array<{ externalId: string; label: string; action: string }>;
    update: Array<{ externalId: string; label: string; action: string; changedFields?: string[] }>;
    unchanged: number;
    orphans: Array<{ internalId: string; label: string }>;
  };
  summary: { creates: number; updates: number; orphans: number };
}

export interface MondayDocSyncPreview {
  diff?: MondayDocSyncDiff;
  snapshot?: { docCount: number; titles: string[] };
  connectionId?: string;
  workspaceName: string | null;
  mappingReport?: MondayDocMappingReport;
  folder?: string;
  projectId?: string | null;
}

export interface MondayDocSyncConfirmResult {
  created: number;
  updated: number;
  unchanged: number;
  orphans: number;
  connectionId?: string;
  folder?: string;
  projectId?: string | null;
}

export async function listMondayDocs(): Promise<{
  docs: MondayDocSummary[];
  connectionId: string;
  workspaceName: string | null;
}> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/docs`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_DOCS_SCOPE_MISSING");
  }
  return res.json() as Promise<{
    docs: MondayDocSummary[];
    connectionId: string;
    workspaceName: string | null;
  }>;
}

export async function previewMondayDocsSync(body: {
  docIds: string[];
  folder?: string;
  projectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<MondayDocSyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/docs/preview-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  return res.json() as Promise<MondayDocSyncPreview>;
}

export async function confirmMondayDocsSync(body: {
  docIds: string[];
  folder?: string;
  projectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<MondayDocSyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/monday/docs/confirm-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.MONDAY_API_ERROR");
  }
  const result = (await res.json()) as MondayDocSyncConfirmResult;
  broadcastResourceChange("notes");
  return result;
}
