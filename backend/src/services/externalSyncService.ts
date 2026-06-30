/**
 * externalSyncService — provider-agnostic, unidirectional (pull) sync engine.
 *
 * Turns an external snapshot (Notion database, Monday board, Notion ZIP export)
 * into an idempotent upsert against Wroket projects/phases/tasks.
 *
 * Guarantees (data-safety, non-negotiable):
 *  - Idempotent: re-running the same snapshot creates no duplicates. Matching is
 *    keyed on the stable external id stored in each entity's `externalRef`.
 *  - Bounded mirror: only fields *owned by the source* are overwritten on update
 *    (title, status, priority, effort, dates, tags, phase membership). Everything
 *    else (scheduled slots, comments, notes, sort order, local-only tasks) is left
 *    untouched.
 *  - Orphans are never deleted: an entity that previously came from the source but
 *    is no longer present in the snapshot is reported, not removed. Wroket-native
 *    entities (no externalRef) are never reported as orphans and never modified.
 */

import crypto from "crypto";

import { ExternalProvider, ExternalRef } from "./externalRef";
import {
  createProject,
  updateProject,
  addPhase,
  updatePhase,
  addCustomFieldDef,
  updateCustomFieldDef,
  addMilestone,
  updateMilestone,
  getProjectById,
  findProjectByExternalRef,
  touchProjectExternalRef,
  type Project,
  type ProjectPhase,
  type CustomFieldType,
} from "./projectService";
import {
  createTodo,
  updateTodo,
  listProjectTodos,
  type Priority,
  type Effort,
  type TodoStatus,
  type Todo,
} from "./todoService";
import { getEntitlementsForUid } from "./authService";
import { upsertMirroredDescriptionComment } from "./commentService";
import { ForbiddenError, NotFoundError } from "../utils/errors";

/** Mirror fields owned by the external source for a task. */
const TASK_MIRROR_FIELDS = [
  "title",
  "status",
  "priority",
  "effort",
  "startDate",
  "deadline",
  "tags",
  "phase",
] as const;

