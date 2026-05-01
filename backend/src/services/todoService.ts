import crypto from "crypto";

import { getStore, scheduleTodoShardPersist, todoShardIndex, flushNow } from "../persistence";
import { findUserByUid, DEFAULT_WORKING_HOURS, getArchivedTaskRetentionDaysForPurge } from "./authService";
import { purgeAttachmentsForTodoIds } from "./attachmentService";
import { removeCommentsForTodos } from "./commentService";
import { detachNotesFromTodoIds } from "./noteService";
import { findPhaseById, getProjectById, canAccessProject, canEditProjectContent } from "./projectService";
import { syncOwnerTodosV2, loadAllTodosV2ByOwner } from "./todoDocStore";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";
export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface ScheduledSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  calendarEventId: string | null;
  /** Set when booking: Google event lives on this user’s primary calendar (owner or assignee). */
  bookedByUid?: string;
  /** Google Meet join URL when a meeting was created from this task. */
  meetingUrl?: string | null;
  /** Provider that created the meeting — currently only google-meet. */
  meetingProvider?: "google-meet" | null;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  nextDueDate?: string;
  endDate?: string;
}

export interface SuggestedSlot {
  start: string;
  end: string;
}

export interface Todo {
  id: string;
  userId: string;
  parentId: string | null;
  projectId: string | null;
  phaseId: string | null;
  assignedTo: string | null;
  assignmentStatus: AssignmentStatus | null;
  title: string;
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  startDate: string | null;
  deadline: string | null;
  tags: string[];
  status: TodoStatus;
  scheduledSlot: ScheduledSlot | null;
  suggestedSlot: SuggestedSlot | null;
  recurrence: Recurrence | null;
  sortOrder: number | null;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
  priority: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  parentId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  recurrence?: Recurrence | null;
  sortOrder?: number | null;
  /** Import / API: allow historical deadlines (round-trip export). */
  allowPastDeadline?: boolean;
  status?: TodoStatus;
  assignmentStatus?: AssignmentStatus | null;
  scheduledSlot?: ScheduledSlot | null;
  suggestedSlot?: SuggestedSlot | null;
}

export interface UpdateTodoInput {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  status?: TodoStatus;
  parentId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  scheduledSlot?: ScheduledSlot | null;
  suggestedSlot?: SuggestedSlot | null;
  recurrence?: Recurrence | null;
  sortOrder?: number | null;
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];
const VALID_STATUSES: TodoStatus[] = ["active", "completed", "cancelled", "deleted"];
const VALID_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["pending", "accepted", "declined"];
const VALID_FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];

function normalizeScheduledSlotForCreate(slot: ScheduledSlot | null | undefined): ScheduledSlot | null {
  if (slot == null) return null;
  if (typeof slot.start !== "string" || isNaN(new Date(slot.start).getTime())) {
    throw new ValidationError("scheduledSlot.start doit être une date ISO valide");
  }
  if (typeof slot.end !== "string" || isNaN(new Date(slot.end).getTime())) {
    throw new ValidationError("scheduledSlot.end doit être une date ISO valide");
  }
  if (slot.calendarEventId !== undefined && slot.calendarEventId !== null && typeof slot.calendarEventId !== "string") {
    throw new ValidationError("scheduledSlot.calendarEventId doit être une chaîne ou null");
  }
  return {
    start: slot.start,
    end: slot.end,
    calendarEventId:
      slot.calendarEventId === undefined || slot.calendarEventId === null ? null : slot.calendarEventId,
  };
}

function normalizeUserEmail(userEmail: string): string {
  return userEmail.trim().toLowerCase();
}

/** User may add or link tasks in this project (owner or team role with content edit). */
function assertProjectEditableForTodo(userId: string, userEmail: string, projectId: string): void {
  const p = getProjectById(projectId);
  if (!p) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(userId, normalizeUserEmail(userEmail), p)) {
    throw new ForbiddenError("Vous ne pouvez pas ajouter ou déplacer de tâche dans ce projet");
  }
}

function validateRecurrence(rec: Recurrence): void {
  if (!VALID_FREQUENCIES.includes(rec.frequency)) {
    throw new ValidationError("Fréquence invalide (daily, weekly, monthly)");
  }
  if (!Number.isFinite(rec.interval) || !Number.isInteger(rec.interval) || rec.interval < 1 || rec.interval > 365) {
    throw new ValidationError("Intervalle invalide (entier entre 1 et 365)");
  }
  if (rec.endDate) {
    const d = new Date(rec.endDate);
    if (isNaN(d.getTime())) throw new ValidationError("Date de fin de récurrence invalide");
  }
}

/**
 * Advance to the nearest future working day if the date falls outside
 * the allowed daysOfWeek. Stops after 7 iterations (one full week).
 */
function advanceToWorkingDay(date: Date, daysOfWeek: number[]): void {
  for (let i = 0; i < 7; i++) {
    if (daysOfWeek.includes(date.getDay())) return;
    date.setDate(date.getDate() + 1);
  }
}

