import { parseApiErrorResponse } from "@/lib/apiErrors";
import type { Contact } from "./contacts";
import {
  API_BASE_URL,
  apiFetchDefaults,
  parseJsonOrThrow,
  extractApiMessage,
  type FreeQuotaSnapshot,
} from "./core";
import type { ImportError, ImportPreview, Project } from "./projects";
import { broadcastResourceChange } from "@/lib/useResourceSync";

export interface NotionDatabasePreview {
  index: number;
  name: string;
  path: string;
  phases: { name: string; taskCount: number }[];
  taskCount: number;
  dependencyCount: number;
  errors: ImportError[];
}

export interface NotionImportCapacity {
  quota: FreeQuotaSnapshot | null;
  projectsHeadroom: number | null;
  tasksHeadroom: number | null;
  tasksRequested: number;
  tasksImportable: number;
  partialImport: boolean;
  canCreateProject: boolean;
  dependenciesSupported: boolean;
}

export interface NotionImportPreview extends ImportPreview {
  suggestedProjectName: string;
  databases: NotionDatabasePreview[];
  selectedDatabaseIndex: number;
  capacity: NotionImportCapacity;
  existingProject?: { id: string; name: string } | null;
}

export type SyncImportMode = "merge" | "create_new";

export interface NotionImportConfirmResult {
  project: Project;
  taskCount: number;
  dependenciesLinked: number;
  skippedForQuota: number;
  partialImport: boolean;
}

export type SyncAction = "create" | "update" | "unchanged";

export interface SyncEntityChange {
  externalId: string;
  label: string;
  action: SyncAction;
  internalId?: string;
  changedFields?: string[];
}

export interface SyncOrphan {
  internalId: string;
  label: string;
}

export interface SyncDiff {
  provider: "notion" | "monday";
  project: {
    action: SyncAction;
    internalId: string | null;
    name: string;
    nameChanged: boolean;
  };
  phases: {
    create: SyncEntityChange[];
    update: SyncEntityChange[];
    unchanged: number;
    orphans: SyncOrphan[];
  };
  tasks: {
    create: SyncEntityChange[];
    update: SyncEntityChange[];
    unchanged: number;
    orphans: SyncOrphan[];
  };
  summary: { creates: number; updates: number; orphans: number };
}

export type NotionDatabaseKind = "project" | "contacts" | "data" | "ambiguous";

export interface NotionDatabaseSummary {
  id: string;
  title: string;
  propertyNames: string[];
  suggestedKind: NotionDatabaseKind;
  kindScore: number;
}

export interface NotionMappingReport {
  nativeFields: {
    title?: string;
    phase?: string;
    priority?: string;
    effort?: string;
    due?: string;
    start?: string;
    tags?: string;
    blockedBy?: string;
    description?: string;
  };
  customFields: { name: string; type: string; optionCount: number }[];
  warnings: string[];
}

export interface NotionDatabaseKindInfo {
  suggestedKind: NotionDatabaseKind;
  kindScore: number;
  title?: string;
}

export interface NotionSyncPreview {
  diff?: SyncDiff;
  snapshot?: {
    projectName: string;
    projectExternalId: string;
    phaseCount: number;
    taskCount: number;
    milestoneCount: number;
    customFieldCount: number;
  };
  connectionId: string;
  workspaceName: string | null;
  existingProject?: { id: string; name: string } | null;
  mappingReport?: NotionMappingReport;
  databaseKind?: NotionDatabaseKindInfo;
  blockedAsContacts?: boolean;
}

export interface NotionSyncConfirmResult {
  project: Project;
  projectId: string;
  projectCreated: boolean;
  phasesCreated: number;
  phasesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  dependenciesLinked: number;
  orphanPhases: number;
  orphanTasks: number;
  connectionId: string;
}