export interface SyncSnapshotPhase {
  /** Stable external phase key (e.g. normalized status name). */
  externalId: string;
  name: string;
  order: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SyncSnapshotTask {
  /** Stable external object id (Notion page id, Monday item id). */
  externalId: string;
  /** External phase key this task belongs to (matches a SyncSnapshotPhase). */
  phaseExternalId: string;
  title: string;
  priority: Priority;
  effort: Effort;
  status: TodoStatus;
  startDate: string | null;
  deadline: string | null;
  tags: string[];
  assigneeUid?: string | null;
  /** External ids of tasks that block this one. */
  blockedByExternalIds?: string[];
  /** Custom field values keyed by external field key (resolved to def ids on apply). */
  customFieldValues?: Record<string, string | number | boolean | null>;
  /** Notion Description (etc.) → mirrored as a single task comment on apply. */
  description?: string | null;
  /** Monday subitem / nested task — resolved to parentId on apply. */
  parentExternalId?: string;
}

export interface SyncCustomFieldDef {
  externalKey: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
}

export interface SyncSnapshotMilestone {
  externalId: string;
  title: string;
  date: string;
  phaseExternalId?: string | null;
}

export interface SyncSnapshot {
  provider: ExternalProvider;
  /** Connection that produced this snapshot (links entities -> credentials/owner). */
  connectionId?: string;
  /** Stable id of the source container (Notion database id, Monday board id). */
  projectExternalId: string;
  /** Optional external parent reference stored on each entity. */
  externalParentId?: string;
  projectName: string;
  phases: SyncSnapshotPhase[];
  tasks: SyncSnapshotTask[];
  /** Custom field definitions to ensure on the project before task upsert. */
  customFieldDefs?: SyncCustomFieldDef[];
  /** Project milestones pulled from the external source. */
  milestones?: SyncSnapshotMilestone[];
}

export type SyncAction = "create" | "update" | "unchanged";

export interface SyncEntityChange {
  externalId: string;
  label: string;
  action: SyncAction;
  internalId?: string;
  /** Mirror fields that differ from the current Wroket value (update only). */
  changedFields?: string[];
}

export interface SyncOrphan {
  internalId: string;
  label: string;
}

export interface SyncDiff {
  provider: ExternalProvider;
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

export interface ApplySyncResult {
  projectId: string;
  projectCreated: boolean;
  phasesCreated: number;
  phasesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
  dependenciesLinked: number;
  orphanPhases: number;
  orphanTasks: number;
}

/** How to handle a re-import when a mirrored project already exists. */
export type SyncImportMode = "merge" | "create_new";

export interface ResolveOptions {
  /** Force-target an existing project instead of matching by externalRef. */
  targetProjectId?: string | null;
  teamId?: string | null;
  /** merge = upsert into existing; create_new = new project + fresh external ids. */
  importMode?: SyncImportMode;
}

/**
 * Clones a snapshot so applySyncDiff always creates a new project (new externalRef keys).
 * ZIP task ids are remapped with the new project prefix; API task ids (page ids) stay as-is.
 */
export function prepareSnapshotForImportMode(
  snapshot: SyncSnapshot,
  mode: SyncImportMode,
): SyncSnapshot {
  if (mode !== "create_new") return snapshot;
  const suffix = crypto.randomUUID().slice(0, 8);
  const base = snapshot.projectExternalId;
  const newBase = `${base}:copy-${suffix}`;
  if (base.startsWith("notion-zip:")) {
    return {
      ...snapshot,
      projectExternalId: newBase,
      tasks: snapshot.tasks.map((t) => ({
        ...t,
        externalId: t.externalId.replace(base, newBase),
        blockedByExternalIds: t.blockedByExternalIds?.map((id) =>
          id.startsWith(base) ? id.replace(base, newBase) : id,
        ),
      })),
      milestones: snapshot.milestones?.map((m) => ({
        ...m,
        externalId: `${m.externalId}:copy-${suffix}`,
      })),
    };
  }
  return { ...snapshot, projectExternalId: newBase };
}

/** Normalizes a free-text phase/status label into a stable external key. */
export function normalizePhaseKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    || "general";
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((t) => sa.has(t));
}

function matchesProvider(ref: ExternalRef | null | undefined, provider: ExternalProvider): boolean {
  return !!ref && ref.provider === provider;
}

/** Builds the externalRef stamped on a synced entity. */
function buildRef(snapshot: SyncSnapshot, externalId: string, now: string): ExternalRef {
  const ref: ExternalRef = {
    provider: snapshot.provider,
    externalId,
    lastSyncedAt: now,
  };
  if (snapshot.connectionId) ref.connectionId = snapshot.connectionId;
  if (snapshot.externalParentId) ref.externalParentId = snapshot.externalParentId;
  return ref;
}

/** Mirror fields of an existing task that differ from the snapshot. */
function taskChangedFields(
  todo: Todo,
  task: SyncSnapshotTask,
  expectedPhaseId: string | null,
  resolvedCustom?: Record<string, string | number | boolean | null>,
): string[] {
  const changed: string[] = [];
  if (todo.title !== task.title) changed.push("title");
  if ((todo.status ?? "active") !== task.status) changed.push("status");
  if (todo.priority !== task.priority) changed.push("priority");
  if (todo.effort !== task.effort) changed.push("effort");
  if ((todo.startDate ?? null) !== (task.startDate ?? null)) changed.push("startDate");
  if ((todo.deadline ?? null) !== (task.deadline ?? null)) changed.push("deadline");
  if (!sameTags(todo.tags ?? [], task.tags ?? [])) changed.push("tags");
  if ((todo.phaseId ?? null) !== (expectedPhaseId ?? null)) changed.push("phase");
  if (resolvedCustom && customValuesChanged(todo, resolvedCustom)) changed.push("customFieldValues");
  return changed;
}

function customValuesChanged(
  todo: Todo,
  resolved: Record<string, string | number | boolean | null>,
): boolean {
  const current = todo.customFieldValues ?? {};
  for (const [k, v] of Object.entries(resolved)) {
    if ((current[k] ?? null) !== (v ?? null)) return true;
  }
  return false;
}

/** Merges select option lists (deduped, max 20). */
function mergeSelectOptions(base: string[], additions: string[]): string[] {
  const set = new Set(base.map((o) => o.trim()).filter(Boolean));
  for (const a of additions) {
    const t = a.trim();
    if (t) set.add(t);
  }
  return [...set].slice(0, 20);
}

/** Ensures custom field defs exist on the project; returns externalKey -> fieldId map. */
function ensureCustomFieldDefsOnProject(
  projectId: string,
  defs: SyncCustomFieldDef[] | undefined,
): Map<string, string> {
  const keyToFieldId = new Map<string, string>();
  if (!defs?.length) return keyToFieldId;
  const project = getProjectById(projectId);
  if (!project) return keyToFieldId;
  const existingByName = new Map(
    (project.customFieldDefs ?? []).map((d) => [d.name.trim().toLowerCase(), d.id]),
  );
  for (const def of defs) {
    let fieldId = existingByName.get(def.name.trim().toLowerCase());
    if (!fieldId) {
      try {
        const created = addCustomFieldDef(projectId, {
          name: def.name,
          type: def.type,
          options: def.options,
        });
        fieldId = created.id;
        existingByName.set(def.name.trim().toLowerCase(), fieldId);
      } catch {
        continue;
      }
    } else if (def.type === "select" && def.options?.length) {
      const existingDef = (getProjectById(projectId)?.customFieldDefs ?? []).find((d) => d.id === fieldId);
      if (existingDef?.type === "select") {
        const merged = mergeSelectOptions(existingDef.options ?? [], def.options);
        if (merged.length > (existingDef.options ?? []).length) {
          updateCustomFieldDef(projectId, fieldId, { options: merged });
        }
      }
    }
    keyToFieldId.set(def.externalKey, fieldId);
  }
  return keyToFieldId;
}

function resolveTaskCustomValues(
  task: SyncSnapshotTask,
  keyToFieldId: Map<string, string>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!task.customFieldValues) return out;
  for (const [key, value] of Object.entries(task.customFieldValues)) {
    const fieldId = keyToFieldId.get(key);
    if (fieldId) out[fieldId] = value;
  }
  return out;
}