export function calculateNextDueDate(
  currentDeadline: string,
  frequency: RecurrenceFrequency,
  interval: number,
  workingDaysOnly?: number[],
): string {
  const date = new Date(currentDeadline);
  if (isNaN(date.getTime())) throw new ValidationError("Date de référence invalide pour récurrence");
  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + interval);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7 * interval);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + interval);
      break;
  }
  if (workingDaysOnly?.length) {
    advanceToWorkingDay(date, workingDaysOnly);
  }
  return date.toISOString().split("T")[0];
}

const todosByUser = new Map<string, Map<string, Todo>>();
/** Reverse index: todoId → ownerUserId for O(1) cross-user lookup */
const ownerIndex = new Map<string, string>();
const TODOS_STORAGE_MODE = (process.env.TODOS_STORAGE_MODE?.trim().toLowerCase() ?? "legacy") as "legacy" | "dual" | "v2";
console.log("[todos] storage mode: %s", TODOS_STORAGE_MODE);

export function getTodoStoreOwnerId(todoId: string): string | undefined {
  return ownerIndex.get(todoId);
}

/** Plain DTO for JSON responses — avoids leaking internal fields and ensures serializable output. */
export function todoToClientJson(todo: Todo): Todo {
  return {
    id: todo.id,
    userId: todo.userId,
    parentId: todo.parentId,
    projectId: todo.projectId,
    phaseId: todo.phaseId,
    assignedTo: todo.assignedTo,
    assignmentStatus: todo.assignmentStatus,
    title: todo.title,
    priority: todo.priority,
    effort: todo.effort,
    estimatedMinutes: todo.estimatedMinutes,
    startDate: todo.startDate,
    deadline: todo.deadline,
    tags: [...todo.tags],
    scheduledSlot: todo.scheduledSlot
      ? {
          start: todo.scheduledSlot.start,
          end: todo.scheduledSlot.end,
          calendarEventId: todo.scheduledSlot.calendarEventId,
        }
      : null,
    suggestedSlot: todo.suggestedSlot,
    recurrence: todo.recurrence,
    sortOrder: todo.sortOrder ?? null,
    status: todo.status,
    statusChangedAt: todo.statusChangedAt,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
}

function todoToPersisted(todo: Todo): Todo {
  const { encV1: _e, ...rest } = todo as Todo & { encV1?: string };
  return { ...rest };
}

/**
 * @param ownerUidsForShards Firestore todo owner user ids whose shard doc must be rewritten.
 *   Omit or pass none to mark all shards (cross-user updates: phase cleanup, tombstone purge).
 */
async function persistTodos(...ownerUidsForShards: string[]): Promise<void> {
  const obj: Record<string, Record<string, Todo>> = {};
  todosByUser.forEach((todos, userId) => {
    obj[userId] = {};
    todos.forEach((todo, id) => { obj[userId][id] = todoToPersisted(todo); });
  });
  if (TODOS_STORAGE_MODE !== "v2") {
    const store = getStore();
    store.todos = obj;
    if (ownerUidsForShards.length === 0) {
      scheduleTodoShardPersist("all");
    } else {
      const shardIndices = [...new Set(ownerUidsForShards.map((uid) => todoShardIndex(uid)))];
      scheduleTodoShardPersist(shardIndices);
    }
    await flushNow();
  }
  if (TODOS_STORAGE_MODE !== "legacy") {
    const owners = ownerUidsForShards.length === 0 ? [...todosByUser.keys()] : [...new Set(ownerUidsForShards)];
    for (const ownerUid of owners) {
      const ownerTodos = todosByUser.get(ownerUid);
      if (!ownerTodos) continue;
      const docs = [...ownerTodos.values()].map((todo) => ({
        ...todoToPersisted(todo),
        ownerUid,
      }));
      await syncOwnerTodosV2(ownerUid, docs);
    }
  }
}

export function hydrateTodosFromLegacyStore(): void {
  const store = getStore();
  todosByUser.clear();
  ownerIndex.clear();
  if (store.todos) {
    let count = 0;
    for (const [userId, todos] of Object.entries(store.todos)) {
      const map = new Map<string, Todo>();
      for (const [id, todo] of Object.entries(todos as Record<string, Todo>)) {
        const raw = todo as unknown as Record<string, unknown>;
        if (raw.encV1 != null) {
          delete raw.encV1;
        }
        if (typeof todo.title !== "string") {
          todo.title = "";
        }
        if (todo.assignmentStatus === undefined) {
          todo.assignmentStatus = todo.assignedTo ? "pending" : null;
        }
        if (todo.projectId === undefined) {
          todo.projectId = null;
        }
        if (todo.phaseId === undefined) {
          todo.phaseId = null;
        }
        if (todo.startDate === undefined) {
          todo.startDate = null;
        }
        if (!todo.effort) {
          todo.effort = "medium";
        }
        if ((todo as unknown as Record<string, unknown>).estimatedMinutes === undefined) {
          todo.estimatedMinutes = null;
        }
        if (!Array.isArray(todo.tags)) {
          todo.tags = [];
        }
        if ((todo as unknown as Record<string, unknown>).scheduledSlot === undefined) {
          todo.scheduledSlot = null;
        }
        if ((todo as unknown as Record<string, unknown>).suggestedSlot === undefined) {
          todo.suggestedSlot = null;
        }
        if ((todo as unknown as Record<string, unknown>).recurrence === undefined) {
          todo.recurrence = null;
        }
        if ((todo as unknown as Record<string, unknown>).sortOrder === undefined) {
          todo.sortOrder = null;
        }
        if (!todo.statusChangedAt) {
          todo.statusChangedAt = todo.status === "active" ? todo.createdAt : todo.updatedAt;
        }
        map.set(id, todo);
        ownerIndex.set(id, userId);
        count++;
      }
      todosByUser.set(userId, map);
    }
    console.log("[todos] %d tâche(s) chargée(s) depuis le fichier local", count);
  }
}

// Keep backward compatibility for runtime paths where store is already initialized before module import.
if (getStore().todos) {
  hydrateTodosFromLegacyStore();
}

export async function hydrateTodosFromV2IfNeeded(): Promise<void> {
  if (TODOS_STORAGE_MODE !== "v2") return;
  const fromV2 = await loadAllTodosV2ByOwner();
  if (Object.keys(fromV2).length === 0) {
    console.warn("[todos] v2 mode enabled but no docs found in todos_v2");
    return;
  }

  todosByUser.clear();
  ownerIndex.clear();
  let count = 0;
  for (const [userId, todos] of Object.entries(fromV2)) {
    const map = new Map<string, Todo>();
    for (const [id, row] of Object.entries(todos)) {
      const todo = row as unknown as Todo;
      map.set(id, todo);
      ownerIndex.set(id, userId);
      count++;
    }
    todosByUser.set(userId, map);
  }
  console.log("[todos] hydrated %d todo(s) from todos_v2", count);
}

function getUserTodos(userId: string): Map<string, Todo> {
  let todos = todosByUser.get(userId);
  if (!todos) {
    todos = new Map();
    todosByUser.set(userId, todos);
  }
  return todos;
}

export function isArchived(todo: Todo): boolean {
  return todo.status !== "active";
}

function collectArchivedTodoIdsPastRetention(todos: Map<string, Todo>, retentionDays: number): string[] {
  if (retentionDays <= 0) return [];
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const toPurge = new Set<string>();
  for (const [id, todo] of todos) {
    if (!isArchived(todo)) continue;
    const t = new Date(todo.statusChangedAt).getTime();
    if (Number.isNaN(t) || t >= cutoff) continue;
    toPurge.add(id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, todo] of todos) {
      if (toPurge.has(id)) continue;
      if (todo.parentId && toPurge.has(todo.parentId)) {
        toPurge.add(id);
        grew = true;
      }
    }
  }
  return [...toPurge];
}

