import AdmZip from "adm-zip";

import { type ImportError, type ImportPreview, type ParsedTask } from "./importService";
import { getFreeQuotaSnapshot, type FreeQuotaSnapshot } from "./quotaUsageService";
import {
  FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
  FREE_TIER_MAX_PERSONAL_PROJECTS,
} from "./freeTierQuotaConstants";
import { countPersonalActiveProjectsForQuota, findProjectByExternalRef, getProjectById, type Project } from "./projectService";
import { countPersonalActiveTodosForQuota } from "./todoService";
import { getEntitlementsForUid } from "./authService";
import { ValidationError } from "../utils/errors";
import type { Priority, Effort, TodoStatus } from "./todoService";
import {
  applySyncDiff,
  normalizePhaseKey,
  type SyncSnapshot,
  type SyncSnapshotPhase,
  type SyncSnapshotTask,
  type SyncImportMode,
} from "./externalSyncService";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_CSV_TASKS = 1000;
const DEFAULT_PHASE = "Général";

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

export interface ExistingMirroredProject {
  id: string;
  name: string;
}

export interface NotionImportPreview extends ImportPreview {
  suggestedProjectName: string;
  databases: NotionDatabasePreview[];
  selectedDatabaseIndex: number;
  capacity: NotionImportCapacity;
  /** Set when a prior import from the same ZIP source label already exists. */
  existingProject?: ExistingMirroredProject | null;
}

interface NotionCsvRow {
  title: string;
  phase: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  startDate: string | null;
  status: TodoStatus;
  tags: string[];
  blockedByTitles: string[];
  description: string | null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function pickField(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

function parseNotionDate(value: string): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const match = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];

export function mapNotionPriority(raw: string): Priority {
  const v = raw.trim().toLowerCase();
  if (["low", "basse", "faible", "p1"].includes(v)) return "low";
  if (["high", "haute", "elevee", "élevée", "urgent", "p3"].includes(v)) return "high";
  return "medium";
}

export function mapNotionEffort(raw: string): Effort {
  const v = raw.trim().toLowerCase();
  if (["light", "leger", "léger", "xs", "s", "low"].includes(v)) return "light";
  if (["heavy", "lourd", "xl", "high"].includes(v)) return "heavy";
  if (v === "l") return "heavy";
  return "medium";
}

/** CSV header aliases for native effort (Notion export + Tasks Tracker template). */
export const NOTION_EFFORT_CSV_KEYS = [
  "effort_level",
  "effort",
  "charge",
  "size",
  "taille",
] as const;

/** CSV header aliases for native due date / deadline. */
export const NOTION_DUE_CSV_KEYS = [
  "due_date",
  "due",
  "deadline",
  "echeance",
  "échéance",
  "date",
] as const;

/** CSV header aliases for native priority. */
export const NOTION_PRIORITY_CSV_KEYS = [
  "priority_level",
  "priority",
  "priorite",
  "priorité",
] as const;

/** CSV header aliases for task description → mirrored comment. */
export const NOTION_DESCRIPTION_CSV_KEYS = [
  "description",
  "notes",
  "note",
  "body",
  "details",
  "comment",
] as const;

export function mapNotionStatus(raw: string): TodoStatus {
  const v = raw.trim().toLowerCase();
  if (["done", "complete", "completed", "termine", "terminé", "fait"].includes(v)) return "completed";
  if (["cancelled", "canceled", "annule", "annulé"].includes(v)) return "cancelled";
  return "active";
}

function splitBlockedBy(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNotionCsvBuffer(buffer: Buffer, sourceLabel: string): {
  rows: NotionCsvRow[];
  errors: ImportError[];
} {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    throw new ValidationError("Le CSV Notion doit contenir un en-tête et au moins une ligne", "IMPORT_NOTION_INVALID");
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const titleKey = ["name", "titre", "title", "task", "task_name"].find((k) => headers.includes(k));
  if (!titleKey) {
    throw new ValidationError("Colonne Name/Titre introuvable dans l'export Notion", "IMPORT_NOTION_INVALID");
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_CSV_TASKS) {
    throw new ValidationError(`Maximum ${MAX_CSV_TASKS} tâches par base Notion`, "IMPORT_NOTION_INVALID");
  }

  const errors: ImportError[] = [];
  const rows: NotionCsvRow[] = [];

  dataLines.forEach((line, idx) => {
    const rowNum = idx + 2;
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] ?? "";
    });

    const title = pickField(row, ["name", "titre", "title", "task", "task_name"]);
    if (!title) {
      errors.push({ row: rowNum, field: titleKey, message: "Titre obligatoire" });
      return;
    }

    const phase =
      pickField(row, ["phase", "group", "groupe", "category", "categorie", "section", "status_group"]) ||
      DEFAULT_PHASE;

    const deadlineRaw = pickField(row, [...NOTION_DUE_CSV_KEYS]);
    const startRaw = pickField(row, ["start", "start_date", "debut", "début"]);
    const deadline = deadlineRaw ? parseNotionDate(deadlineRaw) : null;
    const startDate = startRaw ? parseNotionDate(startRaw) : null;

    if (deadlineRaw && !deadline) {
      errors.push({ row: rowNum, field: "due", message: `Date invalide : ${deadlineRaw}` });
      return;
    }
    if (startRaw && !startDate) {
      errors.push({ row: rowNum, field: "start", message: `Date invalide : ${startRaw}` });
      return;
    }

    const tagsRaw = pickField(row, ["tags", "etiquettes", "étiquettes", "labels"]);
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)
      : [];

