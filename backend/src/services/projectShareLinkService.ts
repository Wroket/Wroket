import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import {
  canEditProject,
  getProjectById,
  type Project,
  type ProjectPhase,
} from "./projectService";
import { listProjectTodos, type Todo } from "./todoService";
import {
  computeProjectSteeringSnapshot,
  type ProjectSteeringSnapshot,
} from "./projectSteeringService";

export type ShareLinkExpiryDays = 7 | 30 | 90 | null;
export type ShareLinkTab = "pilotage" | "kanban" | "gantt";

export const ALL_SHARE_TABS: ShareLinkTab[] = ["pilotage", "kanban", "gantt"];

export interface ProjectShareLink {
  id: string;
  token: string;
  projectId: string;
  createdByUid: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  /** Onglets visibles sur la vue publique. Absent sur les liens legacy → les 3 onglets. */
  allowedTabs?: ShareLinkTab[];
}

export interface SharedProjectTaskRow {
  id: string;
  title: string;
  status: Todo["status"];
  phaseId: string | null;
  phaseName: string;
  startDate: string | null;
  deadline: string | null;
  priority: Todo["priority"];
  effort: Todo["effort"];
  sortOrder: number;
  isBlocked: boolean;
  blockedByTodoIds: string[];
}

export interface SharedProjectMilestoneRow {
  id: string;
  title: string;
  date: string;
  phaseId: string | null;
  color: string;
  order: number;
}

export interface SharedProjectView {
  projectName: string;
  projectDescription: string;
  phases: Pick<ProjectPhase, "id" | "name" | "color" | "startDate" | "endDate" | "order">[];
  milestones: SharedProjectMilestoneRow[];
  steering: ProjectSteeringSnapshot;
  tasks: SharedProjectTaskRow[];
  sharedAt: string;
  expiresAt: string | null;
  allowedTabs: ShareLinkTab[];
}

const MAX_LINKS_PER_PROJECT = 10;
const linksByToken = new Map<string, ProjectShareLink>();

function hydrateShareLinks(): void {
  linksByToken.clear();
  const raw = getStore().projectShareLinks;
  if (!raw || typeof raw !== "object") return;
  for (const [token, row] of Object.entries(raw)) {
    const link = row as ProjectShareLink;
    if (link?.token) linksByToken.set(link.token, link);
    else linksByToken.set(token, { ...link, token });
  }
}

if (getStore().projectShareLinks) {
  hydrateShareLinks();
}

function persistShareLinks(): void {
  const obj: Record<string, ProjectShareLink> = {};
  linksByToken.forEach((link) => {
    obj[link.token] = link;
  });
  getStore().projectShareLinks = obj;
  scheduleSave("projectShareLinks");
}

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function expiryFromDays(days: ShareLinkExpiryDays): string | null {
  if (days === null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isLinkActive(link: ProjectShareLink, now = new Date()): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && new Date(link.expiresAt) < now) return false;
  return true;
}

/** Résout les onglets d'un lien (legacy sans champ → les 3 onglets). */
export function resolveShareTabs(link: ProjectShareLink): ShareLinkTab[] {
  const raw = link.allowedTabs;
  if (!raw?.length) return [...ALL_SHARE_TABS];
  const valid = [...new Set(raw.filter((t) => ALL_SHARE_TABS.includes(t)))];
  return valid.length > 0 ? valid : [...ALL_SHARE_TABS];
}

function parseShareTabsInput(tabs: unknown): ShareLinkTab[] {
  if (!Array.isArray(tabs)) return [...ALL_SHARE_TABS];
  const valid = [...new Set(tabs.filter((t): t is ShareLinkTab => ALL_SHARE_TABS.includes(t as ShareLinkTab)))];
  if (valid.length === 0) {
    throw new ValidationError("Au moins un onglet doit être sélectionné", "SHARE_TABS_REQUIRED");
  }
  return valid;
}