/**
 * Permanently removes archived todos past the user's retention setting (attachments, comments, task rows).
 * Does not purge other users' tasks when called with a single owner uid.
 */
export async function purgeArchivedTodosPastRetentionForUser(userId: string): Promise<number> {
  const days = getArchivedTaskRetentionDaysForPurge(userId);
  if (days <= 0) return 0;
  const todos = getUserTodos(userId);
  const ids = collectArchivedTodoIdsPastRetention(todos, days);
  if (ids.length === 0) return 0;
  const idSet = new Set(ids);
  await purgeAttachmentsForTodoIds(ids);
  removeCommentsForTodos(ids);
  detachNotesFromTodoIds(userId, idSet);
  await hardRemoveTodosByIds(ids);
  console.log("[todos] %d tâche(s) archivée(s) purgée(s) (rétention %d j., utilisateur %s)", ids.length, days, userId);
  return ids.length;
}

async function purgeArchivedTodosPastRetentionAllUsers(): Promise<void> {
  for (const uid of todosByUser.keys()) {
    await purgeArchivedTodosPastRetentionForUser(uid);
  }
}

/**
 * Archived todos for the signed-in user only (their datastore).
 *
 * The owner always sees their own archived tasks, regardless of the linked project's
 * current state. Filtering on project access applies only to the cross-user assignee
 * list ({@link listArchivedTodosAssignedToMe}) — otherwise a user could lose sight of
 * their own completed work after a project is deleted or a team membership changes.
 */
export function listArchivedTodos(userId: string): Todo[] {
  return listAllTodos(userId)
    .filter(isArchived)
    .sort((a, b) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime());
}

