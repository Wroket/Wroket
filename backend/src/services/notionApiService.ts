/**
 * Notion API client — list databases, pull pages, map to SyncSnapshot.
 */

import crypto from "crypto";
import { ValidationError, UnprocessableEntityError } from "../utils/errors";
import type { ExternalConnection } from "./externalConnectionService";
import type { DatabaseColumnDef, DatabaseColumnType } from "./userDatabaseService";
import {
  normalizePhaseKey,
  type SyncSnapshot,
  type SyncSnapshotPhase,
  type SyncSnapshotTask,
  type SyncCustomFieldDef,
  type SyncSnapshotMilestone,
} from "./externalSyncService";
import { mapNotionEffort, mapNotionPriority, mapNotionStatus } from "./notionImportService";
import type { CustomFieldType } from "./projectService";

const NOTION_VERSION = "2022-06-28";
const MAX_PAGES = 1000;
const MAX_SELECT_OPTIONS = 20;

export type NotionDatabaseKind = "project" | "contacts" | "data" | "ambiguous";

export interface NotionDatabaseSummary {
  id: string;
  title: string;
  propertyNames: string[];
  suggestedKind: NotionDatabaseKind;
  kindScore: number;
}

/** Report returned in preview-sync for mapping transparency. */
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

export const NOTION_EFFORT_PROPERTY_CANDIDATES = [
  "effort_level",
  "effortlevel",
  "effort",
  "charge",
  "size",
  "taille",
  "niveau_effort",
  "niveau_deffort",
] as const;

export const NOTION_PRIORITY_PROPERTY_CANDIDATES = [
  "priority_level",
  "prioritylevel",
  "priority",
  "priorite",
  "priorité",
  "niveau_priorite",
] as const;

export const NOTION_DUE_PROPERTY_CANDIDATES = [
  "due_date",
  "due",
  "deadline",
  "echeance",
  "échéance",
  "date",
] as const;

export const NOTION_DESCRIPTION_PROPERTY_CANDIDATES = [
  "description",
  "notes",
  "note",
  "body",
  "details",
  "comment",
  "comments",
] as const;

interface NotionRichText {
  plain_text?: string;
}

interface NotionProperty {
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  number?: number | null;
  select?: { name?: string } | null;
  multi_select?: { name: string }[];
  status?: { name?: string } | null;
  date?: { start?: string | null; end?: string | null } | null;
  checkbox?: boolean;
  relation?: { id: string }[];
  email?: string | null;
  phone_number?: string | null;
}

interface NotionDatabasePropertySchema {
  type: string;
  name?: string;
  select?: { options?: { name?: string }[] };
  status?: { options?: { name?: string }[] };
  phone_number?: unknown;
  email?: unknown;
}

interface NotionDatabase {
  id: string;
  title?: NotionRichText[];
  properties: Record<string, NotionDatabasePropertySchema>;
}

interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

export function normalizeNotionPropName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/** Merges select option lists (deduped, capped). */
export function mergeSelectOptionLists(base: string[], additions: string[]): string[] {
  const set = new Set(base.map((o) => o.trim()).filter(Boolean));
  for (const a of additions) {
    const t = a.trim();
    if (t) set.add(t);
  }
  return [...set].slice(0, MAX_SELECT_OPTIONS);
}

/** Reads all select/status options from a Notion database schema. */
export function buildSchemaSelectOptions(db: NotionDatabase): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [propName, schema] of Object.entries(db.properties ?? {})) {
    if (schema.type === "select" && schema.select?.options?.length) {
      const opts = schema.select.options
        .map((o) => o.name?.trim())
        .filter((n): n is string => !!n);
      if (opts.length) map.set(propName, opts);
    }
    if (schema.type === "status" && schema.status?.options?.length) {
      const opts = schema.status.options
        .map((o) => o.name?.trim())
        .filter((n): n is string => !!n);
      if (opts.length) map.set(propName, opts);
    }
  }
  return map;
}

function plainTextFromRich(arr?: NotionRichText[]): string {
  if (!arr?.length) return "";
  return arr.map((t) => t.plain_text ?? "").join("").trim();
}

async function notionFetch<T>(
  connection: ExternalConnection,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[notion-api] %s failed: %s", path, body);
    throw new ValidationError("Erreur API Notion — vérifiez les droits de la connexion", "NOTION_API_ERROR");
  }
  return res.json() as Promise<T>;
}

function databaseTitle(db: NotionDatabase): string {
  const t = plainTextFromRich(db.title);
  return t || "Notion";
}

const NOTION_TITLE_CONTACT_KEYWORDS = ["people", "person", "contact", "client", "crm"] as const;

const NOTION_COMPANY_PROP_KEYS = new Set([
  "company",
  "entreprise",
  "organization",
  "organisation",
  "org",
]);

const NOTION_DATE_TASK_PROP_FRAGMENTS = ["due", "deadline", "start", "echeance", "debut"];