    const descriptionRaw = pickField(row, [...NOTION_DESCRIPTION_CSV_KEYS]);

    rows.push({
      title,
      phase,
      priority: mapNotionPriority(pickField(row, [...NOTION_PRIORITY_CSV_KEYS])),
      effort: mapNotionEffort(pickField(row, [...NOTION_EFFORT_CSV_KEYS])),
      deadline,
      startDate,
      status: mapNotionStatus(pickField(row, ["status", "statut", "etat", "état"])),
      tags,
      blockedByTitles: splitBlockedBy(
        pickField(row, ["blocked_by", "blockedby", "bloque_par", "bloqué_par", "depends_on", "dependencies"]),
      ),
      description: descriptionRaw ? descriptionRaw.substring(0, 2000) : null,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    throw new ValidationError(`Aucune tâche détectée dans ${sourceLabel}`, "IMPORT_NOTION_INVALID");
  }

  return { rows, errors };
}

export function extractNotionCsvEntries(zipBuffer: Buffer): Array<{ path: string; name: string; buffer: Buffer }> {
  if (zipBuffer.length > MAX_ZIP_BYTES) {
    throw new ValidationError("Le fichier ZIP ne doit pas dépasser 25 Mo", "IMPORT_NOTION_INVALID");
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw new ValidationError("Fichier ZIP invalide", "IMPORT_NOTION_INVALID");
  }

  const entries: Array<{ path: string; name: string; buffer: Buffer }> = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, "/");
    if (!name.toLowerCase().endsWith(".csv")) continue;
    if (name.includes("__MACOSX")) continue;
    const base = name.split("/").pop() ?? name;
    const label = base.replace(/\.csv$/i, "").trim() || "Notion";
    entries.push({ path: name, name: label, buffer: entry.getData() });
  }

  if (entries.length === 0) {
    throw new ValidationError("Aucun CSV Notion trouvé dans le ZIP (export Markdown & CSV)", "IMPORT_NOTION_INVALID");
  }

  entries.sort((a, b) => b.buffer.length - a.buffer.length);
  return entries;
}

