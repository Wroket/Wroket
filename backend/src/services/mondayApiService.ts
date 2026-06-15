/**
 * Monday.com API client — list boards, pull items, map to SyncSnapshot.
 */

import crypto from "crypto";

import { ValidationError } from "../utils/errors";
import { parseMarkdownTables } from "../utils/markdownTableParser";
import type { ExternalConnection } from "./externalConnectionService";
import {
  normalizePhaseKey,
  type SyncSnapshot,
  type SyncSnapshotPhase,
  type SyncSnapshotTask,
} from "./externalSyncService";
import type { DataSyncSnapshot, DataSyncSnapshotRow } from "./notionApiService";
import type { TodoStatus } from "./todoService";
import type { DatabaseColumnDef, DatabaseColumnType } from "./userDatabaseService";

const MAX_ITEMS = 2000;

function mondayAuthHeader(accessToken: string): string {
  const token = accessToken.trim();
  return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

export interface MondayBoardSummary {
  id: string;
  name: string;
  state: string | null;
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

interface MondayColumnValue {
  id: string;
  type?: string;
  text?: string | null;
  value?: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  group?: { id: string; title?: string } | null;
  column_values?: MondayColumnValue[];
  subitems?: MondayItem[];
}

interface MondayGroup {
  id: string;
  title: string;
}

interface MondayBoard {
  id: string;
  name: string;
  groups?: MondayGroup[];
  columns?: { id: string; title: string; type: string }[];
  items_page?: {
    cursor?: string | null;
    items?: MondayItem[];
  };
}

interface MondayGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function mondayGraphql<T>(
  connection: ExternalConnection,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: mondayAuthHeader(connection.accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[monday-api] HTTP error:", body);
    throw new ValidationError(
      "Erreur API Monday — vérifiez les droits de la connexion",
      "MONDAY_API_ERROR",
    );
  }
  const json = (await res.json()) as MondayGraphQLResponse<T>;
  if (json.errors?.length) {
    console.error("[monday-api] GraphQL errors:", json.errors);
    throw new ValidationError(
      json.errors[0]?.message ?? "Erreur API Monday",
      "MONDAY_API_ERROR",
    );
  }
  if (!json.data) {
    throw new ValidationError("Réponse API Monday vide", "MONDAY_API_ERROR");
  }
  return json.data;
}

export async function listMondayBoards(connection: ExternalConnection): Promise<MondayBoardSummary[]> {
  const data = await mondayGraphql<{ boards: MondayBoardSummary[] }>(
    connection,
    `query { boards(limit: 100, state: active) { id name state } }`,
  );
  return (data.boards ?? []).filter((b) => b.state !== "archived");
}

async function fetchBoardPage(
  connection: ExternalConnection,
  boardId: string,
  cursor?: string | null,
): Promise<MondayBoard> {
  const data = await mondayGraphql<{ boards: MondayBoard[] }>(
    connection,
    `query ($boardId: [ID!], $cursor: String) {
      boards(ids: $boardId) {
        id
        name
        groups { id title }
        columns { id title type }
        items_page(limit: 500, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id type text value }
            subitems {
              id
              name
              column_values { id type text value }
            }
          }
        }
      }
    }`,
    { boardId: [boardId], cursor: cursor ?? null },
  );
  const board = data.boards?.[0];
  if (!board) throw new ValidationError("Tableau Monday introuvable", "MONDAY_API_INVALID");
  return board;
}

async function fetchAllBoardItems(connection: ExternalConnection, boardId: string): Promise<MondayBoard> {
  const first = await fetchBoardPage(connection, boardId);
  const allItems: MondayItem[] = [...(first.items_page?.items ?? [])];
  let cursor = first.items_page?.cursor;
  while (cursor && allItems.length < MAX_ITEMS) {
    const next = await fetchBoardPage(connection, boardId, cursor);
    const batch = next.items_page?.items ?? [];
    allItems.push(...batch);
    cursor = next.items_page?.cursor;
    if (!batch.length) break;
  }
  return {
    ...first,
    items_page: { cursor: null, items: allItems },
  };
}

function normalizeHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseMondayDateValue(col: MondayColumnValue | undefined): string | null {
  if (!col) return null;
  if (col.text?.trim()) {
    const d = col.text.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  if (col.value) {
    try {
      const parsed = JSON.parse(col.value) as { date?: string; from?: string; to?: string };
      const raw = parsed.date ?? parsed.from ?? parsed.to;
      if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function findColumnByType(
  columns: { id: string; title: string; type: string }[],
  type: string,
): { id: string; title: string; type: string } | undefined {
  return columns.find((c) => c.type === type);
}

function getColumnValue(item: MondayItem, columnId: string | undefined): MondayColumnValue | undefined {
  if (!columnId) return undefined;
  return item.column_values?.find((c) => c.id === columnId);
}

/** Maps Monday status labels to Wroket task status. */
export function mapMondayStatus(raw: string): TodoStatus {
  const n = normalizeHeader(raw);
  if (!n) return "active";
  if (
    n.includes("done") ||
    n.includes("termine") ||
    n.includes("complete") ||
    n.includes("fini") ||
    n.includes("livre")
  ) {
    return "completed";
  }
  return "active";
}

function mapItemToTask(
  item: MondayItem,
  phaseExternalId: string,
  statusColumnId: string | undefined,
  dateColumnId: string | undefined,
  timelineColumnId: string | undefined,
  parentExternalId?: string,
): SyncSnapshotTask | null {
  const title = item.name?.trim();
  if (!title) return null;

  const statusCol = getColumnValue(item, statusColumnId);
  const statusRaw = statusCol?.text?.trim() ?? "";
  const deadline =
    parseMondayDateValue(getColumnValue(item, dateColumnId)) ??
    parseMondayDateValue(getColumnValue(item, timelineColumnId));

  return {
    externalId: item.id,
    phaseExternalId,
    title,
    priority: "medium",
    effort: "medium",
    status: mapMondayStatus(statusRaw),
    startDate: null,
    deadline,
    tags: [],
    assigneeUid: null,
    blockedByExternalIds: [],
    parentExternalId,
  };
}

export interface BuildMondaySnapshotResult {
  snapshot: SyncSnapshot;
  mappingReport: MondayMappingReport;
}

export async function buildMondayBoardSnapshot(
  connection: ExternalConnection,
  boardId: string,
  projectName?: string,
): Promise<BuildMondaySnapshotResult> {
  const board = await fetchAllBoardItems(connection, boardId);
  const items = board.items_page?.items ?? [];
  if (items.length === 0) {
    throw new ValidationError("Aucun item dans ce tableau Monday", "MONDAY_API_EMPTY");
  }

  const columns = board.columns ?? [];
  const statusCol = findColumnByType(columns, "status");
  const dateCol = findColumnByType(columns, "date");
  const timelineCol = findColumnByType(columns, "timeline");

  const groupTitles = new Map<string, string>();
  for (const g of board.groups ?? []) {
    groupTitles.set(g.id, g.title?.trim() || "Général");
  }

  const phaseMap = new Map<string, SyncSnapshotPhase>();
  const tasks: SyncSnapshotTask[] = [];
  const warnings: string[] = [];

  if (!statusCol) {
    warnings.push("Colonne Status introuvable — statut par défaut « active »");
  }

  let order = 0;
  for (const item of items) {
    const groupId = item.group?.id ?? "default";
    const groupTitle = item.group?.title?.trim() || groupTitles.get(groupId) || "Général";
    const phaseExternalId = normalizePhaseKey(`group:${groupId}`);
    if (!phaseMap.has(phaseExternalId)) {
      phaseMap.set(phaseExternalId, {
        externalId: phaseExternalId,
        name: groupTitle,
        order: order++,
      });
    }

    const task = mapItemToTask(item, phaseExternalId, statusCol?.id, dateCol?.id, timelineCol?.id);
    if (task) tasks.push(task);

    for (const sub of item.subitems ?? []) {
      const subTask = mapItemToTask(
        sub,
        phaseExternalId,
        statusCol?.id,
        dateCol?.id,
        timelineCol?.id,
        item.id,
      );
      if (subTask) tasks.push(subTask);
    }
  }

  return {
    snapshot: {
      provider: "monday",
      connectionId: connection.id,
      projectExternalId: boardId,
      projectName: projectName?.trim() || board.name?.trim() || "Monday",
      phases: [...phaseMap.values()].sort((a, b) => a.order - b.order),
      tasks,
    },
    mappingReport: {
      nativeFields: {
        title: "name",
        phase: "group",
        status: statusCol?.title,
        due: dateCol?.title ?? timelineCol?.title,
      },
      warnings,
    },
  };
}

/** Builds a SyncSnapshot from a Monday CSV export buffer (no API). */
export function buildMondayCsvSnapshot(
  buffer: Buffer,
  projectName: string,
): { snapshot: SyncSnapshot; mappingReport: MondayMappingReport } {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new ValidationError("Fichier CSV Monday vide ou invalide", "IMPORT_MONDAY_INVALID");
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const nameIdx = headers.findIndex((h) => h === "name" || h === "item_name" || h === "nom");
  const groupIdx = headers.findIndex((h) => h === "group" || h === "groupe" || h === "group_name");
  const statusIdx = headers.findIndex((h) => h === "status" || h === "statut");
  const dateIdx = headers.findIndex(
    (h) => h === "date" || h === "due_date" || h === "echeance" || h === "deadline",
  );

  if (nameIdx < 0) {
    throw new ValidationError(
      "Colonne Name introuvable — exportez le tableau Monday en CSV",
      "IMPORT_MONDAY_INVALID",
    );
  }

  const phaseMap = new Map<string, SyncSnapshotPhase>();
  const tasks: SyncSnapshotTask[] = [];
  let currentGroup = "Général";
  let order = 0;
  let rowIndex = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.every((f) => !f.trim())) continue;

    const first = fields[0]?.trim() ?? "";
    if (first.toLowerCase().startsWith("group:") || first.toLowerCase().startsWith("groupe:")) {
      currentGroup = first.split(":").slice(1).join(":").trim() || "Général";
      continue;
    }

    const title = (fields[nameIdx] ?? "").trim();
    if (!title) continue;

    const groupName =
      groupIdx >= 0 ? (fields[groupIdx] ?? "").trim() || currentGroup : currentGroup;
    const phaseExternalId = normalizePhaseKey(groupName);
    if (!phaseMap.has(phaseExternalId)) {
      phaseMap.set(phaseExternalId, {
        externalId: phaseExternalId,
        name: groupName,
        order: order++,
      });
    }

    const statusRaw = statusIdx >= 0 ? (fields[statusIdx] ?? "").trim() : "";
    const deadlineRaw = dateIdx >= 0 ? (fields[dateIdx] ?? "").trim().slice(0, 10) : null;
    const deadline = deadlineRaw && /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw) ? deadlineRaw : null;

    tasks.push({
      externalId: `csv-row:${rowIndex++}`,
      phaseExternalId,
      title,
      priority: "medium",
      effort: "medium",
      status: mapMondayStatus(statusRaw),
      startDate: null,
      deadline,
      tags: [],
      assigneeUid: null,
      blockedByExternalIds: [],
    });
  }

  if (tasks.length === 0) {
    throw new ValidationError("Aucune tâche trouvée dans le CSV Monday", "IMPORT_MONDAY_EMPTY");
  }

  return {
    snapshot: {
      provider: "monday",
      projectExternalId: `monday-csv:${normalizeHeader(projectName)}`,
      projectName: projectName.trim() || "Monday",
      phases: [...phaseMap.values()].sort((a, b) => a.order - b.order),
      tasks,
    },
    mappingReport: {
      nativeFields: {
        title: headers[nameIdx],
        phase: groupIdx >= 0 ? headers[groupIdx] : "group sections",
        status: statusIdx >= 0 ? headers[statusIdx] : undefined,
        due: dateIdx >= 0 ? headers[dateIdx] : undefined,
      },
      warnings: statusIdx < 0 ? ["Colonne Status absente — statut par défaut « active »"] : [],
    },
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ─── Monday import routing (boards / docs → project | database | document) ───

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

function mondayColumnToDbType(type: string): DatabaseColumnType {
  switch (type) {
    case "status":
      return "select";
    case "date":
    case "timeline":
      return "date";
    case "numbers":
      return "number";
    case "checkbox":
      return "checkbox";
    case "email":
      return "email";
    case "phone":
      return "phone";
    default:
      return "text";
  }
}

function extractMondayDbValue(
  col: MondayColumnValue | undefined,
  colType: DatabaseColumnType,
): string | number | boolean | null {
  if (!col) return null;
  if (colType === "checkbox") {
    if (col.value) {
      try {
        const parsed = JSON.parse(col.value) as { checked?: boolean };
        return parsed.checked === true;
      } catch {
        /* ignore */
      }
    }
    const t = col.text?.trim().toLowerCase();
    return t === "v" || t === "true" || t === "yes";
  }
  if (colType === "number") {
    const n = parseFloat(col.text ?? "");
    if (Number.isFinite(n)) return n;
    return null;
  }
  if (colType === "date") return parseMondayDateValue(col);
  const text = col.text?.trim();
  return text || null;
}

function collectSelectOptions(items: MondayItem[], columnId: string): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const v = getColumnValue(item, columnId)?.text?.trim();
    if (v) set.add(v);
  }
  return [...set].sort();
}

/** Unified catalogue of Monday boards and docs with import destination hints. */
export async function listMondayImportSources(
  connection: ExternalConnection,
): Promise<{ sources: MondayImportSource[]; docsScopeMissing: boolean }> {
  const sources: MondayImportSource[] = [];
  let docsScopeMissing = false;

  try {
    const docData = await mondayGraphqlDocs<{
      docs: Array<{
        id: string;
        object_id: string;
        name: string;
        url?: string | null;
        blocks?: Array<{ type?: string | null }> | null;
      }>;
    }>(
      connection,
      `query {
        docs(limit: 100) {
          id object_id name url
          blocks(limit: 50) { type }
        }
      }`,
    );

    for (const d of docData.docs ?? []) {
      const hasTable = (d.blocks ?? []).some((b) => b.type === "table");
      sources.push({
        id: String(d.id),
        name: d.name?.trim() || "Sans titre",
        kind: "doc",
        suggestedTarget: hasTable ? "database" : "document",
        hasTable,
        url: d.url ?? null,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("docs:read") || msg.includes("MONDAY_DOCS_SCOPE_MISSING")) {
      docsScopeMissing = true;
    }
    console.warn("[monday-api] docs list skipped for sources:", err);
  }

  const boards = await listMondayBoards(connection);

  for (const b of boards) {
    sources.push({
      id: b.id,
      name: b.name,
      kind: "board",
      suggestedTarget: "project",
    });
  }

  return {
    sources: sources.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    docsScopeMissing,
  };
}

/** Maps a Monday board (items + columns) to a Wroket Base snapshot. */
export async function buildMondayBoardDataSnapshot(
  connection: ExternalConnection,
  boardId: string,
  databaseName?: string,
): Promise<{ snapshot: DataSyncSnapshot; mappingReport: MondayDataMappingReport }> {
  const board = await fetchAllBoardItems(connection, boardId);
  const items = board.items_page?.items ?? [];
  if (items.length === 0) {
    throw new ValidationError("Aucune ligne dans ce tableau Monday", "MONDAY_API_EMPTY");
  }

  const mondayCols = (board.columns ?? []).filter((c) => c.type !== "name");
  const columns: DatabaseColumnDef[] = [
    {
      id: crypto.randomUUID(),
      name: "Nom",
      type: "text",
      externalKey: "monday-col:name",
    },
  ];

  for (const mc of mondayCols.slice(0, 29)) {
    const colType = mondayColumnToDbType(mc.type);
    const col: DatabaseColumnDef = {
      id: crypto.randomUUID(),
      name: mc.title?.trim() || mc.id,
      type: colType,
      externalKey: `monday-col:${mc.id}`,
    };
    if (colType === "select") {
      col.options = collectSelectOptions(items, mc.id);
    }
    columns.push(col);
  }

  const rows: DataSyncSnapshotRow[] = [];
  for (const item of items) {
    const values: Record<string, string | number | boolean | null> = {};
    values[columns[0].id] = item.name?.trim() || null;
    for (let i = 1; i < columns.length; i++) {
      const col = columns[i];
      const mc = mondayCols.find((c) => `monday-col:${c.id}` === col.externalKey);
      values[col.id] = extractMondayDbValue(
        getColumnValue(item, mc?.id),
        col.type,
      );
    }
    rows.push({ externalId: `monday-item:${item.id}`, values });
  }

  const sourceDatabaseId = `monday-board:${boardId}`;
  return {
    snapshot: {
      provider: "monday",
      connectionId: connection.id,
      sourceDatabaseId,
      sourceLabel: databaseName?.trim() || board.name?.trim() || "Monday",
      columns,
      rows,
    },
    mappingReport: { warnings: [] },
  };
}

/** Maps tables inside a Monday doc (markdown export) to a Wroket Base snapshot. */
export async function buildMondayDocDataSnapshot(
  connection: ExternalConnection,
  docId: string,
  databaseName?: string,
): Promise<{ snapshot: DataSyncSnapshot; mappingReport: MondayDataMappingReport }> {
  const allDocs = await listMondayDocs(connection);
  const meta = allDocs.find((d) => d.id === docId);
  if (!meta) {
    throw new ValidationError("Document Monday introuvable", "MONDAY_API_INVALID");
  }

  const { markdown, warning } = await exportMondayDocMarkdown(connection, docId);
  const tables = parseMarkdownTables(markdown);
  const warnings: string[] = [];
  if (warning) warnings.push(warning);

  if (tables.length === 0) {
    throw new ValidationError(
      "Aucun tableau détecté dans ce document Monday — importez-le comme Note ou choisissez un tableau Monday",
      "MONDAY_DOC_NO_TABLE",
    );
  }
  if (tables.length > 1) {
    warnings.push(`${tables.length} tableaux détectés — seul le premier sera importé`);
  }

  const table = tables[0];
  const headers = table.headers.map((h, i) => h.trim() || `Colonne ${i + 1}`);
  const columns: DatabaseColumnDef[] = headers.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    type: "text" as const,
    externalKey: `monday-md-col:${normalizeHeader(name) || `col_${i}`}`,
  }));

  const rows: DataSyncSnapshotRow[] = [];
  for (let ri = 0; ri < table.rows.length; ri++) {
    const rowCells = table.rows[ri];
    const values: Record<string, string | number | boolean | null> = {};
    for (let ci = 0; ci < columns.length; ci++) {
      const cell = rowCells[ci]?.trim();
      values[columns[ci].id] = cell || null;
    }
    rows.push({ externalId: `monday-doc-row:${docId}:${ri}`, values });
  }

  if (rows.length === 0) {
    throw new ValidationError("Tableau vide dans ce document Monday", "MONDAY_API_EMPTY");
  }

  const sourceDatabaseId = `monday-doc:${docId}`;
  return {
    snapshot: {
      provider: "monday",
      connectionId: connection.id,
      sourceDatabaseId,
      sourceLabel: databaseName?.trim() || meta.name,
      columns,
      rows,
    },
    mappingReport: { warnings },
  };
}

// ─── Monday Docs (Workdocs → Wroket Documents) ───────────────────────────────

const MAX_DOCS_PER_SYNC = 20;
const MAX_DOC_MARKDOWN_CHARS = 400_000;
const MONDAY_API_VERSION = "2025-10";

export interface MondayDocSummary {
  id: string;
  objectId: string;
  name: string;
  workspaceId: string | null;
  updatedAt: string | null;
  url: string | null;
}

export interface MondayDocSnapshotRow {
  externalId: string;
  objectId: string;
  title: string;
  markdown: string;
  contentHtml: string;
  workspaceId: string | null;
  sourceUrl: string | null;
  updatedAt: string | null;
  exportWarning?: string;
}

export interface MondayDocSnapshot {
  provider: "monday";
  connectionId: string;
  docs: MondayDocSnapshotRow[];
}

export interface MondayDocMappingReport {
  warnings: string[];
}

function isDocsScopeError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("docs:read") || m.includes("unauthorized") || m.includes("permission");
}

async function mondayGraphqlDocs<T>(
  connection: ExternalConnection,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: mondayAuthHeader(connection.accessToken),
      "Content-Type": "application/json",
      "API-Version": MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[monday-api] Docs HTTP error:", body);
    throw new ValidationError(
      "Erreur API Monday Docs — vérifiez le scope docs:read et reconnectez",
      "MONDAY_DOCS_SCOPE_MISSING",
    );
  }
  const json = (await res.json()) as MondayGraphQLResponse<T>;
  if (json.errors?.length) {
    const msg = json.errors[0]?.message ?? "Erreur API Monday Docs";
    console.error("[monday-api] Docs GraphQL errors:", json.errors);
    if (isDocsScopeError(msg)) {
      throw new ValidationError(
        "Permission docs:read manquante — activez le scope dans Monday Dev et reconnectez Wroket",
        "MONDAY_DOCS_SCOPE_MISSING",
      );
    }
    throw new ValidationError(msg, "MONDAY_API_ERROR");
  }
  if (!json.data) {
    throw new ValidationError("Réponse API Monday Docs vide", "MONDAY_API_ERROR");
  }
  return json.data;
}

