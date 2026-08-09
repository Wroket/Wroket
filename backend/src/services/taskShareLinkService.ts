import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { getProjectById } from "./projectService";
import { findTodoForUser, type Todo } from "./todoService";
import type { ShareLinkExpiryDays } from "./projectShareLinkService";

export interface TaskShareLink {
  id: string;
  token: string;
  todoId: string;
  ownerUid: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
}

export interface SharedTaskView {
  title: string;
  status: Todo["status"];
  priority: Todo["priority"];
  effort: Todo["effort"];
  startDate: string | null;
  deadline: string | null;
  phaseName: string | null;
  projectName: string | null;
  /** Public summary — tags only (no attachments / private notes). */
  summary: string;
  tags: string[];
  sharedAt: string;
  expiresAt: string | null;
}

const MAX_LINKS_PER_TODO = 5;
const linksByToken = new Map<string, TaskShareLink>();

function hydrate(): void {
  linksByToken.clear();
  const raw = getStore().taskShareLinks;
  if (!raw || typeof raw !== "object") return;
  for (const [token, row] of Object.entries(raw)) {
    const link = row as TaskShareLink;
    if (link?.token) linksByToken.set(link.token, link);
    else linksByToken.set(token, { ...link, token });
  }
}

if (getStore().taskShareLinks) {
  hydrate();
}

function persist(): void {
  const obj: Record<string, TaskShareLink> = {};
  linksByToken.forEach((link) => {
    obj[link.token] = link;
  });
  getStore().taskShareLinks = obj;
  scheduleSave("taskShareLinks");
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

function isActive(link: TaskShareLink, now = new Date()): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && new Date(link.expiresAt) < now) return false;
  return true;
}

export function reloadTaskShareLinksFromStore(): void {
  hydrate();
}

export function listTaskShareLinksForTodo(todoId: string): TaskShareLink[] {
  return [...linksByToken.values()]
    .filter((l) => l.todoId === todoId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Hard-delete links for todos owned by uid, or for explicit todo ids (RGPD). */
export function purgeTaskShareLinksForOwner(uid: string, todoIds?: Set<string>): number {
  let n = 0;
  for (const [token, link] of [...linksByToken.entries()]) {
    const matchOwner = link.ownerUid === uid;
    const matchTodo = todoIds ? todoIds.has(link.todoId) : false;
    if (matchOwner || matchTodo) {
      linksByToken.delete(token);
      n++;
    }
  }
  if (n > 0) persist();
  return n;
}

export async function createTaskShareLink(
  uid: string,
  userEmail: string,
  todoId: string,
  options?: { label?: string | null; expiryDays?: ShareLinkExpiryDays },
): Promise<TaskShareLink> {
  const lookup = await findTodoForUser(uid, todoId, userEmail);
  if (!lookup) throw new NotFoundError("Tâche introuvable");
  if (!lookup.isOwner) {
    throw new ForbiddenError("Seul le propriétaire de la tâche peut créer un lien de partage");
  }

  const active = listTaskShareLinksForTodo(todoId).filter((l) => isActive(l));
  if (active.length >= MAX_LINKS_PER_TODO) {
    throw new ValidationError(`Maximum ${MAX_LINKS_PER_TODO} liens actifs par tâche`, "TASK_SHARE_LINK_LIMIT");
  }

  const now = new Date().toISOString();
  const link: TaskShareLink = {
    id: crypto.randomUUID(),
    token: newToken(),
    todoId,
    ownerUid: uid,
    label: options?.label?.trim() || null,
    createdAt: now,
    expiresAt: expiryFromDays(options?.expiryDays ?? 30),
    revokedAt: null,
    lastAccessedAt: null,
  };
  linksByToken.set(link.token, link);
  persist();
  return link;
}

export async function revokeTaskShareLink(
  uid: string,
  userEmail: string,
  todoId: string,
  linkId: string,
): Promise<TaskShareLink> {
  const lookup = await findTodoForUser(uid, todoId, userEmail);
  if (!lookup) throw new NotFoundError("Tâche introuvable");
  if (!lookup.isOwner) {
    throw new ForbiddenError("Seul le propriétaire de la tâche peut révoquer un lien");
  }

  const link = [...linksByToken.values()].find((l) => l.id === linkId && l.todoId === todoId);
  if (!link) throw new NotFoundError("Lien introuvable");
  link.revokedAt = new Date().toISOString();
  linksByToken.set(link.token, link);
  persist();
  return link;
}

export function resolveTaskShareLink(token: string): TaskShareLink | null {
  const link = linksByToken.get(token);
  if (!link || !isActive(link)) return null;
  return link;
}

export async function getSharedTaskView(token: string): Promise<SharedTaskView> {
  const link = resolveTaskShareLink(token);
  if (!link) {
    throw new NotFoundError("Lien expiré ou révoqué", "TASK_SHARE_LINK_INVALID");
  }

  const lookup = await findTodoForUser(link.ownerUid, link.todoId);
  if (!lookup || lookup.todo.status === "deleted") {
    throw new NotFoundError("Tâche introuvable", "TASK_SHARE_LINK_INVALID");
  }
  const todo = lookup.todo;

  let phaseName: string | null = null;
  let projectName: string | null = null;
  if (todo.projectId) {
    const project = getProjectById(todo.projectId);
    if (project) {
      projectName = project.name;
      if (todo.phaseId) {
        phaseName = project.phases?.find((p) => p.id === todo.phaseId)?.name ?? null;
      }
    }
  }

  link.lastAccessedAt = new Date().toISOString();
  linksByToken.set(link.token, link);
  persist();

  const tags = todo.tags ?? [];
  return {
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    effort: todo.effort ?? "medium",
    startDate: todo.startDate ?? null,
    deadline: todo.deadline,
    phaseName,
    projectName,
    summary: tags.length > 0 ? tags.join(" · ") : "",
    tags,
    sharedAt: link.createdAt,
    expiresAt: link.expiresAt,
  };
}