function notionRowsToParsedTasks(rows: NotionCsvRow[]): ParsedTask[] {
  return rows.map((row, idx) => ({
    row: idx + 2,
    phase: row.phase,
    title: row.title,
    priority: row.priority,
    effort: row.effort,
    deadline: row.deadline,
    startDate: row.startDate,
    assigneeEmail: null,
    assigneeUid: null,
    tags: row.tags,
    status: row.status,
  }));
}

function buildImportPreviewFromRows(
  rows: NotionCsvRow[],
  errors: ImportError[],
  projectName: string,
): ImportPreview {
  const phaseMap = new Map<string, number>();
  for (const row of rows) {
    phaseMap.set(row.phase, (phaseMap.get(row.phase) ?? 0) + 1);
  }
  return {
    projectName,
    phases: [...phaseMap.entries()].map(([name, taskCount]) => ({ name, taskCount })),
    tasks: notionRowsToParsedTasks(rows),
    errors,
  };
}

function computeCapacity(
  uid: string,
  teamId: string | null,
  activeTaskCount: number,
): NotionImportCapacity {
  const quota = getFreeQuotaSnapshot(uid);
  const dependenciesSupported = getEntitlementsForUid(uid).integrations;

  if (!quota) {
    return {
      quota: null,
      projectsHeadroom: null,
      tasksHeadroom: null,
      tasksRequested: activeTaskCount,
      tasksImportable: activeTaskCount,
      partialImport: false,
      canCreateProject: true,
      dependenciesSupported,
    };
  }

  const projectsHeadroom = Math.max(0, FREE_TIER_MAX_PERSONAL_PROJECTS - countPersonalActiveProjectsForQuota(uid));
  const tasksHeadroom = Math.max(0, FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL - countPersonalActiveTodosForQuota(uid));
  const personalImport = !teamId;

  const canCreateProject = !personalImport || projectsHeadroom > 0;
  let tasksImportable = activeTaskCount;
  if (personalImport) {
    tasksImportable = Math.min(activeTaskCount, tasksHeadroom);
  }

  return {
    quota,
    projectsHeadroom: personalImport ? projectsHeadroom : null,
    tasksHeadroom: personalImport ? tasksHeadroom : null,
    tasksRequested: activeTaskCount,
    tasksImportable,
    partialImport: tasksImportable < activeTaskCount || !canCreateProject,
    canCreateProject,
    dependenciesSupported,
  };
}

export function previewNotionZipImport(
  zipBuffer: Buffer,
  uid: string,
  userEmail: string,
  projectName?: string,
  teamId?: string | null,
  selectedDatabaseIndex = 0,
): NotionImportPreview {
  const entries = extractNotionCsvEntries(zipBuffer);
  const databases: NotionDatabasePreview[] = entries.map((entry, index) => {
    const { rows, errors } = parseNotionCsvBuffer(entry.buffer, entry.name);
    const activeRows = rows.filter((r) => r.status === "active");
    const phaseMap = new Map<string, number>();
    for (const row of rows) {
      phaseMap.set(row.phase, (phaseMap.get(row.phase) ?? 0) + 1);
    }
    const dependencyCount = rows.reduce((n, r) => n + r.blockedByTitles.length, 0);
    return {
      index,
      name: entry.name,
      path: entry.path,
      phases: [...phaseMap.entries()].map(([name, taskCount]) => ({ name, taskCount })),
      taskCount: rows.length,
      dependencyCount,
      errors,
    };
  });

  const idx = Math.min(Math.max(0, selectedDatabaseIndex), databases.length - 1);
  const selected = entries[idx];
  const parsed = parseNotionCsvBuffer(selected.buffer, selected.name);
  const suggestedProjectName = projectName?.trim() || selected.name;
  const preview = buildImportPreviewFromRows(parsed.rows, parsed.errors, suggestedProjectName);
  const activeCount = parsed.rows.filter((r) => r.status === "active").length;

  return {
    ...preview,
    suggestedProjectName,
    databases,
    selectedDatabaseIndex: idx,
    capacity: computeCapacity(uid, teamId ?? null, activeCount),
    existingProject: findNotionZipExistingProject(uid, userEmail, selected.name),
  };
}