export async function listMondayDocs(
  connection: ExternalConnection,
  workspaceId?: string | null,
): Promise<MondayDocSummary[]> {
  const ws = workspaceId?.trim();
  const query = ws
    ? `query ($workspaceIds: [ID!]) {
        docs(limit: 100, workspace_ids: $workspaceIds) {
          id object_id name workspace_id updated_at url
        }
      }`
    : `query {
        docs(limit: 100) {
          id object_id name workspace_id updated_at url
        }
      }`;
  const variables = ws ? { workspaceIds: [ws] } : undefined;
  const data = await mondayGraphqlDocs<{ docs: Array<{
    id: string;
    object_id: string;
    name: string;
    workspace_id?: string | null;
    updated_at?: string | null;
    url?: string | null;
  }> }>(connection, query, variables);

  return (data.docs ?? []).map((d) => ({
    id: String(d.id),
    objectId: String(d.object_id),
    name: d.name?.trim() || "Sans titre",
    workspaceId: d.workspace_id != null ? String(d.workspace_id) : null,
    updatedAt: d.updated_at ?? null,
    url: d.url ?? null,
  }));
}

async function exportMondayDocMarkdown(
  connection: ExternalConnection,
  docId: string,
): Promise<{ markdown: string; warning?: string }> {
  const data = await mondayGraphqlDocs<{
    export_markdown_from_doc: { success: boolean; markdown?: string | null; error?: string | null };
  }>(
    connection,
    `query ($docId: ID!) {
      export_markdown_from_doc(docId: $docId) {
        success
        markdown
        error
      }
    }`,
    { docId },
  );

  const result = data.export_markdown_from_doc;
  if (!result?.success) {
    throw new ValidationError(
      result?.error ?? "Export markdown du document Monday impossible",
      "MONDAY_DOC_EXPORT_FAILED",
    );
  }

  let markdown = result.markdown ?? "";
  let warning: string | undefined;
  if (markdown.length > MAX_DOC_MARKDOWN_CHARS) {
    markdown = markdown.slice(0, MAX_DOC_MARKDOWN_CHARS);
    warning = "Contenu tronqué (document Monday très volumineux)";
  }
  return { markdown, warning };
}