const NOTION_TASK_STATUS_PATTERNS = [
  "done",
  "in_progress",
  "inprogress",
  "to_do",
  "todo",
  "not_started",
  "notstarted",
  "blocked",
  "complete",
  "completed",
];

const NOTION_EFFORT_PRIORITY_FRAGMENTS = ["effort", "priority", "priorite", "charge"];

function statusOptionsFromSchema(schema: NotionDatabasePropertySchema): string[] {
  if (schema.type === "select" && schema.select?.options?.length) {
    return schema.select.options.map((o) => o.name?.trim() ?? "").filter(Boolean);
  }
  if (schema.type === "status" && schema.status?.options?.length) {
    return schema.status.options.map((o) => o.name?.trim() ?? "").filter(Boolean);
  }
  return [];
}

function hasTaskLikeStatusOptions(options: string[]): boolean {
  return options.some((opt) => {
    const norm = normalizeNotionPropName(opt);
    return NOTION_TASK_STATUS_PATTERNS.some((p) => norm.includes(p));
  });
}

/**
 * Heuristic score for distinguishing Notion People/CRM bases from task/project databases.
 * See docs/contacts-notion-v1.md §5.
 */
export function detectNotionDatabaseKind(
  title: string,
  properties: Record<string, NotionDatabasePropertySchema>,
): { suggestedKind: NotionDatabaseKind; kindScore: number } {
  let score = 0;
  const titleNorm = normalizeNotionPropName(title);

  if (NOTION_TITLE_CONTACT_KEYWORDS.some((k) => titleNorm.includes(k))) {
    score += 2;
  }

  for (const [propName, schema] of Object.entries(properties ?? {})) {
    const norm = normalizeNotionPropName(propName);
    const type = schema.type;

    if (type === "email") score += 3;
    if (type === "phone_number") score += 2;

    if (
      NOTION_COMPANY_PROP_KEYS.has(norm)
      || norm.includes("company")
      || norm.includes("organisation")
      || norm.includes("organization")
    ) {
      score += 2;
    }

    if (type === "date" && NOTION_DATE_TASK_PROP_FRAGMENTS.some((f) => norm.includes(f))) {
      score -= 2;
    }

    if (type === "status" || type === "select") {
      const options = statusOptionsFromSchema(schema);
      if (options.length > 0 && hasTaskLikeStatusOptions(options)) {
        score -= 2;
      }
    }

    if (NOTION_EFFORT_PRIORITY_FRAGMENTS.some((f) => norm.includes(f))) {
      score -= 1;
    }
  }

  let suggestedKind: NotionDatabaseKind;
  if (score >= 4) suggestedKind = "contacts";
  else if (score <= 0) suggestedKind = "project";
  else suggestedKind = "ambiguous";

  return { suggestedKind, kindScore: score };
}

/** Fetches a Notion database and returns its detected kind. */
export async function getNotionDatabaseKind(
  connection: ExternalConnection,
  databaseId: string,
): Promise<{ suggestedKind: NotionDatabaseKind; kindScore: number; title: string }> {
  const db = await notionFetch<NotionDatabase>(connection, `/databases/${databaseId}`);
  const { suggestedKind, kindScore } = detectNotionDatabaseKind(databaseTitle(db), db.properties ?? {});
  return { suggestedKind, kindScore, title: databaseTitle(db) };
}

/** Blocks project sync when the database is clearly a People/CRM base. */
export function assertNotionDatabaseKindForProjectSync(kind: NotionDatabaseKind): void {
  if (kind !== "contacts") return;
  throw new UnprocessableEntityError(
    "Cette base Notion ressemble à un répertoire People — importez-la comme contacts, pas comme projet.",
    "NOTION_DATABASE_KIND_MISMATCH",
    { suggestedKind: "contacts", cta: "import_contacts" },
  );
}

/** Blocks contacts sync when the database is clearly a task/project base. */
export function assertNotionDatabaseKindForContactsSync(kind: NotionDatabaseKind): void {
  if (kind === "project") {
    throw new UnprocessableEntityError(
      "Cette base Notion ressemble à un projet — importez-la comme projet, pas comme contacts.",
      "NOTION_CONTACTS_KIND_MISMATCH",
      { suggestedKind: "project", cta: "import_project" },
    );
  }
}

/** Blocks data sync when the database is clearly People or project. */
export function assertNotionDatabaseKindForDataSync(kind: NotionDatabaseKind): void {
  if (kind === "contacts") {
    throw new UnprocessableEntityError(
      "Cette base Notion ressemble à un répertoire People — importez-la comme contacts.",
      "NOTION_DATA_KIND_MISMATCH",
      { suggestedKind: "contacts", cta: "import_contacts" },
    );
  }
  if (kind === "project") {
    throw new UnprocessableEntityError(
      "Cette base Notion ressemble à un projet — importez-la comme projet.",
      "NOTION_DATA_KIND_MISMATCH",
      { suggestedKind: "project", cta: "import_project" },
    );
  }
}