export function listShareLinksForProject(projectId: string): ProjectShareLink[] {
  return [...linksByToken.values()]
    .filter((l) => l.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createProjectShareLink(
  uid: string,
  userEmail: string,
  projectId: string,
  options?: { label?: string | null; expiryDays?: ShareLinkExpiryDays; tabs?: ShareLinkTab[] },
): ProjectShareLink {
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProject(uid, userEmail, project)) {
    throw new ForbiddenError("Seul un administrateur du projet peut créer un lien de partage");
  }

  const existing = listShareLinksForProject(projectId).filter((l) => isLinkActive(l));
  if (existing.length >= MAX_LINKS_PER_PROJECT) {
    throw new ValidationError(
      `Maximum ${MAX_LINKS_PER_PROJECT} liens actifs par projet`,
      "SHARE_LINK_LIMIT",
    );
  }

  const expiryDays = options?.expiryDays ?? 30;
  const allowedTabs = parseShareTabsInput(options?.tabs);
  const now = new Date().toISOString();
  const link: ProjectShareLink = {
    id: crypto.randomUUID(),
    token: newToken(),
    projectId,
    createdByUid: uid,
    label: options?.label?.trim() || null,
    createdAt: now,
    expiresAt: expiryFromDays(expiryDays),
    revokedAt: null,
    lastAccessedAt: null,
    allowedTabs,
  };
  linksByToken.set(link.token, link);
  persistShareLinks();
  return link;
}

export function revokeProjectShareLink(
  uid: string,
  userEmail: string,
  projectId: string,
  linkId: string,
): ProjectShareLink {
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProject(uid, userEmail, project)) {
    throw new ForbiddenError("Seul un administrateur du projet peut révoquer un lien");
  }

  const link = [...linksByToken.values()].find((l) => l.id === linkId && l.projectId === projectId);
  if (!link) throw new NotFoundError("Lien introuvable");
  link.revokedAt = new Date().toISOString();
  linksByToken.set(link.token, link);
  persistShareLinks();
  return link;
}

function buildSharedTaskRows(project: Project, todos: Todo[]): SharedProjectTaskRow[] {
  const phaseMap = new Map((project.phases ?? []).map((p) => [p.id, p.name]));
  const byId = new Map(todos.map((t) => [t.id, t]));

  return todos
    .filter((t) => !t.parentId && t.status !== "deleted")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title))
    .map((t) => {
      const activeBlockers = (t.blockedByTodoIds ?? []).filter((id) => {
        const b = byId.get(id);
        return b && b.status === "active";
      });
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        phaseId: t.phaseId ?? null,
        phaseName: t.phaseId ? phaseMap.get(t.phaseId) ?? "" : "",
        startDate: t.startDate ?? null,
        deadline: t.deadline,
        priority: t.priority,
        effort: t.effort ?? "medium",
        sortOrder: t.sortOrder ?? 0,
        isBlocked: activeBlockers.length > 0,
        blockedByTodoIds: activeBlockers,
      };
    });
}

export function resolveShareLink(token: string): ProjectShareLink | null {
  const link = linksByToken.get(token);
  if (!link || !isLinkActive(link)) return null;
  return link;
}

export function getSharedProjectView(token: string): SharedProjectView {
  const link = resolveShareLink(token);
  if (!link) {
    throw new NotFoundError("Lien expiré ou révoqué", "SHARE_LINK_INVALID");
  }

  const project = getProjectById(link.projectId);
  if (!project || project.status !== "active") {
    throw new NotFoundError("Projet introuvable", "SHARE_LINK_INVALID");
  }

  const todos = listProjectTodos(project.id);
  const steering = computeProjectSteeringSnapshot(project, todos);
  const phases = [...(project.phases ?? [])].sort((a, b) => a.order - b.order);
  const milestones = [...(project.milestones ?? [])].sort((a, b) => a.order - b.order);

  link.lastAccessedAt = new Date().toISOString();
  linksByToken.set(link.token, link);
  persistShareLinks();

  return {
    projectName: project.name,
    projectDescription: project.description ?? "",
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      startDate: p.startDate,
      endDate: p.endDate,
      order: p.order,
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      phaseId: m.phaseId,
      color: m.color,
      order: m.order,
    })),
    steering,
    tasks: buildSharedTaskRows(project, todos),
    sharedAt: link.createdAt,
    expiresAt: link.expiresAt,
    allowedTabs: resolveShareTabs(link),
  };
}

/** Test helper — reset in-memory map from store snapshot. */
export function reloadShareLinksFromStore(): void {
  hydrateShareLinks();
}