export async function buildMondayDocsSnapshot(
  connection: ExternalConnection,
  docIds: string[],
): Promise<{ snapshot: MondayDocSnapshot; mappingReport: MondayDocMappingReport }> {
  const uniqueIds = [...new Set(docIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new ValidationError("Sélectionnez au moins un document Monday", "MONDAY_API_INVALID");
  }
  if (uniqueIds.length > MAX_DOCS_PER_SYNC) {
    throw new ValidationError(
      `Maximum ${MAX_DOCS_PER_SYNC} documents par import`,
      "MONDAY_API_INVALID",
    );
  }

  const { markdownToHtml } = await import("../utils/markdownToHtml");
  const allDocs = await listMondayDocs(connection);
  const byId = new Map(allDocs.map((d) => [d.id, d]));
  const warnings: string[] = [];
  const rows: MondayDocSnapshotRow[] = [];

  for (const docId of uniqueIds) {
    const meta = byId.get(docId);
    if (!meta) {
      warnings.push(`Document ${docId} introuvable ou inaccessible`);
      continue;
    }
    try {
      const { markdown, warning } = await exportMondayDocMarkdown(connection, docId);
      if (warning) warnings.push(`${meta.name}: ${warning}`);
      rows.push({
        externalId: meta.id,
        objectId: meta.objectId,
        title: meta.name,
        markdown,
        contentHtml: markdownToHtml(markdown),
        workspaceId: meta.workspaceId,
        sourceUrl: meta.url,
        updatedAt: meta.updatedAt,
        exportWarning: warning,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "export failed";
      warnings.push(`${meta.name}: ${msg}`);
      if (meta.url) {
        rows.push({
          externalId: meta.id,
          objectId: meta.objectId,
          title: meta.name,
          markdown: "",
          contentHtml: `<p><em>Contenu non exporté.</em> <a href="${meta.url}" rel="noopener noreferrer">Ouvrir dans Monday</a></p>`,
          workspaceId: meta.workspaceId,
          sourceUrl: meta.url,
          updatedAt: meta.updatedAt,
          exportWarning: msg,
        });
      }
    }
  }

  if (rows.length === 0) {
    throw new ValidationError("Aucun document Monday importable", "MONDAY_API_EMPTY");
  }

  return {
    snapshot: {
      provider: "monday",
      connectionId: connection.id,
      docs: rows,
    },
    mappingReport: { warnings },
  };
}