/**
 * Builds an idempotent sync snapshot from parsed Notion ZIP rows.
 *
 * ZIP exports carry no stable page ids, so identity is derived deterministically:
 *  - project external id  = `notion-zip:<slug(source label)>`
 *  - phase external id     = normalized status/phase name (rename = new phase)
 *  - task external id      = `<project ext id>:<slug(title)>` (+ index on dupes)
 * Re-importing the same export therefore upserts in place instead of duplicating.
 * Real Notion page ids replace these heuristics in the API sync path (V1).
 */
export function buildNotionSyncSnapshot(
  rows: NotionCsvRow[],
  sourceLabel: string,
  projectName: string,
): SyncSnapshot {
  const projectExternalId = `notion-zip:${normalizePhaseKey(sourceLabel)}`;

  const phaseSeen = new Set<string>();
  const phases: SyncSnapshotPhase[] = [];
  for (const row of rows) {
    const key = normalizePhaseKey(row.phase);
    if (!phaseSeen.has(key)) {
      phaseSeen.add(key);
      phases.push({ externalId: key, name: row.phase, order: phases.length });
    }
  }

  const slugCount = new Map<string, number>();
  const firstExtIdByTitle = new Map<string, string>();
  const tasks: SyncSnapshotTask[] = rows.map((row) => {
    const baseSlug = normalizePhaseKey(row.title) || "task";
    const n = slugCount.get(baseSlug) ?? 0;
    slugCount.set(baseSlug, n + 1);
    const externalId =
      n === 0 ? `${projectExternalId}:${baseSlug}` : `${projectExternalId}:${baseSlug}-${n + 1}`;
    const normTitle = row.title.trim().toLowerCase();
    if (!firstExtIdByTitle.has(normTitle)) firstExtIdByTitle.set(normTitle, externalId);
    return {
      externalId,
      phaseExternalId: normalizePhaseKey(row.phase),
      title: row.title,
      priority: row.priority,
      effort: row.effort,
      status: row.status,
      startDate: row.startDate,
      deadline: row.deadline,
      tags: row.tags,
      assigneeUid: null,
      blockedByExternalIds: [],
      ...(row.description ? { description: row.description } : {}),
    };
  });

  rows.forEach((row, i) => {
    if (row.blockedByTitles.length === 0) return;
    tasks[i].blockedByExternalIds = row.blockedByTitles
      .map((t) => firstExtIdByTitle.get(t.trim().toLowerCase()))
      .filter((x): x is string => !!x && x !== tasks[i].externalId);
  });

  return { provider: "notion", projectExternalId, projectName, phases, tasks };
}

/** Returns the Wroket project previously created from the same Notion ZIP source label. */
export function findNotionZipExistingProject(
  uid: string,
  userEmail: string,
  sourceLabel: string,
): ExistingMirroredProject | null {
  const projectExternalId = `notion-zip:${normalizePhaseKey(sourceLabel)}`;
  const project = findProjectByExternalRef(uid, userEmail, "notion", projectExternalId);
  return project ? { id: project.id, name: project.name } : null;
}