/** Lists databases the connected integration can access. */
export async function listNotionDatabases(connection: ExternalConnection): Promise<NotionDatabaseSummary[]> {
  const out: NotionDatabaseSummary[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filter: { value: "database", property: "object" },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const page = await notionFetch<{
      results: NotionDatabase[];
      has_more: boolean;
      next_cursor: string | null;
    }>(connection, "/search", { method: "POST", body: JSON.stringify(body) });

    for (const db of page.results) {
      if (!db.id) continue;
      const title = databaseTitle(db);
      const { suggestedKind, kindScore } = detectNotionDatabaseKind(title, db.properties ?? {});
      out.push({
        id: db.id,
        title,
        propertyNames: Object.keys(db.properties ?? {}),
        suggestedKind,
        kindScore,
      });
    }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function extractPropertyText(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return plainTextFromRich(prop.title);
    case "rich_text":
      return plainTextFromRich(prop.rich_text);
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "multi_select":
      return (prop.multi_select ?? []).map((o) => o.name).join(", ");
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "checkbox":
      return prop.checkbox ? "true" : "false";
    case "date":
      return prop.date?.start ?? "";
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    default:
      return "";
  }
}

export function findNotionPropertyKey(
  properties: Record<string, NotionProperty>,
  candidates: readonly string[],
): string | null {
  const keys = Object.keys(properties);
  for (const c of candidates) {
    const hit = keys.find((k) => normalizeNotionPropName(k) === c);
    if (hit) return hit;
  }
  return null;
}

function findTitlePropertyKey(properties: Record<string, NotionProperty>): string | null {
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type === "title") return key;
  }
  return findNotionPropertyKey(properties, ["name", "titre", "title", "task", "task_name"]);
}

function findPhasePropertyKey(properties: Record<string, NotionProperty>): string | null {
  const statusKey = findNotionPropertyKey(properties, ["status", "statut", "etat", "état"]);
  if (statusKey && (properties[statusKey].type === "status" || properties[statusKey].type === "select")) {
    return statusKey;
  }
  return findNotionPropertyKey(properties, ["phase", "group", "groupe", "category", "categorie", "section"]);
}