export async function listNotionDatabases(): Promise<{
  databases: NotionDatabaseSummary[];
  connectionId: string;
  workspaceName: string | null;
}> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/databases`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_NOT_CONNECTED");
  }
  return res.json() as Promise<{
    databases: NotionDatabaseSummary[];
    connectionId: string;
    workspaceName: string | null;
  }>;
}

export async function previewNotionSync(body: {
  databaseId: string;
  projectName?: string;
  teamId?: string | null;
  targetProjectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<NotionSyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/preview-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_API_ERROR");
  }
  return res.json() as Promise<NotionSyncPreview>;
}

export async function confirmNotionSync(body: {
  databaseId: string;
  projectName?: string;
  teamId?: string | null;
  targetProjectId?: string | null;
  importMode?: SyncImportMode;
}): Promise<NotionSyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/confirm-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_API_ERROR");
  }
  const result = (await res.json()) as NotionSyncConfirmResult;
  broadcastResourceChange("projects");
  return result;
}

export interface ContactMappingReport {
  mappedFields: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: string;
    tags?: string;
  };
  warnings: string[];
}

export interface ContactSyncDiff {
  provider: "notion" | "monday";
  contacts: {
    create: SyncEntityChange[];
    update: SyncEntityChange[];
    unchanged: number;
    orphans: SyncOrphan[];
  };
  summary: { creates: number; updates: number; orphans: number };
}

export type ContactFieldTarget =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "company"
  | "tags"
  | "notes"
  | "ignore";

export interface ContactColumnMapping {
  notionProperty: string;
  target: ContactFieldTarget;
}

export interface NotionContactsSyncPreview {
  diff: ContactSyncDiff;
  snapshot: {
    sourceLabel: string;
    sourceDatabaseId: string;
    contactCount: number;
  };
  mappingReport: ContactMappingReport;
  notionProperties?: string[];
  databaseKind?: NotionDatabaseKindInfo;
  connectionId: string;
  workspaceName: string | null;
}

export interface NotionContactsSyncConfirmResult {
  created: number;
  updated: number;
  orphans: number;
  contacts: Contact[];
  connectionId: string;
  sourceLabel: string;
}

export async function previewNotionContactsSync(body: {
  databaseId: string;
  columnMapping?: ContactColumnMapping[];
}): Promise<NotionContactsSyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/preview-contacts-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_API_ERROR");
  }
  return res.json() as Promise<NotionContactsSyncPreview>;
}

export async function confirmNotionContactsSync(body: {
  databaseId: string;
  columnMapping?: ContactColumnMapping[];
}): Promise<NotionContactsSyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/confirm-contacts-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_CONTACTS_KIND_MISMATCH");
  }
  const result = (await res.json()) as NotionContactsSyncConfirmResult;
  broadcastResourceChange("teams");
  return result;
}

export interface DataSyncDiff {
  provider: "notion" | "monday";
  database: {
    action: SyncAction;
    internalId: string | null;
    name: string;
    nameChanged: boolean;
  };
  rows: {
    create: SyncEntityChange[];
    /** Existing rows kept as-is on re-sync (additive model: never overwritten). */
    preserved: SyncEntityChange[];
    unchanged: number;
    orphans: SyncOrphan[];
  };
  summary: { creates: number; preserved: number; orphans: number };
}

export interface NotionDataSyncPreview {
  diff: DataSyncDiff;
  snapshot: {
    sourceLabel: string;
    sourceDatabaseId: string;
    rowCount: number;
    columnCount: number;
  };
  databaseKind?: NotionDatabaseKindInfo;
  connectionId: string;
  workspaceName: string | null;
}

export interface NotionDataSyncConfirmResult {
  databaseId: string;
  databaseCreated: boolean;
  rowsCreated: number;
  rowsUpdated: number;
  rowsPreserved: number;
  orphans: number;
  connectionId: string;
  sourceLabel: string;
}

export async function previewNotionDataSync(body: { databaseId: string }): Promise<NotionDataSyncPreview> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/preview-data-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_DATA_KIND_MISMATCH");
  }
  return res.json() as Promise<NotionDataSyncPreview>;
}

export async function confirmNotionDataSync(body: { databaseId: string }): Promise<NotionDataSyncConfirmResult> {
  const res = await fetch(`${API_BASE_URL}/integrations/notion/confirm-data-sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.NOTION_DATA_KIND_MISMATCH");
  }
  const result = (await res.json()) as NotionDataSyncConfirmResult;
  broadcastResourceChange("teams");
  return result;
}

export async function previewNotionImport(
  file: File,
  options?: { projectName?: string; teamId?: string | null; databaseIndex?: number },
): Promise<NotionImportPreview> {
  const fd = new FormData();
  fd.append("file", file);
  if (options?.projectName?.trim()) fd.append("projectName", options.projectName.trim());
  if (options?.teamId) fd.append("teamId", options.teamId);
  if (options?.databaseIndex != null) fd.append("databaseIndex", String(options.databaseIndex));

  const res = await fetch(`${API_BASE_URL}/import/notion/preview`, {
    ...apiFetchDefaults,
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.IMPORT_NOTION_INVALID");
  }
  return res.json() as Promise<NotionImportPreview>;
}

export async function confirmNotionImport(
  file: File,
  projectName: string,
  teamId: string | null,
  databaseIndex = 0,
  importMode: SyncImportMode = "merge",
): Promise<NotionImportConfirmResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectName", projectName);
  if (teamId) fd.append("teamId", teamId);
  fd.append("databaseIndex", String(databaseIndex));
  fd.append("importMode", importMode);

  const res = await fetch(`${API_BASE_URL}/import/notion/confirm`, {
    ...apiFetchDefaults,
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.code.IMPORT_NOTION_INVALID");
  }
  const result = (await res.json()) as NotionImportConfirmResult;
  broadcastResourceChange("projects");
  return result;
}
