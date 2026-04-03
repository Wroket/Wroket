import {
  API_BASE_URL, parseJsonOrThrow, extractApiMessage,
} from "./core";
import type { Priority, Effort, Todo } from "./todos";

export type ProjectStatus = "active" | "archived";

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  teamId: string | null;
  parentProjectId: string | null;
  tags: string[];
  sortOrder: number;
  status: ProjectStatus;
  phases: ProjectPhase[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  teamId?: string | null;
  parentProjectId?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  teamId?: string | null;
  parentProjectId?: string | null;
  status?: ProjectStatus;
  tags?: string[];
}

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/projects`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les projets");
  return (await res.json()) as Project[];
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Projet introuvable");
  return (await res.json()) as Project;
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as Project;
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Erreur lors de la mise à jour du projet");
  }
  return (await res.json()) as Project;
}

export async function deleteProjectApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Erreur lors de la suppression du projet");
}

export async function reorderProjects(projectIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/projects/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectIds }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur de réordonnancement");
}

export async function getProjectTodos(projectId: string): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/todos`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les tâches du projet");
  return (await res.json()) as Todo[];
}

export async function getAllProjectTodos(): Promise<Record<string, Todo[]>> {
  const res = await fetch(`${API_BASE_URL}/projects/all-todos`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les tâches projets");
  return (await res.json()) as Record<string, Todo[]>;
}

// ── Phases ──

export interface CreatePhasePayload {
  name: string;
  color?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdatePhasePayload {
  name?: string;
  color?: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createPhase(projectId: string, payload: CreatePhasePayload): Promise<ProjectPhase> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as ProjectPhase;
}

export async function updatePhaseApi(projectId: string, phaseId: string, payload: UpdatePhasePayload): Promise<ProjectPhase> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour de la phase");
  return (await res.json()) as ProjectPhase;
}

export async function deletePhaseApi(projectId: string, phaseId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la suppression de la phase");
}

// ── CSV Import ──

export interface ImportParsedTask {
  row: number;
  phase: string;
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  startDate: string | null;
  assigneeEmail: string | null;
  assigneeUid: string | null;
  tags: string[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreview {
  projectName: string;
  phases: { name: string; taskCount: number }[];
  tasks: ImportParsedTask[];
  errors: ImportError[];
}

export async function uploadCsvPreview(file: File, projectName: string): Promise<ImportPreview> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectName", projectName);
  const res = await fetch(`${API_BASE_URL}/projects/import/preview`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'analyse du CSV"));
  }
  return res.json();
}

export async function confirmCsvImport(file: File, projectName: string, teamId: string | null): Promise<{ project: Project; taskCount: number }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectName", projectName);
  if (teamId) fd.append("teamId", teamId);
  const res = await fetch(`${API_BASE_URL}/projects/import/confirm`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'import"));
  }
  return res.json();
}