export function listTodos(userId: string): Todo[] {
  const todos = getUserTodos(userId);
  return Array.from(todos.values())
    .filter((t) => !isArchived(t))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns all tasks (including archived) for internal use.
 */
export function listAllTodos(userId: string): Todo[] {
  return Array.from(getUserTodos(userId).values());
}

/**
 * Returns active (non-archived) todos for multiple user IDs.
 */
export function listTodosForUsers(userIds: string[]): Todo[] {
  const result: Todo[] = [];
  for (const uid of userIds) {
    const todos = getUserTodos(uid);
    for (const todo of todos.values()) {
      if (!isArchived(todo) && todo.status === "active") {
        result.push(todo);
      }
    }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns all todos (any status) belonging to a project, across all users.
 */
export function listProjectTodos(projectId: string): Todo[] {
  const result: Todo[] = [];
  todosByUser.forEach((todos) => {
    todos.forEach((todo) => {
      if (todo.projectId === projectId) result.push(todo);
    });
  });
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Ensures every task linked to the project is archived.
 * Active tasks are moved to "completed"; already archived tasks are left unchanged.
 */
export async function archiveTodosByProjectId(projectId: string): Promise<number> {
  const now = new Date().toISOString();
  const owners = new Set<string>();
  let updated = 0;
  todosByUser.forEach((todos, ownerUid) => {
    todos.forEach((todo) => {
      if (todo.projectId !== projectId) return;
      if (todo.status === "active") {
        todo.status = "completed";
        todo.statusChangedAt = now;
        todo.updatedAt = now;
        updated++;
        owners.add(ownerUid);
      }
    });
  });
  if (owners.size > 0) {
    await persistTodos(...owners);
  }
  return updated;
}

/**
 * Soft-delete every task linked to a project (status => deleted).
 */
export async function softDeleteTodosByProjectId(projectId: string): Promise<number> {
  const now = new Date().toISOString();
  const owners = new Set<string>();
  let updated = 0;
  todosByUser.forEach((todos, ownerUid) => {
    todos.forEach((todo) => {
      if (todo.projectId !== projectId) return;
      if (todo.status !== "deleted") {
        todo.status = "deleted";
        todo.statusChangedAt = now;
        todo.updatedAt = now;
        updated++;
        owners.add(ownerUid);
      }
    });
  });
  if (owners.size > 0) {
    await persistTodos(...owners);
  }
  return updated;
}

/** Internal: bulk project/phase/parent updates (phase→sub-project conversion). */
export interface TodoPhaseConversionPatch {
  todoId: string;
  projectId: string | null;
  phaseId: string | null;
  parentId: string | null;
}

export async function applyTodoPatchesForPhaseConversion(patches: TodoPhaseConversionPatch[]): Promise<void> {
  const now = new Date().toISOString();
  const ownersToPersist = new Set<string>();
  for (const p of patches) {
    const owner = ownerIndex.get(p.todoId);
    if (!owner) continue;
    const todos = todosByUser.get(owner);
    if (!todos) continue;
    const todo = todos.get(p.todoId);
    if (!todo) continue;
    todo.projectId = p.projectId;
    todo.phaseId = p.phaseId;
    todo.parentId = p.parentId;
    todo.updatedAt = now;
    todos.set(p.todoId, todo);
    ownersToPersist.add(owner);
  }
  if (ownersToPersist.size > 0) {
    await persistTodos(...ownersToPersist);
  }
}

/** All todos in `todos` whose parent chain reaches `rootId` (including `rootId`). */
function collectDescendantTodoIds(todos: Map<string, Todo>, rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, todo] of todos) {
      if (ids.has(id)) continue;
      if (todo.parentId && ids.has(todo.parentId)) {
        ids.add(id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/**
 * Permanently removes an archived todo (and its subtasks) from the owner’s store.
 * Assignees cannot purge tasks they do not own.
 */
export async function permanentlyRemoveArchivedTodo(userId: string, todoId: string): Promise<Todo[]> {
  const own = getUserTodos(userId);
  const todo = own.get(todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");
  if (!isArchived(todo)) {
    throw new ValidationError("Seules les tâches archivées peuvent être supprimées définitivement");
  }
  const chainIds = collectDescendantTodoIds(own, todoId);
  const snapshots = chainIds.map((id) => own.get(id)!).filter(Boolean);
  await purgeAttachmentsForTodoIds(chainIds);
  removeCommentsForTodos(chainIds);
  detachNotesFromTodoIds(userId, new Set(chainIds));
  await hardRemoveTodosByIds(chainIds);
  return snapshots;
}

/**
 * Permanently removes every archived todo visible in {@link listArchivedTodos} for this user (plus subtasks in the same chains).
 */
export async function permanentlyRemoveAllArchivedTodosOwned(userId: string, _userEmail: string): Promise<Todo[]> {
  const archivedVisible = listArchivedTodos(userId);
  if (archivedVisible.length === 0) return [];
  const own = getUserTodos(userId);
  const allIds = new Set<string>();
  for (const t of archivedVisible) {
    if (!own.has(t.id)) continue;
    for (const id of collectDescendantTodoIds(own, t.id)) {
      allIds.add(id);
    }
  }
  if (allIds.size === 0) return [];
  const snapshots = [...allIds].map((id) => own.get(id)!).filter(Boolean);
  const idList = [...allIds];
  await purgeAttachmentsForTodoIds(idList);
  removeCommentsForTodos(idList);
  detachNotesFromTodoIds(userId, allIds);
  await hardRemoveTodosByIds(idList);
  return snapshots;
}

/** Permanently remove todos from the store (used when root tasks become phases). */
export async function hardRemoveTodosByIds(todoIds: string[]): Promise<void> {
  const owners = new Set<string>();
  for (const id of todoIds) {
    const owner = ownerIndex.get(id);
    if (!owner) continue;
    const todos = todosByUser.get(owner);
    if (!todos?.has(id)) continue;
    todos.delete(id);
    ownerIndex.delete(id);
    owners.add(owner);
  }
  if (owners.size > 0) {
    await persistTodos(...owners);
  }
}

/** Clears phaseId on todos that still reference a removed phase (any owner). */
export async function clearProjectPhaseReferences(projectId: string, phaseId: string): Promise<number> {
  let updated = 0;
  const now = new Date().toISOString();
  todosByUser.forEach((todos) => {
    todos.forEach((todo) => {
      if (todo.projectId === projectId && todo.phaseId === phaseId) {
        todo.phaseId = null;
        todo.updatedAt = now;
        updated++;
      }
    });
  });
  if (updated > 0) await persistTodos();
  return updated;
}

/**
 * Returns all tasks assigned to `userId` by other users.
 */
export function listAssignedToMe(userId: string): Todo[] {
  const result: Todo[] = [];
  todosByUser.forEach((todos, ownerUid) => {
    if (ownerUid === userId) return;
    todos.forEach((todo) => {
      if (todo.assignedTo === userId && !isArchived(todo)) result.push(todo);
    });
  });
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Archived tasks where the signed-in user is assignee but the todo lives in another user's store.
 * Same visibility rules as {@link listArchivedTodos}: personal (no project) always; project-linked only if
 * the user can still access the project.
 */
export function listArchivedTodosAssignedToMe(userId: string, userEmail: string): Todo[] {
  const email = userEmail.trim().toLowerCase();
  const result: Todo[] = [];
  todosByUser.forEach((todos, ownerUid) => {
    if (ownerUid === userId) return;
    todos.forEach((todo) => {
      if (todo.assignedTo !== userId) return;
      if (!isArchived(todo)) return;
      if (todo.projectId) {
        const p = getProjectById(todo.projectId);
        if (!p || !canAccessProject(userId, email, p)) return;
      }
      result.push(todo);
    });
  });
  return result.sort(
    (a, b) => new Date(b.statusChangedAt).getTime() - new Date(a.statusChangedAt).getTime()
  );
}

/**
 * Check whether `userId` can access (read/comment on) a todo.
 *
 * WHY: The original code had no access check on the comment endpoints.
 * Any authenticated user could read or post comments on any task by
 * supplying an arbitrary todoId. This function is the single source of
 * truth for "can this user see this task?".
 *
 * A user can access a todo if:
 *   1. They own it, OR
 *   2. They are the assignee
 */
export function canAccessTodo(userId: string, todoId: string): boolean {
  return findTodoForUser(userId, todoId) !== null;
}

const MAX_REORDER_SIZE = 200;

/**
 * Updates sortOrder for a batch of owned todos in a single persist.
 * Returns the count of successfully updated items.
 */
export async function batchReorder(userId: string, todoIds: string[]): Promise<number> {
  const capped = todoIds.slice(0, MAX_REORDER_SIZE);
  let updated = 0;
  for (let i = 0; i < capped.length; i++) {
    const found = findTodoForUser(userId, capped[i]);
    if (found && found.isOwner) {
      found.todo.sortOrder = i;
      found.todo.updatedAt = new Date().toISOString();
      updated++;
    }
  }
  if (updated > 0) await persistTodos(userId);
  return updated;
}

export async function createTodo(userId: string, userEmail: string, input: CreateTodoInput): Promise<Todo> {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("Le titre est requis");
  }
  if (input.title.trim().length > 500) {
    throw new ValidationError("Le titre ne doit pas dépasser 500 caractères");
  }
  if (!VALID_PRIORITIES.includes(input.priority)) {
    throw new ValidationError("Priorité invalide (low, medium, high)");
  }
  if (input.effort && !VALID_EFFORTS.includes(input.effort)) {
    throw new ValidationError("Charge invalide (light, medium, heavy)");
  }
  if (input.deadline) {
    const d = new Date(input.deadline);
    if (isNaN(d.getTime())) throw new ValidationError("Date deadline invalide");
    if (!input.allowPastDeadline) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) throw new ValidationError("L'échéance ne peut pas être antérieure à aujourd'hui");
    }
  }

  let parentTodo: Todo | null = null;
  if (input.parentId) {
    const parentFound = findTodoForUser(userId, input.parentId);
    if (!parentFound) throw new NotFoundError("Tâche parente introuvable");
    parentTodo = parentFound.todo;
    if (parentTodo.parentId) throw new ValidationError("Une sous-tâche ne peut pas avoir de sous-tâche");
    if (input.deadline && parentTodo.deadline) {
      if (new Date(input.deadline) > new Date(parentTodo.deadline)) {
        throw new ValidationError("La deadline d'une sous-tâche ne peut pas dépasser celle de la tâche parente");
      }
    }
  }

  let resolvedProjectId = input.projectId ?? null;
  let resolvedPhaseId = input.phaseId ?? null;
  if (parentTodo) {
    if (resolvedProjectId === null && parentTodo.projectId) {
      resolvedProjectId = parentTodo.projectId;
    }
    if (resolvedPhaseId === null && parentTodo.phaseId) {
      resolvedPhaseId = parentTodo.phaseId;
    }
    if (input.projectId != null && parentTodo.projectId && input.projectId !== parentTodo.projectId) {
      throw new ValidationError("La sous-tâche doit appartenir au même projet que la tâche parente");
    }
    if (input.phaseId != null && parentTodo.phaseId && input.phaseId !== parentTodo.phaseId) {
      throw new ValidationError("La sous-tâche doit être dans la même phase que la tâche parente");
    }
  }

  if (resolvedPhaseId) {
    const phase = findPhaseById(resolvedPhaseId);
    if (!phase) throw new NotFoundError("Phase introuvable");
    if (resolvedProjectId && phase.projectId !== resolvedProjectId) {
      throw new ValidationError("La phase n'appartient pas au projet sélectionné");
    }
    if (!resolvedProjectId) {
      resolvedProjectId = phase.projectId;
    }
    if (input.startDate && phase.startDate && input.startDate < phase.startDate) {
      throw new ValidationError(`La date de début ne peut pas être antérieure au début de la phase (${phase.startDate})`);
    }
    if (input.deadline && phase.endDate && input.deadline > phase.endDate) {
      throw new ValidationError(`L'échéance ne peut pas dépasser la fin de la phase (${phase.endDate})`);
    }
  }

  if (resolvedProjectId) {
    assertProjectEditableForTodo(userId, userEmail, resolvedProjectId);
  }

  if (input.startDate && input.deadline && input.startDate > input.deadline) {
    throw new ValidationError("La date de début ne peut pas être postérieure à l'échéance");
  }

  if (input.recurrence) {
    validateRecurrence(input.recurrence);
  }

  const normalizedSlot: ScheduledSlot | null =
    input.scheduledSlot === undefined ? null : normalizeScheduledSlotForCreate(input.scheduledSlot);

  let normalizedSuggested: SuggestedSlot | null = null;
  if (input.suggestedSlot !== undefined && input.suggestedSlot !== null) {
    const s = input.suggestedSlot;
    if (typeof s.start !== "string" || isNaN(new Date(s.start).getTime())) {
      throw new ValidationError("suggestedSlot.start invalide");
    }
    if (typeof s.end !== "string" || isNaN(new Date(s.end).getTime())) {
      throw new ValidationError("suggestedSlot.end invalide");
    }
    normalizedSuggested = { start: s.start, end: s.end };
  }

  const status: TodoStatus =
    input.status && VALID_STATUSES.includes(input.status) ? input.status : "active";

  let assignmentStatus: AssignmentStatus | null = null;
  if (input.assignedTo) {
    if (input.assignmentStatus && VALID_ASSIGNMENT_STATUSES.includes(input.assignmentStatus)) {
      assignmentStatus = input.assignmentStatus;
    } else {
      assignmentStatus = "pending";
    }
  } else if (input.assignmentStatus !== undefined && input.assignmentStatus !== null) {
    assignmentStatus = VALID_ASSIGNMENT_STATUSES.includes(input.assignmentStatus) ? input.assignmentStatus : null;
  }

  const now = new Date().toISOString();
  const todo: Todo = {
    id: crypto.randomUUID(),
    userId,
    parentId: input.parentId ?? null,
    projectId: resolvedProjectId,
    phaseId: resolvedPhaseId,
    assignedTo: input.assignedTo ?? null,
    assignmentStatus,
    title: input.title.trim(),
    priority: input.priority,
    effort: input.effort ?? "medium",
    estimatedMinutes: input.estimatedMinutes ?? null,
    startDate: input.startDate ?? null,
    deadline: input.deadline ?? null,
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
    scheduledSlot: normalizedSlot,
    suggestedSlot: normalizedSuggested,
    recurrence: input.recurrence ?? null,
    sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : null,
    status,
    statusChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  getUserTodos(userId).set(todo.id, todo);
  ownerIndex.set(todo.id, userId);
  await persistTodos(userId);
  return todo;
}

/**
 * Finds a todo by id — first in the user's own map, then across
 * all users for tasks assigned to this user.
 */
export function findTodoForUser(userId: string, todoId: string): { todo: Todo; ownerMap: Map<string, Todo>; isOwner: boolean } | null {
  const own = getUserTodos(userId);
  const ownTodo = own.get(todoId);
  if (ownTodo) return { todo: ownTodo, ownerMap: own, isOwner: true };

  const ownerId = ownerIndex.get(todoId);
  if (ownerId) {
    const ownerMap = todosByUser.get(ownerId);
    const t = ownerMap?.get(todoId);
    if (t && t.assignedTo === userId) return { todo: t, ownerMap: ownerMap!, isOwner: false };
  }
  return null;
}

export async function updateTodo(userId: string, userEmail: string, todoId: string, input: UpdateTodoInput): Promise<Todo> {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo, ownerMap: todos, isOwner } = found;

  // Only the owner may *change* assignee. Assignees often save the full form with
  // the same assignedTo — that must not be rejected (comments, title, etc.).
  if (input.assignedTo !== undefined && !isOwner) {
    const next = input.assignedTo;
    const cur = todo.assignedTo ?? null;
    const unchanged = (next === null && cur === null) || next === cur;
    if (!unchanged) {
      throw new ForbiddenError("Seul le propriétaire de la tâche peut modifier l'assignation");
    }
  }

  if (input.title !== undefined) {
    if (input.title.trim().length === 0) throw new ValidationError("Le titre est requis");
    if (input.title.trim().length > 500) throw new ValidationError("Le titre ne doit pas dépasser 500 caractères");
    todo.title = input.title.trim();
  }
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority)) {
      throw new ValidationError("Priorité invalide (low, medium, high)");
    }
    todo.priority = input.priority;
  }
  if (input.effort !== undefined) {
    if (!VALID_EFFORTS.includes(input.effort)) {
      throw new ValidationError("Charge invalide (light, medium, heavy)");
    }
    todo.effort = input.effort;
  }
  if (input.estimatedMinutes !== undefined) {
    if (input.estimatedMinutes !== null) {
      if (typeof input.estimatedMinutes !== "number" || !Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes < 0 || input.estimatedMinutes > 10000) {
        throw new ValidationError("estimatedMinutes doit être null ou un nombre entre 0 et 10 000");
      }
    }
    todo.estimatedMinutes = input.estimatedMinutes;
  }
  if (input.deadline !== undefined) {
    if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut modifier l'échéance");
    if (input.deadline !== null) {
      const d = new Date(input.deadline);
      if (isNaN(d.getTime())) throw new ValidationError("Date deadline invalide");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) throw new ValidationError("L'échéance ne peut pas être antérieure à aujourd'hui");
    }
    todo.deadline = input.deadline;
  }
  if (input.tags !== undefined) {
    todo.tags = input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
  }
  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw new ValidationError("Statut invalide (active, completed, cancelled, deleted)");
    }
    if (input.status === "deleted" && !isOwner) {
      throw new ForbiddenError("Seul le propriétaire peut supprimer la tâche");
    }
    if (input.status !== todo.status) {
      todo.statusChangedAt = new Date().toISOString();
    }
    todo.status = input.status;
  }
  if (input.parentId !== undefined) {
    if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut modifier la tâche parente");
    todo.parentId = input.parentId;
  }
  if (input.projectId !== undefined) {
    if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut modifier le projet");
    if (input.projectId !== null) {
      assertProjectEditableForTodo(userId, userEmail, input.projectId);
    }
    todo.projectId = input.projectId;
    if (todo.phaseId && input.phaseId === undefined) {
      const phase = findPhaseById(todo.phaseId);
      if (phase && phase.projectId !== todo.projectId) {
        todo.phaseId = null;
      }
    }
  }
  if (input.phaseId !== undefined) {
    if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut modifier la phase");
    if (input.phaseId) {
      const phase = findPhaseById(input.phaseId);
      if (!phase) throw new NotFoundError("Phase introuvable");
      const effectiveProjectId = input.projectId !== undefined ? input.projectId : todo.projectId;
      if (phase.projectId !== effectiveProjectId) {
        throw new ValidationError("La phase n'appartient pas au projet sélectionné");
      }
      assertProjectEditableForTodo(userId, userEmail, phase.projectId);
    }
    todo.phaseId = input.phaseId;
  }
  if (input.startDate !== undefined) {
    if (input.startDate !== null) {
      const d = new Date(input.startDate);
      if (isNaN(d.getTime())) throw new ValidationError("Date de début invalide");
    }
    todo.startDate = input.startDate;
  }

  if (input.deadline !== undefined || input.startDate !== undefined || input.phaseId !== undefined) {
    const effectivePhaseId = input.phaseId !== undefined ? input.phaseId : todo.phaseId;
    if (effectivePhaseId) {
      const phase = findPhaseById(effectivePhaseId);
      if (phase) {
        if (todo.startDate && phase.startDate && todo.startDate < phase.startDate) {
          throw new ValidationError(`La date de début ne peut pas être antérieure au début de la phase (${phase.startDate})`);
        }
        if (todo.deadline && phase.endDate && todo.deadline > phase.endDate) {
          throw new ValidationError(`L'échéance ne peut pas dépasser la fin de la phase (${phase.endDate})`);
        }
      }
    }
  }

  if (todo.startDate && todo.deadline && todo.startDate > todo.deadline) {
    throw new ValidationError("La date de début ne peut pas être postérieure à l'échéance");
  }

  if (input.assignedTo !== undefined) {
    if (input.assignedTo !== todo.assignedTo) {
      todo.assignedTo = input.assignedTo;
      todo.assignmentStatus = input.assignedTo ? "pending" : null;
    }
  }
  if (input.assignmentStatus !== undefined) {
    const isAssignee = todo.assignedTo === userId;
    if (!isOwner && !isAssignee) {
      throw new ForbiddenError("Seul l'assigné ou le propriétaire peut modifier le statut d'assignation");
    }
    todo.assignmentStatus = input.assignmentStatus;
  }
  if (input.scheduledSlot !== undefined) {
    if (input.scheduledSlot === null) {
      todo.scheduledSlot = null;
    } else {
      const slot = input.scheduledSlot;
      if (typeof slot.start !== "string" || isNaN(new Date(slot.start).getTime())) {
        throw new ValidationError("scheduledSlot.start doit être une date ISO valide");
      }
      if (typeof slot.end !== "string" || isNaN(new Date(slot.end).getTime())) {
        throw new ValidationError("scheduledSlot.end doit être une date ISO valide");
      }
      if (slot.calendarEventId !== undefined && slot.calendarEventId !== null && typeof slot.calendarEventId !== "string") {
        throw new ValidationError("scheduledSlot.calendarEventId doit être une chaîne ou undefined");
      }
      const normalized: ScheduledSlot = {
        start: slot.start,
        end: slot.end,
        calendarEventId:
          slot.calendarEventId === undefined || slot.calendarEventId === null
            ? null
            : slot.calendarEventId,
      };
      const prev = todo.scheduledSlot;
      if (
        prev?.bookedByUid &&
        prev.start === normalized.start &&
        prev.end === normalized.end &&
        (prev.calendarEventId ?? null) === (normalized.calendarEventId ?? null)
      ) {
        normalized.bookedByUid = prev.bookedByUid;
      }
      todo.scheduledSlot = normalized;
      todo.suggestedSlot = null;
    }
  }
  if (input.suggestedSlot !== undefined) {
    if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut suggérer un créneau");
    todo.suggestedSlot = input.suggestedSlot;
  }
  if (input.recurrence !== undefined) {
    if (input.recurrence) {
      validateRecurrence(input.recurrence);
    }
    todo.recurrence = input.recurrence;
  }
  if (input.sortOrder !== undefined) {
    todo.sortOrder = input.sortOrder;
  }

  todo.updatedAt = new Date().toISOString();
  todos.set(todoId, todo);

  if (
    input.status === "completed" &&
    todo.recurrence &&
    todo.deadline
  ) {
    const { frequency, interval, endDate } = todo.recurrence;
    const owner = findUserByUid(todo.userId);
    const ownerWh = owner?.workingHours ?? DEFAULT_WORKING_HOURS;
    const workingDays = owner?.skipNonWorkingDays ? ownerWh.daysOfWeek : undefined;
    const nextDeadline = calculateNextDueDate(todo.deadline, frequency, interval, workingDays);
    const pastEnd = endDate && nextDeadline > endDate;
    if (!pastEnd) {
      const ownerTodos = getUserTodos(todo.userId);
      const now2 = new Date().toISOString();
      const clone: Todo = {
        id: crypto.randomUUID(),
        userId: todo.userId,
        parentId: null,
        projectId: todo.projectId,
        phaseId: todo.phaseId,
        assignedTo: todo.assignedTo,
        assignmentStatus: todo.assignedTo ? "pending" : null,
        title: todo.title,
        priority: todo.priority,
        effort: todo.effort,
        estimatedMinutes: todo.estimatedMinutes,
        startDate: null,
        deadline: nextDeadline,
        tags: [...todo.tags],
        scheduledSlot: null,
        suggestedSlot: null,
        recurrence: {
          ...todo.recurrence,
          nextDueDate: calculateNextDueDate(nextDeadline, frequency, interval, workingDays),
        },
        sortOrder: null,
        status: "active",
        statusChangedAt: now2,
        createdAt: now2,
        updatedAt: now2,
      };
      ownerTodos.set(clone.id, clone);
      ownerIndex.set(clone.id, todo.userId);
    }
  }

  await persistTodos(todo.userId);
  return todo;
}

setInterval(() => {
  void purgeArchivedTodosPastRetentionAllUsers().catch((err) => {
    console.error("[todos] échec purge tâches archivées:", err);
  });
}, 6 * 60 * 60 * 1000).unref();

export async function deleteTodo(userId: string, todoId: string): Promise<Todo> {
  const found = findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo, ownerMap: todos, isOwner } = found;
  if (!isOwner) throw new ForbiddenError("Seul le propriétaire peut supprimer la tâche");
  const now = new Date().toISOString();
  todo.status = "deleted";
  todo.statusChangedAt = now;
  todo.updatedAt = now;
  todos.set(todoId, todo);
  await persistTodos(userId);
  return todo;
}

/** Operational helper used by migration scripts to sync all in-memory todos to configured stores. */
export async function syncAllTodosToConfiguredStores(): Promise<void> {
  await persistTodos();
}