function resolveExistingCustomFieldKeyMap(
  project: Project,
  defs: SyncCustomFieldDef[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  const existingByName = new Map(
    (project.customFieldDefs ?? []).map((d) => [d.name.trim().toLowerCase(), d.id]),
  );
  for (const def of defs ?? []) {
    const id = existingByName.get(def.name.trim().toLowerCase());
    if (id) map.set(def.externalKey, id);
  }
  return map;
}

function syncMilestones(
  projectId: string,
  snapshot: SyncSnapshot,
  phaseExtToInternalId: Map<string, string>,
  now: string,
): void {
  const milestones = snapshot.milestones ?? [];
  if (milestones.length === 0) return;
  const project = getProjectById(projectId);
  if (!project) return;
  for (const ms of milestones) {
    const phaseId = ms.phaseExternalId
      ? phaseExtToInternalId.get(ms.phaseExternalId) ?? null
      : null;
    const existing = (project.milestones ?? []).find(
      (m) =>
        m.externalRef?.provider === snapshot.provider &&
        m.externalRef.externalId === ms.externalId,
    );
    const ref = buildRef(snapshot, ms.externalId, now);
    if (!existing) {
      try {
        addMilestone(projectId, {
          title: ms.title,
          date: ms.date,
          phaseId,
          externalRef: ref,
        });
      } catch {
        // Max milestones or validation — skip without failing sync.
      }
    } else if (
      existing.title !== ms.title ||
      existing.date !== ms.date ||
      (existing.phaseId ?? null) !== phaseId
    ) {
      updateMilestone(projectId, existing.id, {
        title: ms.title,
        date: ms.date,
        phaseId,
      });
    }
  }
}

interface ResolvedContext {
  project: Project | null;
  projectAction: SyncAction;
  /** existing phases of this provider keyed by external id. */
  phaseByExt: Map<string, ProjectPhase>;
  /** existing tasks of this provider keyed by external id. */
  taskByExt: Map<string, Todo>;
}

/** Resolves the target project and indexes its mirrored phases/tasks. */
async function resolveContext(
  uid: string,
  userEmail: string,
  snapshot: SyncSnapshot,
  opts: ResolveOptions,
): Promise<ResolvedContext> {
  let project: Project | null = null;
  const mode = opts.importMode ?? "merge";
  if (mode === "create_new") {
    project = null;
  } else if (opts.targetProjectId) {
    project = getProjectById(opts.targetProjectId);
    if (!project) throw new NotFoundError("Projet cible introuvable");
  } else {
    project = findProjectByExternalRef(uid, userEmail, snapshot.provider, snapshot.projectExternalId);
  }

  const phaseByExt = new Map<string, ProjectPhase>();
  const taskByExt = new Map<string, Todo>();

  if (project) {
    for (const phase of project.phases) {
      if (matchesProvider(phase.externalRef, snapshot.provider) && phase.externalRef!.externalId) {
        phaseByExt.set(phase.externalRef!.externalId, phase);
      }
    }
    for (const todo of await listProjectTodos(project.id)) {
      if (matchesProvider(todo.externalRef, snapshot.provider) && todo.externalRef!.externalId) {
        taskByExt.set(todo.externalRef!.externalId, todo);
      }
    }
  }

  return {
    project,
    projectAction: project ? "update" : "create",
    phaseByExt,
    taskByExt,
  };
}

/**
 * Computes a non-mutating preview of what a sync would do: creates, bounded
 * updates (with the exact mirror fields that change), and orphans.
 */
export async function computeSyncDiff(
  uid: string,
  userEmail: string,
  snapshot: SyncSnapshot,
  opts: ResolveOptions = {},
): Promise<SyncDiff> {
  const mode = opts.importMode ?? "merge";
  const effective = mode === "create_new"
    ? prepareSnapshotForImportMode(snapshot, "create_new")
    : snapshot;
  const ctx = await resolveContext(uid, userEmail, effective, { ...opts, importMode: mode });

  const diff: SyncDiff = {
    provider: snapshot.provider,
    project: {
      action: ctx.projectAction,
      internalId: ctx.project?.id ?? null,
      name: effective.projectName,
      nameChanged: ctx.project ? ctx.project.name !== effective.projectName : false,
    },
    phases: { create: [], update: [], unchanged: 0, orphans: [] },
    tasks: { create: [], update: [], unchanged: 0, orphans: [] },
    summary: { creates: 0, updates: 0, orphans: 0 },
  };

  // Phases — match by external id; build a projected phase id map for task checks.
  const snapshotPhaseExtIds = new Set(effective.phases.map((p) => p.externalId));
  const phaseExtToInternalId = new Map<string, string>();
  for (const phase of effective.phases) {
    const existing = ctx.phaseByExt.get(phase.externalId);
    if (!existing) {
      diff.phases.create.push({ externalId: phase.externalId, label: phase.name, action: "create" });
    } else {
      phaseExtToInternalId.set(phase.externalId, existing.id);
      const changed: string[] = [];
      if (existing.order !== phase.order) changed.push("order");
      if (changed.length > 0) {
        diff.phases.update.push({
          externalId: phase.externalId,
          label: phase.name,
          action: "update",
          internalId: existing.id,
          changedFields: changed,
        });
      } else {
        diff.phases.unchanged += 1;
      }
    }
  }
  for (const [extId, phase] of ctx.phaseByExt) {
    if (!snapshotPhaseExtIds.has(extId)) {
      diff.phases.orphans.push({ internalId: phase.id, label: phase.name });
    }
  }

  // Tasks — match by external id.
  const fieldKeyMap = ctx.project
    ? resolveExistingCustomFieldKeyMap(ctx.project, effective.customFieldDefs)
    : new Map<string, string>();
  const snapshotTaskExtIds = new Set(effective.tasks.map((t) => t.externalId));
  for (const task of effective.tasks) {
    const existing = ctx.taskByExt.get(task.externalId);
    if (!existing) {
      diff.tasks.create.push({ externalId: task.externalId, label: task.title, action: "create" });
    } else {
      const expectedPhaseId = phaseExtToInternalId.get(task.phaseExternalId) ?? existing.phaseId ?? null;
      const resolvedCustom = resolveTaskCustomValues(task, fieldKeyMap);
      const changed = taskChangedFields(existing, task, expectedPhaseId, resolvedCustom);
      if (changed.length > 0) {
        diff.tasks.update.push({
          externalId: task.externalId,
          label: task.title,
          action: "update",
          internalId: existing.id,
          changedFields: changed,
        });
      } else {
        diff.tasks.unchanged += 1;
      }
    }
  }
  for (const [extId, todo] of ctx.taskByExt) {
    if (!snapshotTaskExtIds.has(extId)) {
      diff.tasks.orphans.push({ internalId: todo.id, label: todo.title });
    }
  }

  const creates =
    (diff.project.action === "create" ? 1 : 0) + diff.phases.create.length + diff.tasks.create.length;
  const updates =
    (diff.project.nameChanged ? 1 : 0) + diff.phases.update.length + diff.tasks.update.length;
  const orphans = diff.phases.orphans.length + diff.tasks.orphans.length;
  diff.summary = { creates, updates, orphans };

  return diff;
}

/**
 * Applies the snapshot idempotently (bounded mirror). Re-resolves the current
 * state internally so a stale precomputed diff can never cause divergence.
 */
export async function applySyncDiff(
  uid: string,
  userEmail: string,
  snapshot: SyncSnapshot,
  opts: ResolveOptions = {},
): Promise<ApplySyncResult> {
  const mode = opts.importMode ?? "merge";
  const effective = mode === "create_new"
    ? prepareSnapshotForImportMode(snapshot, "create_new")
    : snapshot;
  const now = new Date().toISOString();
  const ctx = await resolveContext(uid, userEmail, effective, { ...opts, importMode: mode });

  const result: ApplySyncResult = {
    projectId: "",
    projectCreated: false,
    phasesCreated: 0,
    phasesUpdated: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    dependenciesLinked: 0,
    orphanPhases: 0,
    orphanTasks: 0,
  };

  // 1) Project (create or mirror name).
  let project = ctx.project;
  if (!project) {
    project = createProject(uid, userEmail, {
      name: effective.projectName,
      teamId: opts.teamId ?? null,
      externalRef: buildRef(effective, effective.projectExternalId, now),
    });
    result.projectCreated = true;
  } else {
    if (project.name !== effective.projectName) {
      updateProject(uid, userEmail, project.id, { name: effective.projectName });
    }
    touchProjectExternalRef(project.id, buildRef(effective, effective.projectExternalId, now));
  }
  result.projectId = project.id;

  // 2) Phases (create missing, mirror order). Orphans are preserved.
  const phaseExtToInternalId = new Map<string, string>();
  for (const [extId, phase] of ctx.phaseByExt) {
    phaseExtToInternalId.set(extId, phase.id);
  }
  for (const phase of effective.phases) {
    const existing = ctx.phaseByExt.get(phase.externalId);
    if (!existing) {
      const created = addPhase(project.id, {
        name: phase.name,
        startDate: phase.startDate ?? null,
        endDate: phase.endDate ?? null,
        externalRef: buildRef(effective, phase.externalId, now),
      });
      phaseExtToInternalId.set(phase.externalId, created.id);
      result.phasesCreated += 1;
    } else if (existing.order !== phase.order) {
      updatePhase(project.id, existing.id, { order: phase.order });
      result.phasesUpdated += 1;
    }
  }

  // 2b) Custom field defs (integrations entitlement required at API layer).
  const fieldKeyMap = ensureCustomFieldDefsOnProject(project.id, effective.customFieldDefs);

  // 3) Tasks (create missing, bounded mirror update). Orphans preserved.
  const extToTodoId = new Map<string, string>();
  for (const [extId, todo] of ctx.taskByExt) {
    extToTodoId.set(extId, todo.id);
  }

  const rootTasks = effective.tasks.filter((t) => !t.parentExternalId);
  const childTasks = effective.tasks.filter((t) => t.parentExternalId);

  const upsertTask = async (task: SyncSnapshotTask) => {
    const phaseId = phaseExtToInternalId.get(task.phaseExternalId) ?? null;
    const existing = ctx.taskByExt.get(task.externalId);
    const ref = buildRef(effective, task.externalId, now);
    const customFieldValues = resolveTaskCustomValues(task, fieldKeyMap);
    const hasCustom = Object.keys(customFieldValues).length > 0;
    const parentId = task.parentExternalId
      ? extToTodoId.get(task.parentExternalId) ?? null
      : null;

    if (!existing) {
      const created = await createTodo(uid, userEmail, {
        title: task.title,
        priority: task.priority,
        effort: task.effort,
        status: task.status,
        startDate: task.startDate,
        deadline: task.deadline,
        tags: task.tags,
        projectId: project.id,
        phaseId,
        parentId,
        assignedTo: task.assigneeUid ?? null,
        allowPastDeadline: true,
        externalRef: ref,
      });
      if (hasCustom) {
        await updateTodo(uid, userEmail, created.id, { customFieldValues });
      }
      upsertMirroredDescriptionComment(created.id, uid, userEmail, task.description);
      extToTodoId.set(task.externalId, created.id);
      result.tasksCreated += 1;
    } else {
      const changed = taskChangedFields(existing, task, phaseId, customFieldValues);
      const parentChanged = (existing.parentId ?? null) !== parentId;
      if (changed.length > 0 || parentChanged) {
        await updateTodo(uid, userEmail, existing.id, {
          title: task.title,
          priority: task.priority,
          effort: task.effort,
          status: task.status,
          startDate: task.startDate,
          deadline: task.deadline,
          tags: task.tags,
          phaseId,
          parentId,
          externalRef: ref,
          ...(hasCustom ? { customFieldValues } : {}),
        });
        result.tasksUpdated += 1;
      } else {
        await updateTodo(uid, userEmail, existing.id, { externalRef: ref });
      }
      upsertMirroredDescriptionComment(existing.id, uid, userEmail, task.description);
      extToTodoId.set(task.externalId, existing.id);
    }
  };

  for (const task of rootTasks) {
    await upsertTask(task);
  }
  for (const task of childTasks) {
    await upsertTask(task);
  }

  // 4) Dependencies (Small teams+ only), resolved external -> internal.
  const depsSupported = getEntitlementsForUid(uid).integrations;
  if (depsSupported) {
    for (const task of effective.tasks) {
      const blockedExt = task.blockedByExternalIds ?? [];
      if (blockedExt.length === 0) continue;
      const todoId = extToTodoId.get(task.externalId);
      if (!todoId) continue;
      const blockerIds = blockedExt
        .map((ext) => extToTodoId.get(ext))
        .filter((id): id is string => !!id && id !== todoId);
      if (blockerIds.length === 0) continue;
      try {
        await updateTodo(uid, userEmail, todoId, { blockedByTodoIds: blockerIds });
        result.dependenciesLinked += blockerIds.length;
      } catch {
        // Skip cycles / entitlement edge cases without failing the whole sync.
      }
    }
  }

  // 5) Milestones (idempotent upsert by externalRef).
  syncMilestones(project.id, effective, phaseExtToInternalId, now);

  // 6) Orphans: count only, never delete.
  const snapshotPhaseExtIds = new Set(effective.phases.map((p) => p.externalId));
  for (const extId of ctx.phaseByExt.keys()) {
    if (!snapshotPhaseExtIds.has(extId)) result.orphanPhases += 1;
  }
  const snapshotTaskExtIds = new Set(effective.tasks.map((t) => t.externalId));
  for (const extId of ctx.taskByExt.keys()) {
    if (!snapshotTaskExtIds.has(extId)) result.orphanTasks += 1;
  }

  return result;
}

/** Guards integration-only sync entry points behind the commercial entitlement. */
export function assertSyncEntitlement(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new ForbiddenError(
      "La synchronisation d'applications externes nécessite un palier payant (Small teams+).",
    );
  }
}
