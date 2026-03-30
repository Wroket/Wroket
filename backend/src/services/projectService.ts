import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { getTeam, canManageProjects } from "./teamService";

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
  status: ProjectStatus;
  phases: ProjectPhase[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  teamId?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  teamId?: string | null;
  status?: ProjectStatus;
}

export interface CreatePhaseInput {
  name: string;
  color?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdatePhaseInput {
  name?: string;
  color?: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
}

const PHASE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];

const projectsById = new Map<string, Project>();

function persist(): void {
  const obj: Record<string, Project> = {};
  projectsById.forEach((p, id) => { obj[id] = p; });
  const store = getStore();
  store.projects = obj;
  scheduleSave("projects");
}

(function hydrate() {
  const store = getStore();
  if (store.projects) {
    for (const [id, raw] of Object.entries(store.projects)) {
      const project = raw as Project;
      if (!project.phases) project.phases = [];
      projectsById.set(id, project);
    }
    console.log("[projects] %d projet(s) chargé(s)", projectsById.size);
  }
})();

/**
 * Returns true if the user can VIEW the project (any team role).
 */
export function canAccessProject(uid: string, userEmail: string, project: Project): boolean {
  if (project.ownerUid === uid) return true;
  if (project.teamId) {
    const team = getTeam(project.teamId);
    if (team && team.members.some((m) => m.email === userEmail)) return true;
  }
  return false;
}

/**
 * Returns true if the user can EDIT the project (owner or admin in team).
 * Members (read-only) cannot edit.
 */
export function canEditProject(uid: string, userEmail: string, project: Project): boolean {
  if (project.ownerUid === uid) return true;
  if (project.teamId) {
    const team = getTeam(project.teamId);
    if (team && canManageProjects(team, uid, userEmail)) return true;
  }
  return false;
}

/**
 * Returns projects the user can access:
 * - projects they own
 * - projects linked to a team they belong to
 */
export function listProjects(uid: string, userEmail: string): Project[] {
  const results: Project[] = [];
  for (const p of projectsById.values()) {
    if (p.ownerUid === uid) {
      results.push(p);
      continue;
    }
    if (p.teamId) {
      const team = getTeam(p.teamId);
      if (team && team.members.some((m) => m.email === userEmail)) {
        results.push(p);
      }
    }
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProjectById(id: string): Project | null {
  return projectsById.get(id) ?? null;
}

export function createProject(uid: string, userEmail: string, input: CreateProjectInput): Project {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("Le nom du projet est requis");
  }

  if (input.teamId) {
    const team = getTeam(input.teamId);
    if (!team) throw new NotFoundError("Équipe introuvable");
    if (!canManageProjects(team, uid, userEmail)) {
      throw new ForbiddenError("Seuls les admins de l'équipe peuvent créer des projets");
    }
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    ownerUid: uid,
    teamId: input.teamId ?? null,
    status: "active",
    phases: [],
    createdAt: now,
    updatedAt: now,
  };
  projectsById.set(project.id, project);
  persist();
  return project;
}

export function updateProject(uid: string, userEmail: string, id: string, input: UpdateProjectInput): Project {
  const project = projectsById.get(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canEditProject(uid, userEmail, project)) {
    throw new ForbiddenError("Accès réservé aux propriétaires et administrateurs");
  }

  if (input.name !== undefined) project.name = input.name.trim();
  if (input.description !== undefined) project.description = input.description.trim();
  if (input.teamId !== undefined) project.teamId = input.teamId;
  if (input.status !== undefined) project.status = input.status;
  project.updatedAt = new Date().toISOString();

  persist();
  return project;
}

export function deleteProject(uid: string, id: string): void {
  const project = projectsById.get(id);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (project.ownerUid !== uid) throw new ForbiddenError("Seul le propriétaire peut supprimer un projet");
  projectsById.delete(id);
  persist();
}

// ── Phase CRUD ──

export function addPhase(projectId: string, input: CreatePhaseInput): ProjectPhase {
  const project = projectsById.get(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!input.name?.trim()) throw new ValidationError("Le nom de la phase est requis");

  const phase: ProjectPhase = {
    id: crypto.randomUUID(),
    projectId,
    name: input.name.trim(),
    color: input.color ?? PHASE_COLORS[project.phases.length % PHASE_COLORS.length],
    order: project.phases.length,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    createdAt: new Date().toISOString(),
  };
  project.phases.push(phase);
  project.updatedAt = new Date().toISOString();
  persist();
  return phase;
}

export function updatePhase(projectId: string, phaseId: string, input: UpdatePhaseInput): ProjectPhase {
  const project = projectsById.get(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  const phase = project.phases.find((p) => p.id === phaseId);
  if (!phase) throw new NotFoundError("Phase introuvable");

  if (input.name !== undefined) phase.name = input.name.trim();
  if (input.color !== undefined) phase.color = input.color;
  if (input.startDate !== undefined) phase.startDate = input.startDate;
  if (input.endDate !== undefined) phase.endDate = input.endDate;
  if (input.order !== undefined) {
    const oldOrder = phase.order;
    const newOrder = Math.max(0, Math.min(input.order, project.phases.length - 1));
    project.phases.splice(oldOrder, 1);
    project.phases.splice(newOrder, 0, phase);
    project.phases.forEach((p, i) => { p.order = i; });
  }

  project.updatedAt = new Date().toISOString();
  persist();
  return phase;
}

export function deletePhase(projectId: string, phaseId: string): void {
  const project = projectsById.get(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  const idx = project.phases.findIndex((p) => p.id === phaseId);
  if (idx === -1) throw new NotFoundError("Phase introuvable");
  project.phases.splice(idx, 1);
  project.phases.forEach((p, i) => { p.order = i; });
  project.updatedAt = new Date().toISOString();
  persist();
}