export async function confirmNotionZipImport(
  uid: string,
  userEmail: string,
  zipBuffer: Buffer,
  projectName: string,
  teamId: string | null,
  selectedDatabaseIndex = 0,
  importMode: SyncImportMode = "merge",
): Promise<{
  project: Project;
  taskCount: number;
  dependenciesLinked: number;
  skippedForQuota: number;
  partialImport: boolean;
}> {
  const trimmedName = projectName.trim();
  if (!trimmedName) throw new ValidationError("Nom du projet requis");

  const entries = extractNotionCsvEntries(zipBuffer);
  const idx = Math.min(Math.max(0, selectedDatabaseIndex), entries.length - 1);
  const { rows, errors } = parseNotionCsvBuffer(entries[idx].buffer, entries[idx].name);

  if (errors.length > 0) {
    throw new ValidationError(`${errors.length} erreur(s) dans l'export — corrigez l'aperçu avant import`, "IMPORT_NOTION_INVALID");
  }

  const sourceLabel = entries[idx].name;
  const existingProject = findNotionZipExistingProject(uid, userEmail, sourceLabel);

  if (existingProject && importMode !== "merge" && importMode !== "create_new") {
    throw new ValidationError(
      "Choisissez fusionner avec le projet existant ou créer un nouveau projet",
      "IMPORT_MODE_REQUIRED",
    );
  }

  const capacity = computeCapacity(uid, teamId, rows.filter((r) => r.status === "active").length);
  const needsNewProject = !existingProject || importMode === "create_new";
  if (needsNewProject && !capacity.canCreateProject) {
    throw new ValidationError(
      `Limite de ${FREE_TIER_MAX_PERSONAL_PROJECTS} projets personnels atteinte. Passez à un palier payant ou choisissez une équipe.`,
      "FREE_QUOTA_PROJECTS",
    );
  }

  let importRows = rows;
  let skippedForQuota = 0;
  if (needsNewProject && capacity.partialImport && !teamId) {
    const activeRows = rows.filter((r) => r.status === "active");
    const allowedActive = capacity.tasksImportable;
    if (allowedActive <= 0) {
      throw new ValidationError(
        `Limite de ${FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL} tâches actives atteinte. Passez à un palier payant.`,
        "FREE_QUOTA_TASKS",
      );
    }
    const keptActive = new Set(activeRows.slice(0, allowedActive).map((r) => r.title));
    importRows = rows.filter((r) => r.status !== "active" || keptActive.has(r.title));
    skippedForQuota = activeRows.length - allowedActive;
  }

  const snapshot = buildNotionSyncSnapshot(importRows, sourceLabel, trimmedName);
  const result = await applySyncDiff(uid, userEmail, snapshot, {
    teamId,
    importMode: existingProject ? importMode : "merge",
    targetProjectId: existingProject && importMode === "merge" ? existingProject.id : null,
  });

  const project = getProjectById(result.projectId);
  if (!project) throw new ValidationError("Projet introuvable après synchronisation");

  return {
    project,
    taskCount: result.tasksCreated + result.tasksUpdated,
    dependenciesLinked: result.dependenciesLinked,
    skippedForQuota,
    partialImport: capacity.partialImport,
  };
}

/** Re-export for ZIP that is actually a single CSV (tests / edge cases). */
export function previewNotionCsvBuffer(buffer: Buffer, uid: string, projectName: string, teamId?: string | null): NotionImportPreview {
  const { rows, errors } = parseNotionCsvBuffer(buffer, projectName);
  const preview = buildImportPreviewFromRows(rows, errors, projectName);
  const activeCount = rows.filter((r) => r.status === "active").length;
  return {
    ...preview,
    suggestedProjectName: projectName,
    databases: [
      {
        index: 0,
        name: projectName,
        path: "export.csv",
        phases: preview.phases,
        taskCount: rows.length,
        dependencyCount: rows.reduce((n, r) => n + r.blockedByTitles.length, 0),
        errors,
      },
    ],
    selectedDatabaseIndex: 0,
    capacity: computeCapacity(uid, teamId ?? null, activeCount),
  };
}

/** Detect whether buffer is ZIP or raw CSV for unified upload handler. */
export function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function parseUploadAsNotionPreview(
  buffer: Buffer,
  uid: string,
  userEmail: string,
  projectName?: string,
  teamId?: string | null,
  selectedDatabaseIndex = 0,
): NotionImportPreview {
  if (isZipBuffer(buffer)) {
    return previewNotionZipImport(buffer, uid, userEmail, projectName, teamId, selectedDatabaseIndex);
  }
  const name = projectName?.trim() || "Notion";
  return previewNotionCsvBuffer(buffer, uid, name, teamId);
}
