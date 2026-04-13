import {
  API_BASE_URL,
  apiFetchDefaults,
  parseJsonOrThrow,
  extractApiMessage,
  type ScheduledSlot,
  type SuggestedSlot,
  type ActivityLogEntry,
} from "./core";
import { broadcastTodosMutated } from "../todoSyncBroadcast";

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";
export type AssignmentStatus = "pending" | "accepted" | "declined";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  nextDueDate?: string;
  endDate?: string;
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
  scheduledSlot: ScheduledSlot | null;
  suggestedSlot: SuggestedSlot | null;
  recurrence: Recurrence | null;
  sortOrder?: number | null;
  status: TodoStatus;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoPayload {
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
}

export interface UpdateTodoPayload {
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
  suggestedSlot?: SuggestedSlot | null;
  recurrence?: Recurrence | null;
  sortOrder?: number | null;
}

export async function getTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les tâches");
  return (await res.json()) as Todo[];
}

export async function getAssignedTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos/assigned`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les tâches assignées");
  return (await res.json()) as Todo[];
}

export async function getArchivedTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos/archived`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les tâches archivées");
  return (await res.json()) as Todo[];
}

export async function createTodo(payload: CreateTodoPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de créer la tâche"));
  }
  const todo = (await res.json()) as Todo;
  broadcastTodosMutated();
  return todo;
}

export async function updateTodo(id: string, payload: UpdateTodoPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos/${id}`, {
    ...apiFetchDefaults,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de modifier la tâche"));
  }
  const todo = (await res.json()) as Todo;
  broadcastTodosMutated();
  return todo;
}

export async function deleteTodo(id: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos/${id}`, { ...apiFetchDefaults, method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer la tâche");
  const todo = (await res.json()) as Todo;
  broadcastTodosMutated();
  return todo;
}

export async function reorderTodos(todoIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/todos/reorder`, {
    ...apiFetchDefaults,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todoIds }),
  });
  if (!res.ok) throw new Error("Erreur de réordonnancement");
  broadcastTodosMutated();
}

export async function exportTasksCsv(): Promise<void> {
  return exportTasks("csv");
}

export async function exportTasks(
  format: "csv" | "json",
  options?: { includeArchived?: boolean; archivedOnly?: boolean },
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (options?.archivedOnly) {
    params.set("scope", "archived-only");
  } else if (options?.includeArchived) {
    params.set("include", "archived");
  }
  const res = await fetch(`${API_BASE_URL}/todos/export?${params.toString()}`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = options?.archivedOnly ? "wroket-tasks-archived" : options?.includeArchived ? "wroket-tasks-all" : "wroket-tasks";
  a.download = format === "json" ? `${base}.json` : `${base}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface TaskImportPreviewResult {
  total: number;
  errors: Array<{ row: number; message: string }>;
  validTasks: Record<string, unknown>[];
}

export async function previewTaskImport(file: File): Promise<TaskImportPreviewResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/todos/import/preview`, { ...apiFetchDefaults, method: "POST", body: fd });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Preview failed"));
  }
  return res.json() as Promise<TaskImportPreviewResult>;
}

export async function confirmTaskImport(
  tasks: Record<string, unknown>[],
): Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }> {
  const res = await fetch(`${API_BASE_URL}/todos/import/confirm`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Import failed"));
  }
  const result = await res.json();
  broadcastTodosMutated();
  return result;
}

/** One-shot import (no preview). Prefer preview + confirm in UI. */
export async function importTasks(file: File): Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/todos/import`, { ...apiFetchDefaults, method: "POST", body: fd });
  if (!res.ok) throw new Error("Import failed");
  const result = await res.json();
  broadcastTodosMutated();
  return result;
}

export async function getTaskActivity(todoId: string): Promise<ActivityLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/activity`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) return [];
  return res.json();
}

// ── Comments ──

export interface Comment {
  id: string;
  todoId: string;
  userId: string;
  userEmail: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  reactions?: Record<string, string[]>;
}

export async function getComments(todoId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger les commentaires");
  return res.json();
}

export async function getCommentCounts(): Promise<Record<string, number>> {
  const res = await fetch(`${API_BASE_URL}/todos/comment-counts`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) return {};
  return res.json();
}

export type CommentPostResult = Comment & { mentionInviteNeeded?: string[] };

export async function postCommentApi(todoId: string, text: string): Promise<CommentPostResult> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Impossible d'ajouter le commentaire");
  return res.json() as Promise<CommentPostResult>;
}

export async function editCommentApi(todoId: string, commentId: string, text: string): Promise<CommentPostResult> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}`, {
    ...apiFetchDefaults,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Impossible de modifier le commentaire");
  return res.json() as Promise<CommentPostResult>;
}

export async function deleteCommentApi(todoId: string, commentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le commentaire");
}

export async function toggleReactionApi(todoId: string, commentId: string, emoji: string): Promise<Comment> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}/reactions`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error("Impossible de réagir");
  return res.json();
}

// ── Attachments ──

export interface Attachment {
  id: string;
  todoId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export async function uploadAttachment(todoId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}`, {
    ...apiFetchDefaults,
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractApiMessage(data, "Erreur d'upload"));
  }
  return res.json();
}

export async function getAttachments(todoId: string): Promise<Attachment[]> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) return [];
  return res.json();
}

export async function downloadAttachment(todoId: string, attachmentId: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}/${attachmentId}`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de télécharger");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteAttachmentApi(todoId: string, attachmentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}/${attachmentId}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossible de supprimer");
}
