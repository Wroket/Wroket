import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { findUserByUid, findUserByEmail } from "./authService";
import { getTeam, canManageProjects, getTeamRole } from "./teamService";

export type ProjectStatus = "active" | "archived";

/** Per-project access for team-linked projects (subset of team roster). */
export type ProjectAccessRole = "viewer" | "editor" | "admin";

export interface ProjectAccessEntry {
  email: string;
  role: ProjectAccessRole;
}

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
  /** When teamId is set, ACL for that team’s roster; personal projects omit or ignore. */
  projectAccess?: ProjectAccessEntry[];
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

const VALID_PROJECT_ACCESS_ROLES = new Set<ProjectAccessRole>(["viewer", "editor", "admin"]);

function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Distinct emails: team owner + members (lowercase). */
export function getTeamRosterEmails(team: { ownerUid: string; members: { email: string }[] }): string[] {
  const set = new Set<string>();
  const owner = findUserByUid(team.ownerUid);
  if (owner?.email) set.add(normalizeUserEmail(owner.email));
  for (const m of team.members) {
    if (m.email) set.add(normalizeUserEmail(m.email));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Ensure at least one admin after filtering or edits. */
function reconcileProjectAccessAdmins(
  entries: ProjectAccessEntry[],
  team: NonNullable<ReturnType<typeof getTeam>>,
  _actingUid: string,
  actingEmail: string,
): ProjectAccessEntry[] {
  if (entries.some((e) => e.role === "admin")) return entries;
  const copy = entries.map((e) => ({ ...e }));
  const actorNorm = normalizeUserEmail(actingEmail);
  const owner = findUserByUid(team.ownerUid);
  const ownerNorm = owner?.email ? normalizeUserEmail(owner.email) : "";
  const prefer = copy.findIndex((e) => e.email === actorNorm || e.email === ownerNorm);
  if (prefer >= 0) copy[prefer]!.role = "admin";
  else if (copy.length > 0) copy[0]!.role = "admin";
  else copy.push({ email: actorNorm, role: "admin" });
  return copy;
}

/**
 * Default ACL: creator + team owner as admin, everyone else on roster as editor.
 */
export function buildDefaultProjectAccess(
  team: NonNullable<ReturnType<typeof getTeam>>,
  creatorUid: string,
  creatorEmail: string,
): ProjectAccessEntry[] {
  const roster = getTeamRosterEmails(team);
  const creatorNorm = normalizeUserEmail(creatorEmail);
  const ownerUser = findUserByUid(team.ownerUid);
  const ownerEmailNorm = ownerUser?.email ? normalizeUserEmail(ownerUser.email) : "";

  return roster.map((email) => {
    if (email === creatorNorm || (ownerEmailNorm && email === ownerEmailNorm)) {
      return { email, role: "admin" as const };
    }
    return { email, role: "editor" as const };
  });
}

/**
 * Migrate legacy team projects: derive ACL from former team-role semantics.
 */
function migrateProjectAccessFromTeamRoles(project: Project): ProjectAccessEntry[] | null {
  if (!project.teamId) return null;
  const team = getTeam(project.teamId);
  if (!team) return null;
  const roster = getTeamRosterEmails(team);
  const entries: ProjectAccessEntry[] = [];
  for (const email of roster) {
    const u = findUserByEmail(email);
    const role = u ? getTeamRole(team, u.uid, email) : null;
    if (!role) {
      entries.push({ email, role: "viewer" });
      continue;
    }
    if (role === "owner" || role === "co-owner" || role === "admin") {
      entries.push({ email, role: "admin" });
    } else if (role === "super-user") {
      entries.push({ email, role: "editor" });
    } else {
      entries.push({ email, role: "viewer" });
    }
  }
  return entries;
}

function ensureProjectAccessInitialized(project: Project): boolean {
  if (!project.teamId) {
    if (project.projectAccess !== undefined) {
      delete project.projectAccess;
      return true;
    }
    return false;
  }
  const list = project.projectAccess;
  if (list && list.length > 0) return false;
  const migrated = migrateProjectAccessFromTeamRoles(project);
  if (!migrated?.length) return false;
  project.projectAccess = migrated;
  return true;
}

(function hydrate() {
  const store = getStore();
  let migratedCount = 0;
  if (store.projects) {
    for (const [id, raw] of Object.entries(store.projects)) {
      const project = raw as Project;
      if (!project.phases) project.phases = [];
      if (project.parentProjectId === undefined) project.parentProjectId = null;
      if (!project.tags) project.tags = [];
      if (project.sortOrder === undefined) project.sortOrder = 0;
      if (ensureProjectAccessInitialized(project)) migratedCount++;
      projectsById.set(id, project);
    }
    if (migratedCount > 0) {
      scheduleSave("projects");
      console.log("[projects] projectAccess migré pour %d projet(s) d'équipe", migratedCount);
    }
    console.log("[projects] %d projet(s) chargé(s)", projectsById.size);
  }
})();

function accessEntryForEmail(project: Project, userEmail: string): ProjectAccessEntry | undefined {
  const me = normalizeUserEmail(userEmail);
  return project.projectAccess?.find((e) => e.email === me);
}

/**
 * Team governance: owner / co-owner / admin can see and fix any team project.
 */
function teamGovernanceCanManage(team: NonNullable<ReturnType<typeof getTeam>>, uid: string, userEmail: string): boolean {
  return canManageProjects(team, uid, userEmail);
}

/**
 * Returns true if the user can VIEW the project.
 * Personal: owner only. Team: ACL entry or team governance (manage projects).
 */
export function canAccessProject(uid: string, userEmail: string, project: Project): boolean {
  if (!project.teamId) {
    return project.ownerUid === uid;
  }
  const team = getTeam(project.teamId);
  if (!team) return false;
  if (teamGovernanceCanManage(team, uid, userEmail)) return true;
  const entry = accessEntryForEmail(project, userEmail);
  return !!entry;
}

/**
 * Returns true if the user can EDIT project content (tasks, phases, sub-projects).
 */
export function canEditProjectContent(uid: string, userEmail: string, project: Project): boolean {
  if (!project.teamId) {
    return project.ownerUid === uid;
  }
  const team = getTeam(project.teamId);
  if (!team) return false;
  if (teamGovernanceCanManage(team, uid, userEmail)) return true;
  const r = accessEntryForEmail(project, userEmail)?.role;
  return r === "editor" || r === "admin";
}

/**
 * Returns true if the user can EDIT the project itself (name, settings, tags, archive).
 */
export function canEditProject(uid: string, userEmail: string, project: Project): boolean {
  if (!project.teamId) {
    return project.ownerUid === uid;
  }
  const team = getTeam(project.teamId);
  if (!team) return false;
  if (teamGovernanceCanManage(team, uid, userEmail)) return true;
  return accessEntryForEmail(project, userEmail)?.role === "admin";
}

/**
 * Who may change projectAccess list.
 */
export function canManageProjectAccess(uid: string, userEmail: string, project: Project): boolean {
  if (!project.teamId) {
    return project.ownerUid === uid;
  }
  const team = getTeam(project.teamId);
  if (!team) return false;
  if (teamGovernanceCanManage(team, uid, userEmail)) return true;
  return accessEntryForEmail(project, userEmail)?.role === "admin";
}

/**
 * Returns projects the user can access (personal owner, or team ACL / governance).
 */
export function listProjects(uid: string, userEmail: string): Project[] {
  const results: Project[] = [];
  for (const p of projectsById.values()) {
    if (!p.teamId) {
      if (p.ownerUid === uid) results.push(p);
      continue;
    }
    const team = getTeam(p.teamId);
    if (!team) continue;
    if (teamGovernanceCanManage(team, uid, userEmail)) {
      results.push(p);
      continue;
    }
    if (accessEntryForEmail(p, userEmail)) results.push(p);
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

  if (input.teamId) {
    const team = getTeam(input.teamId)!;
    if (input.parentProjectId) {
      const parent = projectsById.get(input.parentProjectId);
      if (parent?.projectAccess?.length) {
        project.projectAccess = parent.projectAccess.map((e) => ({ ...e }));
      } else {
        project.projectAccess = buildDefaultProjectAccess(team, uid, userEmail);
      }
    } else {
      project.projectAccess = buildDefaultProjectAccess(team, uid, userEmail);
    }
  }

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
      const roster = new Set(getTeamRosterEmails(targetTeam));
      const prevAccess = project.projectAccess ?? [];
      const filtered = prevAccess.filter((e) => roster.has(normalizeUserEmail(e.email)));
      project.teamId = input.teamId;
      project.projectAccess =
        filtered.length > 0
          ? reconcileProjectAccessAdmins(filtered, targetTeam, uid, userEmail)
          : buildDefaultProjectAccess(targetTeam, uid, userEmail);
    } else {
      project.teamId = null;
      delete project.projectAccess;
    }
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

export function deleteProject(uid: string, userEmail: string, id: string): void {
  const project = projectsById.get(id);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!project.teamId) {
    if (project.ownerUid === uid) {
      projectsById.delete(id);
      persist();
      return;
    }
    throw new ForbiddenError("Seul le propriétaire peut supprimer ce projet");
  }
  const team = getTeam(project.teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (teamGovernanceCanManage(team, uid, userEmail)) {
    projectsById.delete(id);
    persist();
    return;
  }
  if (accessEntryForEmail(project, userEmail)?.role === "admin") {
    projectsById.delete(id);
    persist();
    return;
  }
  throw new ForbiddenError("Seuls les administrateurs du projet ou de l'équipe peuvent supprimer ce projet");
}

/**
 * Replace project ACL. Caller must pass canManageProjectAccess.
 */
export function setProjectAccessForUser(
  uid: string,
  userEmail: string,
  projectId: string,
  entries: ProjectAccessEntry[],
): Project {
  const project = projectsById.get(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!project.teamId) {
    throw new ValidationError("Les permissions par membre s'appliquent uniquement aux projets d'équipe");
  }
  if (!canManageProjectAccess(uid, userEmail, project)) {
    throw new ForbiddenError("Accès réservé aux administrateurs du projet ou de l'équipe");
  }
  const team = getTeam(project.teamId);
  if (!team) throw new NotFoundError("Équipe introuvable");

  const roster = new Set(getTeamRosterEmails(team));
  const seen = new Set<string>();
  const normalised: ProjectAccessEntry[] = [];
  for (const raw of entries) {
    const email = normalizeUserEmail(typeof raw.email === "string" ? raw.email : "");
    const role = raw.role;
    if (!email || !email.includes("@")) throw new ValidationError("Email invalide dans la liste d'accès");
    if (!VALID_PROJECT_ACCESS_ROLES.has(role)) throw new ValidationError("Rôle projet invalide (viewer, editor, admin)");
    if (!roster.has(email)) throw new ValidationError(`L'email ${email} ne fait pas partie de l'équipe du projet`);
    if (seen.has(email)) throw new ValidationError(`Doublon pour ${email}`);
    seen.add(email);
    normalised.push({ email, role });
  }
  if (!normalised.some((e) => e.role === "admin")) {
    throw new ValidationError("Au moins un administrateur de projet est requis");
  }

  project.projectAccess = normalised;
  project.updatedAt = new Date().toISOString();
  persist();
  return project;
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