async function queryAllPages(connection: ExternalConnection, databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notionFetch<{
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    }>(connection, `/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...res.results);
    if (pages.length > MAX_PAGES) {
      throw new ValidationError(`Maximum ${MAX_PAGES} pages par base Notion`, "NOTION_API_LIMIT");
    }
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function mapPropertyToCustomField(
  propName: string,
  prop: NotionProperty,
): { def: SyncCustomFieldDef; value: string | number | boolean | null } | null {
  const externalKey = `notion-prop:${normalizePhaseKey(propName)}`;
  switch (prop.type) {
    case "rich_text":
    case "url":
    case "email":
    case "phone_number": {
      const text = extractPropertyText(prop);
      return { def: { externalKey, name: propName, type: "text" }, value: text || null };
    }
    case "number": {
      const n = prop.number;
      return {
        def: { externalKey, name: propName, type: "number" },
        value: typeof n === "number" && Number.isFinite(n) ? n : null,
      };
    }
    case "checkbox":
      return { def: { externalKey, name: propName, type: "checkbox" }, value: !!prop.checkbox };
    case "date": {
      const start = prop.date?.start;
      if (!start) return { def: { externalKey, name: propName, type: "date" }, value: null };
      const d = new Date(start);
      if (isNaN(d.getTime())) return null;
      return { def: { externalKey, name: propName, type: "date" }, value: d.toISOString().split("T")[0] };
    }
    case "select": {
      const opt = prop.select?.name ?? null;
      return {
        def: { externalKey, name: propName, type: "select", options: [] },
        value: opt,
      };
    }
    default:
      return null;
  }
}

/** Registers or updates a select custom field def with schema + runtime union. */
export function registerSelectCustomFieldDef(
  customDefsByKey: Map<string, SyncCustomFieldDef>,
  schemaSelectOptions: Map<string, string[]>,
  propName: string,
  externalKey: string,
  value: string | null,
): void {
  const schemaOpts = schemaSelectOptions.get(propName) ?? [];
  let def = customDefsByKey.get(externalKey);
  if (!def) {
    def = {
      externalKey,
      name: propName,
      type: "select",
      options: [...schemaOpts],
    };
    customDefsByKey.set(externalKey, def);
  }
  if (value) {
    def.options = mergeSelectOptionLists(def.options ?? schemaOpts, [value]);
  } else if (!def.options?.length && schemaOpts.length) {
    def.options = [...schemaOpts];
  }
}

export function buildNotionMappingReport(
  keys: {
    titleKey: string | null;
    phaseKey: string | null;
    priorityKey: string | null;
    effortKey: string | null;
    dueKey: string | null;
    startKey: string | null;
    tagsKey: string | null;
    blockedKey: string | null;
    descriptionKey: string | null;
  },
  customFieldDefs: SyncCustomFieldDef[],
): NotionMappingReport {
  const warnings: string[] = [];
  if (keys.effortKey) {
    warnings.push(`${keys.effortKey} → champ natif effort`);
  }
  if (keys.priorityKey) {
    warnings.push(`${keys.priorityKey} → champ natif priority`);
  }
  if (keys.dueKey) {
    warnings.push(`${keys.dueKey} → champ natif deadline (échéance)`);
  }
  if (keys.descriptionKey) {
    warnings.push(`${keys.descriptionKey} → commentaire tâche`);
  }
  return {
    nativeFields: {
      ...(keys.titleKey ? { title: keys.titleKey } : {}),
      ...(keys.phaseKey ? { phase: keys.phaseKey } : {}),
      ...(keys.priorityKey ? { priority: keys.priorityKey } : {}),
      ...(keys.effortKey ? { effort: keys.effortKey } : {}),
      ...(keys.dueKey ? { due: keys.dueKey } : {}),
      ...(keys.startKey ? { start: keys.startKey } : {}),
      ...(keys.tagsKey ? { tags: keys.tagsKey } : {}),
      ...(keys.blockedKey ? { blockedBy: keys.blockedKey } : {}),
      ...(keys.descriptionKey ? { description: keys.descriptionKey } : {}),
    },
    customFields: customFieldDefs.map((d) => ({
      name: d.name,
      type: d.type,
      optionCount: d.type === "select" ? (d.options?.length ?? 0) : 0,
    })),
    warnings,
  };
}

function isMilestonePropertyName(name: string): boolean {
  const n = normalizeNotionPropName(name);
  return n.includes("jalon") || n.includes("milestone") || n.includes("key_date");
}

function parseIsoDate(value: string): string | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

export interface BuildNotionSnapshotResult {
  snapshot: SyncSnapshot;
  mappingReport: NotionMappingReport;
}

/**
 * Pulls all pages from a Notion database and builds an ExtendedSyncSnapshot
 * ready for computeSyncDiff / applySyncDiff.
 */
export async function buildNotionDatabaseSnapshot(
  connection: ExternalConnection,
  databaseId: string,
  projectName?: string,
): Promise<BuildNotionSnapshotResult> {
  const db = await notionFetch<NotionDatabase>(connection, `/databases/${databaseId}`);
  const pages = await queryAllPages(connection, databaseId);
  if (pages.length === 0) {
    throw new ValidationError("Aucune page dans cette base Notion", "NOTION_API_EMPTY");
  }

  const schemaSelectOptions = buildSchemaSelectOptions(db);
  const sampleProps = pages[0].properties;
  const titleKey = findTitlePropertyKey(sampleProps);
  if (!titleKey) throw new ValidationError("Propriété titre introuvable dans la base Notion", "NOTION_API_INVALID");

  const phaseKey = findPhasePropertyKey(sampleProps);
  const priorityKey = findNotionPropertyKey(sampleProps, NOTION_PRIORITY_PROPERTY_CANDIDATES);
  const effortKey = findNotionPropertyKey(sampleProps, NOTION_EFFORT_PROPERTY_CANDIDATES);
  const dueKey = findNotionPropertyKey(sampleProps, NOTION_DUE_PROPERTY_CANDIDATES);
  const startKey = findNotionPropertyKey(sampleProps, ["start", "start_date", "debut", "début"]);
  const tagsKey = findNotionPropertyKey(sampleProps, ["tags", "etiquettes", "étiquettes", "labels"]);
  const descriptionKey = findNotionPropertyKey(sampleProps, NOTION_DESCRIPTION_PROPERTY_CANDIDATES);
  const blockedKey = findNotionPropertyKey(sampleProps, [
    "blocked_by", "blockedby", "bloque_par", "bloqué_par", "depends_on", "dependencies",
  ]);

  const reservedKeys = new Set(
    [titleKey, phaseKey, priorityKey, effortKey, dueKey, startKey, tagsKey, descriptionKey, blockedKey].filter(
      Boolean,
    ) as string[],
  );

  const customDefsByKey = new Map<string, SyncCustomFieldDef>();
  const phaseNames = new Map<string, string>();
  const tasks: SyncSnapshotTask[] = [];
  const milestones: SyncSnapshotMilestone[] = [];
  const relationBlockers = new Map<string, string[]>();

  for (const page of pages) {
    const props = page.properties;
    const title = extractPropertyText(props[titleKey]);
    if (!title) continue;

    let phaseName = "Général";
    if (phaseKey) {
      const raw = extractPropertyText(props[phaseKey]);
      if (raw) phaseName = raw;
    }
    const phaseExternalId = normalizePhaseKey(phaseName);
    phaseNames.set(phaseExternalId, phaseName);

    const priorityRaw = priorityKey ? extractPropertyText(props[priorityKey]) : "";
    const effortRaw = effortKey ? extractPropertyText(props[effortKey]) : "";
    const descriptionRaw = descriptionKey ? extractPropertyText(props[descriptionKey]) : "";
    const statusRaw = phaseKey && props[phaseKey]?.type === "status"
      ? extractPropertyText(props[phaseKey])
      : "";

    let deadline: string | null = null;
    if (dueKey && props[dueKey]?.type === "date") {
      deadline = parseIsoDate(props[dueKey].date?.start ?? "");
    }
    let startDate: string | null = null;
    if (startKey && props[startKey]?.type === "date") {
      startDate = parseIsoDate(props[startKey].date?.start ?? "");
    }

    const tags: string[] = [];
    if (tagsKey && props[tagsKey]?.type === "multi_select") {
      for (const t of props[tagsKey].multi_select ?? []) {
        if (t.name) tags.push(t.name.trim().toLowerCase());
      }
    }

    const customFieldValues: Record<string, string | number | boolean | null> = {};
    for (const [propName, prop] of Object.entries(props)) {
      if (reservedKeys.has(propName)) continue;
      if (prop.type === "relation" && blockedKey === propName) continue;
      if (prop.type === "date" && isMilestonePropertyName(propName)) {
        const d = parseIsoDate(prop.date?.start ?? "");
        if (d) {
          milestones.push({
            externalId: `milestone:${page.id}:${normalizeNotionPropName(propName)}`,
            title: `${title} — ${propName}`,
            date: d,
            phaseExternalId,
          });
        }
        continue;
      }
      const mapped = mapPropertyToCustomField(propName, prop);
      if (!mapped) continue;
      if (mapped.def.type === "select") {
        registerSelectCustomFieldDef(
          customDefsByKey,
          schemaSelectOptions,
          propName,
          mapped.def.externalKey,
          typeof mapped.value === "string" ? mapped.value : null,
        );
      } else if (!customDefsByKey.has(mapped.def.externalKey)) {
        customDefsByKey.set(mapped.def.externalKey, mapped.def);
      }
      customFieldValues[mapped.def.externalKey] = mapped.value;
    }

    const task: SyncSnapshotTask = {
      externalId: page.id,
      phaseExternalId,
      title,
      priority: mapNotionPriority(priorityRaw),
      effort: mapNotionEffort(effortRaw),
      status: mapNotionStatus(statusRaw || phaseName),
      startDate,
      deadline,
      tags: tags.slice(0, 10),
      assigneeUid: null,
      blockedByExternalIds: [],
      customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      ...(descriptionRaw.trim()
        ? { description: descriptionRaw.trim().substring(0, 2000) }
        : {}),
    };
    tasks.push(task);

    if (blockedKey && props[blockedKey]?.type === "relation") {
      relationBlockers.set(
        page.id,
        (props[blockedKey].relation ?? []).map((r) => r.id).filter(Boolean),
      );
    }
  }

  for (const task of tasks) {
    const blockers = relationBlockers.get(task.externalId) ?? [];
    task.blockedByExternalIds = blockers.filter((id) => id !== task.externalId);
  }

  const phases: SyncSnapshotPhase[] = [...phaseNames.entries()].map(([externalId, name], order) => ({
    externalId,
    name,
    order,
  }));

  const customFieldDefs = [...customDefsByKey.values()];
  const mappingReport = buildNotionMappingReport(
    { titleKey, phaseKey, priorityKey, effortKey, dueKey, startKey, tagsKey, blockedKey, descriptionKey },
    customFieldDefs,
  );

  const snapshot: SyncSnapshot = {
    provider: "notion",
    connectionId: connection.id,
    projectExternalId: databaseId,
    externalParentId: databaseId,
    projectName: projectName?.trim() || databaseTitle(db),
    phases,
    tasks,
    customFieldDefs,
    milestones,
  };

  return { snapshot, mappingReport };
}

// ── Contacts sync (People / CRM bases) ──

export interface ContactSyncSnapshotRow {
  externalId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  /** One-time import into Contact.notes (local, not overwritten on sync). */
  localNotes?: string;
}

export interface ContactSyncSnapshot {
  provider: "notion";
  connectionId: string;
  sourceDatabaseId: string;
  sourceLabel: string;
  contacts: ContactSyncSnapshotRow[];
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

const NOTION_CONTACT_FIRST_NAME_KEYS = ["first_name", "prenom", "prénom", "given_name"] as const;
const NOTION_CONTACT_LAST_NAME_KEYS = ["last_name", "nom", "family_name", "surname"] as const;
const NOTION_CONTACT_EMAIL_KEYS = ["email", "e_mail", "mail"] as const;
const NOTION_CONTACT_PHONE_KEYS = ["phone", "telephone", "téléphone", "mobile", "tel"] as const;
const NOTION_CONTACT_COMPANY_KEYS = [
  "company",
  "entreprise",
  "organization",
  "organisation",
  "org",
] as const;
const NOTION_CONTACT_TAGS_KEYS = ["tags", "labels", "etiquettes", "étiquettes", "type", "segment"] as const;

export interface ContactPropertyKeys {
  titleKey: string | null;
  firstNameKey: string | null;
  lastNameKey: string | null;
  emailKey: string | null;
  phoneKey: string | null;
  companyKey: string | null;
  tagsKey: string | null;
}

function findPropertyKeyByType(
  properties: Record<string, NotionProperty | NotionDatabasePropertySchema>,
  type: string,
): string | null {
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type === type) return key;
  }
  return null;
}

/** Discovers Notion property keys for contact field mapping. */
export function discoverContactPropertyKeys(
  properties: Record<string, NotionProperty>,
): ContactPropertyKeys {
  const titleKey = findTitlePropertyKey(properties);
  const firstNameKey = findNotionPropertyKey(properties, NOTION_CONTACT_FIRST_NAME_KEYS);
  const lastNameKey = findNotionPropertyKey(properties, NOTION_CONTACT_LAST_NAME_KEYS);

  let emailKey = findPropertyKeyByType(properties, "email");
  if (!emailKey) {
    emailKey = findNotionPropertyKey(properties, NOTION_CONTACT_EMAIL_KEYS);
  }

  let phoneKey = findPropertyKeyByType(properties, "phone_number");
  if (!phoneKey) {
    for (const key of Object.keys(properties)) {
      const norm = normalizeNotionPropName(key);
      if (
        properties[key]?.type === "phone_number"
        && NOTION_CONTACT_PHONE_KEYS.some((c) => norm.includes(c))
      ) {
        phoneKey = key;
        break;
      }
    }
  }

  let companyKey: string | null = null;
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop.type !== "rich_text" && prop.type !== "select") continue;
    const norm = normalizeNotionPropName(key);
    if (
      NOTION_COMPANY_PROP_KEYS.has(norm)
      || NOTION_CONTACT_COMPANY_KEYS.some((c) => norm === c || norm.includes(c))
    ) {
      companyKey = key;
      break;
    }
  }

  let tagsKey: string | null = null;
  for (const key of Object.keys(properties)) {
    if (properties[key]?.type === "multi_select") {
      const norm = normalizeNotionPropName(key);
      if (NOTION_CONTACT_TAGS_KEYS.some((c) => norm === c || norm.includes(c))) {
        tagsKey = key;
        break;
      }
    }
  }
  if (!tagsKey) {
    tagsKey = findPropertyKeyByType(properties, "multi_select");
  }

  return { titleKey, firstNameKey, lastNameKey, emailKey, phoneKey, companyKey, tagsKey };
}

function splitContactName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizeContactTagsFromNotion(prop: NotionProperty | undefined): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const t of prop.multi_select ?? []) {
    const tag = t.name?.trim().toLowerCase().slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 10) break;
  }
  return tags;
}

function normalizeSnapshotEmail(email: string | null): string | null {
  if (!email?.trim()) return null;
  return email.trim().toLowerCase();
}

/** Maps one Notion page to a contact snapshot row (skips rows without identity). */
export function mapNotionPageToContactRow(
  pageId: string,
  props: Record<string, NotionProperty>,
  keys: ContactPropertyKeys,
): ContactSyncSnapshotRow | null {
  let firstName = keys.firstNameKey ? extractPropertyText(props[keys.firstNameKey]).trim() : "";
  let lastName = keys.lastNameKey ? extractPropertyText(props[keys.lastNameKey]).trim() : "";

  if (!firstName && !lastName && keys.titleKey) {
    const split = splitContactName(extractPropertyText(props[keys.titleKey]));
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const email = normalizeSnapshotEmail(
    keys.emailKey ? extractPropertyText(props[keys.emailKey]) : null,
  );
  const phoneRaw = keys.phoneKey ? extractPropertyText(props[keys.phoneKey]).trim() : "";
  const phone = phoneRaw || null;
  const companyRaw = keys.companyKey ? extractPropertyText(props[keys.companyKey]).trim() : "";
  const company = companyRaw || null;
  const tags = keys.tagsKey ? normalizeContactTagsFromNotion(props[keys.tagsKey]) : [];

  const hasIdentity = Boolean(firstName || lastName || email || phone);
  if (!hasIdentity) return null;

  return {
    externalId: pageId,
    firstName: firstName.slice(0, 80),
    lastName: lastName.slice(0, 80),
    company: company ? company.slice(0, 120) : null,
    email,
    phone,
    tags,
  };
}

function buildContactMappingReport(keys: ContactPropertyKeys): ContactMappingReport {
  const warnings: string[] = [];
  const mappedFields: ContactMappingReport["mappedFields"] = {};

  if (keys.titleKey) mappedFields.name = keys.titleKey;
  if (keys.firstNameKey) mappedFields.firstName = keys.firstNameKey;
  if (keys.lastNameKey) mappedFields.lastName = keys.lastNameKey;
  if (keys.emailKey) mappedFields.email = keys.emailKey;
  else warnings.push("Colonne email introuvable — les contacts sans nom distinct pourront être moins fiables.");
  if (keys.phoneKey) mappedFields.phone = keys.phoneKey;
  else warnings.push("Colonne téléphone introuvable.");
  if (keys.companyKey) mappedFields.company = keys.companyKey;
  if (keys.tagsKey) mappedFields.tags = keys.tagsKey;

  if (!keys.titleKey && !keys.firstNameKey && !keys.lastNameKey) {
    warnings.push("Colonne nom introuvable — vérifiez que la base contient une propriété titre.");
  }

  return { mappedFields, warnings };
}

export interface BuildNotionContactsSnapshotResult {
  snapshot: ContactSyncSnapshot;
  mappingReport: ContactMappingReport;
}

/** Pulls all pages from a Notion People/CRM database into a ContactSyncSnapshot. */
export async function buildNotionContactsSnapshot(
  connection: ExternalConnection,
  databaseId: string,
  columnMapping?: ContactColumnMapping[],
): Promise<BuildNotionContactsSnapshotResult> {
  const db = await notionFetch<NotionDatabase>(connection, `/databases/${databaseId}`);
  const pages = await queryAllPages(connection, databaseId);
  if (pages.length === 0) {
    throw new ValidationError("Aucune page dans cette base Notion", "NOTION_API_EMPTY");
  }

  const sampleProps = pages[0].properties;
  const keys = discoverContactPropertyKeys(sampleProps);
  if (!keys.titleKey && !keys.firstNameKey && !keys.lastNameKey) {
    throw new ValidationError(
      "Propriété nom introuvable dans la base Notion",
      "NOTION_API_INVALID",
    );
  }

  const contacts = buildContactRowsFromPages(pages, keys, columnMapping);

  if (contacts.length === 0) {
    throw new ValidationError(
      "Aucun contact valide dans cette base Notion (nom, email ou téléphone requis)",
      "NOTION_API_EMPTY",
    );
  }

  const mappingReport = buildContactMappingReport(keys);
  const snapshot: ContactSyncSnapshot = {
    provider: "notion",
    connectionId: connection.id,
    sourceDatabaseId: databaseId,
    sourceLabel: databaseTitle(db),
    contacts,
  };

  return { snapshot, mappingReport };
}

// ── Generic data database sync ──

export interface DataSyncSnapshotRow {
  externalId: string;
  values: Record<string, string | number | boolean | null>;
}

export interface DataSyncSnapshot {
  provider: import("./externalRef").ExternalProvider;
  connectionId: string;
  sourceDatabaseId: string;
  sourceLabel: string;
  columns: DatabaseColumnDef[];
  rows: DataSyncSnapshotRow[];
}

function notionPropToColumnType(type: string): DatabaseColumnType | null {
  switch (type) {
    case "title":
    case "rich_text":
    case "url":
      return "text";
    case "number":
      return "number";
    case "date":
      return "date";
    case "select":
    case "status":
      return "select";
    case "checkbox":
      return "checkbox";
    case "email":
      return "email";
    case "phone_number":
      return "phone";
    case "multi_select":
      return "text";
    default:
      return null;
  }
}

function extractValueForDataColumn(
  prop: NotionProperty,
  colType: DatabaseColumnType,
): string | number | boolean | null {
  if (!prop) return null;
  if (colType === "checkbox") return Boolean(prop.checkbox);
  if (colType === "number") {
    const n = prop.number;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  if (colType === "date") {
    const start = prop.date?.start;
    if (!start) return null;
    const d = new Date(start);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  }
  const text = extractPropertyText(prop);
  return text.trim() || null;
}

function buildDataColumnsFromSchema(db: NotionDatabase): DatabaseColumnDef[] {
  const columns: DatabaseColumnDef[] = [];
  const schemaOpts = buildSchemaSelectOptions(db);
  for (const [propName, schema] of Object.entries(db.properties ?? {})) {
    const colType = notionPropToColumnType(schema.type);
    if (!colType) continue;
    const col: DatabaseColumnDef = {
      id: crypto.randomUUID(),
      name: propName,
      type: colType,
      externalKey: `notion-prop:${normalizeNotionPropName(propName)}`,
    };
    if (colType === "select") {
      col.options = schemaOpts.get(propName) ?? [];
    }
    columns.push(col);
    if (columns.length >= 30) break;
  }
  return columns;
}

function mapPageToDataRow(
  pageId: string,
  props: Record<string, NotionProperty>,
  columns: DatabaseColumnDef[],
  db: NotionDatabase,
): DataSyncSnapshotRow {
  const values: Record<string, string | number | boolean | null> = {};
  const propEntries = Object.entries(db.properties ?? {});
  for (const col of columns) {
    const normKey = col.externalKey?.replace("notion-prop:", "") ?? "";
    const propEntry = propEntries.find(([name]) => normalizeNotionPropName(name) === normKey);
    if (!propEntry) continue;
    const prop = props[propEntry[0]];
    values[col.id] = extractValueForDataColumn(prop, col.type);
    if (col.type === "select" && typeof values[col.id] === "string" && col.options) {
      const v = values[col.id] as string;
      if (v && !col.options.includes(v)) {
        col.options = mergeSelectOptionLists(col.options, [v]);
      }
    }
  }
  return { externalId: pageId, values };
}

/** Pulls a generic Notion database into a DataSyncSnapshot for user databases. */
export async function buildNotionDataSnapshot(
  connection: ExternalConnection,
  databaseId: string,
): Promise<{ snapshot: DataSyncSnapshot }> {
  const db = await notionFetch<NotionDatabase>(connection, `/databases/${databaseId}`);
  const pages = await queryAllPages(connection, databaseId);
  if (pages.length === 0) {
    throw new ValidationError("Aucune page dans cette base Notion", "NOTION_API_EMPTY");
  }

  const columns = buildDataColumnsFromSchema(db);
  if (columns.length === 0) {
    throw new ValidationError("Aucune colonne mappable dans cette base Notion", "NOTION_API_INVALID");
  }

  const rows: DataSyncSnapshotRow[] = [];
  for (const page of pages) {
    rows.push(mapPageToDataRow(page.id, page.properties, columns, db));
  }

  const snapshot: DataSyncSnapshot = {
    provider: "notion",
    connectionId: connection.id,
    sourceDatabaseId: databaseId,
    sourceLabel: databaseTitle(db),
    columns,
    rows,
  };

  return { snapshot };
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

/** Lists Notion property names from a database for mapping UI. */
export async function listNotionDatabaseProperties(
  connection: ExternalConnection,
  databaseId: string,
): Promise<string[]> {
  const db = await notionFetch<NotionDatabase>(connection, `/databases/${databaseId}`);
  return Object.keys(db.properties ?? {});
}

/** Builds contact rows with optional manual column mapping. */
export function buildContactRowsFromPages(
  pages: NotionPage[],
  keys: ContactPropertyKeys,
  mapping?: ContactColumnMapping[],
): ContactSyncSnapshotRow[] {
  const contacts: ContactSyncSnapshotRow[] = [];
  for (const page of pages) {
    let row: ContactSyncSnapshotRow | null;
    if (mapping?.length) {
      row = mapNotionPageWithMapping(page.id, page.properties, keys, mapping);
    } else {
      row = mapNotionPageToContactRow(page.id, page.properties, keys);
    }
    if (row) contacts.push(row);
  }
  return contacts;
}

function mapNotionPageWithMapping(
  pageId: string,
  props: Record<string, NotionProperty>,
  keys: ContactPropertyKeys,
  mapping: ContactColumnMapping[],
): ContactSyncSnapshotRow | null {
  let firstName = "";
  let lastName = "";
  let email: string | null = null;
  let phone: string | null = null;
  let company: string | null = null;
  const tags: string[] = [];
  const notesParts: string[] = [];

  for (const m of mapping) {
    const prop = props[m.notionProperty];
    if (!prop || m.target === "ignore") continue;
    const text = extractPropertyText(prop).trim();
    switch (m.target) {
      case "firstName":
        firstName = text.slice(0, 80);
        break;
      case "lastName":
        lastName = text.slice(0, 80);
        break;
      case "email":
        email = normalizeSnapshotEmail(text);
        break;
      case "phone":
        phone = text || null;
        break;
      case "company":
        company = text ? text.slice(0, 120) : null;
        break;
      case "tags":
        if (prop.type === "multi_select") tags.push(...normalizeContactTagsFromNotion(prop));
        else if (text) tags.push(text.toLowerCase().slice(0, 40));
        break;
      case "notes":
        if (text) notesParts.push(text);
        break;
      default:
        break;
    }
  }

  if (!firstName && !lastName && keys.titleKey) {
    const split = splitContactName(extractPropertyText(props[keys.titleKey]));
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const hasIdentity = Boolean(firstName || lastName || email || phone);
  if (!hasIdentity) return null;

  return {
    externalId: pageId,
    firstName,
    lastName,
    company,
    email,
    phone,
    tags: tags.slice(0, 10),
    ...(notesParts.length ? { localNotes: notesParts.join("\n\n").slice(0, 5000) } : {}),
  };
}
