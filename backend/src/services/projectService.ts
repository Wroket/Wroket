import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { getTeam, canManageProjects, canEditContent, getTeamRole } from "./teamService";

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

export interface CreateProjectInput {
  name: string;
  description?: string;
  teamId?: string | null;
  parentProjectId?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  teamId?: string | null;
  parentProjectId?: string | null;
  status?: ProjectStatus;
  tags?: string[];
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
      if (project.parentProjectId === undefined) project.parentProjectId = null;
      if (!project.tags) project.tags = [];
      if (project.sortOrder === undefined) project.sortOrder = 0;
      projectsById.set(id, project);
    }
    console.log("[projects] %d projet(s) chargé(s)", projectsById.size);
  }
})();

/**
 * Returns true if the user can VIEW the project (any team role — user, super-user, admin).
 */
export function canAccessProject(uid: string, userEmail: string, project: Project): boolean {
  if (project.ownerUid === uid) return true;
  if (project.teamId) {
    const team = getTeam(project.teamId);
    if (team && getTeamRole(team, uid, userEmail)) return true;
  }
  return false;
}

/**
 * Returns true if the user can EDIT project content (tasks, phases, sub-projects).
 * Requires owner, admin or super-user in team.
 */
export function canEditProjectContent(uid: string, userEmail: string, project: Project): boolean {
  if (project.ownerUid === uid) return true;
  if (project.teamId) {
    const team = getTeam(project.teamId);
    if (team && canEditContent(team, uid, userEmail)) return true;
  }
  return false;
}

/**
 * Returns true if the user can EDIT the project itself (name, settings, etc.).
 * Requires owner or admin in team.
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
 * Team lookups are cached per call to avoid N+1.
 */
export function listProjects(uid: string, userEmail: string): Project[] {
  const teamMembershipCache = new Map<string, boolean>();
  const isTeamMember = (teamId: string): boolean => {
    const cached = teamMembershipCache.get(teamId);
    if (cached !== undefined) return cached;
    const team = getTeam(teamId);
    const result = !!team && team.members.some((m) => m.email === userEmail);
    teamMembershipCache.set(teamId, result);
    return result;
  };

  const results: Project[] = [];
  for (const p of projectsById.values()) {
    if (p.ownerUid === uid) {
      results.push(p);
      continue;
    }
    if (p.teamId && isTeamMember(p.teamId)) {
      results.push(p);
    }
  }
  return results.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
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

  if (input.parentProjectId) {
    const parent = projectsById.get(input.parentProjectId);
    if (!parent) throw new NotFoundError("Projet parent introuvable");
    if (parent.parentProjectId) {
      throw new ForbiddenError("Impossible de créer un sous-projet dans un sous-projet (1 niveau max)");
    }
    if (!canAccessProject(uid, userEmail, parent)) {
      throw new ForbiddenError("Accès au projet parent refusé");
    }
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    ownerUid: uid,
    teamId: input.teamId ?? null,
    parentProjectId: input.parentProjectId ?? null,
    tags: [],
    sortOrder: 0,
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
  if (input.teamId !== undefined) {
    if (input.teamId) {
      const targetTeam = getTeam(input.teamId);
      if (!targetTeam) throw new NotFoundError("Équipe introuvable");
      if (!canManageProjects(targetTeam, uid, userEmail)) {
        throw new ForbiddenError("Vous devez être admin de l'équipe cible");
      }
    }
    project.teamId = input.teamId;
  }
  if (input.status !== undefined) project.status = input.status;
  if (input.parentProjectId !== undefined) {
    if (input.parentProjectId) {
      const targetParent = projectsById.get(input.parentProjectId);
      if (!targetParent) throw new NotFoundError("Projet parent introuvable");
      if (targetParent.parentProjectId) {
        throw new ForbiddenError("Impossible d'imbriquer sous un sous-projet (1 niveau max)");
      }
      if (!canAccessProject(uid, userEmail, targetParent)) {
        throw new ForbiddenError("Accès au projet parent refusé");
      }
      const childRange = getProjectDateRange(id);
      const parentRange = getProjectDateRange(input.parentProjectId);
      if (childRange.start && parentRange.start && childRange.start < parentRange.start) {
        throw new ValidationError(`Les dates du sous-projet dépassent celles du projet parent (début parent: ${parentRange.start})`);
      }
      if (childRange.end && parentRange.end && childRange.end > parentRange.end) {
        throw new ValidationError(`Les dates du sous-projet dépassent celles du projet parent (fin parent: ${parentRange.end})`);
      }
    }
    project.parentProjectId = input.parentProjectId;
  }
  if (input.tags !== undefined) project.tags = input.tags.map((t) => t.trim()).filter(Boolean);
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

/**
 * Batch-reorder projects by setting sortOrder based on array position.
 */
export function reorderProjects(uid: string, userEmail: string, projectIds: string[]): number {
  let updated = 0;
  for (let i = 0; i < projectIds.length; i++) {
    const p = projectsById.get(projectIds[i]);
    if (!p) continue;
    if (!canAccessProject(uid, userEmail, p)) continue;
    if (p.sortOrder !== i) {
      p.sortOrder = i;
      updated++;
    }
  }
  if (updated > 0) persist();
  return updated;
}

// ── Phase CRUD ──

export function getProjectDateRange(projectId: string): { start: string | null; end: string | null } {
  const project = projectsById.get(projectId);
  if (!project) return { start: null, end: null };
  const starts = project.phases.map((p) => p.startDate).filter(Boolean) as string[];
  const ends = project.phases.map((p) => p.endDate).filter(Boolean) as string[];
  return {
    start: starts.length ? starts.sort()[0] : null,
    end: ends.length ? ends.sort().reverse()[0] : null,
  };
}

export function findPhaseById(phaseId: string): ProjectPhase | null {
  for (const project of projectsById.values()) {
    const phase = project.phases.find((p) => p.id === phaseId);
    if (phase) return phase;
  }
  return null;
}

function validatePhaseDatesAgainstParent(project: Project, startDate: string | null, endDate: string | null): void {
  if (!project.parentProjectId) return;
  const parentRange = getProjectDateRange(project.parentProjectId);
  if (startDate && parentRange.start && startDate < parentRange.start) {
    throw new ValidationError(`La date de début de la phase ne peut pas être antérieure au projet parent (${parentRange.start})`);
  }
  if (endDate && parentRange.end && endDate > parentRange.end) {
    throw new ValidationError(`La date de fin de la phase ne peut pas dépasser celle du projet parent (${parentRange.end})`);
  }
}

export function addPhase(projectId: string, input: CreatePhaseInput): ProjectPhase {
  const project = projectsById.get(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!input.name?.trim()) throw new ValidationError("Le nom de la phase est requis");

  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;
  validatePhaseDatesAgainstParent(project, startDate, endDate);

  const phase: ProjectPhase = {
    id: crypto.randomUUID(),
    projectId,
    name: input.name.trim(),
    color: input.color ?? PHASE_COLORS[project.phases.length % PHASE_COLORS.length],
    order: project.phases.length,
    startDate,
    endDate,
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

  const newStart = input.startDate !== undefined ? input.startDate : phase.startDate;
  const newEnd = input.endDate !== undefined ? input.endDate : phase.endDate;
  validatePhaseDatesAgainstParent(project, newStart, newEnd);

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
