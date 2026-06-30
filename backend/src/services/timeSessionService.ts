import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { getEntitlementsForUid } from "./authService";
import { findTodoForUser } from "./todoService";

export interface TimeSession {
  id: string;
  todoId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  note: string | null;
  source: "timer" | "manual";
  createdAt: string;
}

const sessionsById = new Map<string, TimeSession>();
const activeTimerByUser = new Map<string, string>();

function hydrate(): void {
  sessionsById.clear();
  activeTimerByUser.clear();
  const raw = getStore().timeSessions;
  if (!raw || typeof raw !== "object") return;
  for (const [id, row] of Object.entries(raw)) {
    const s = row as TimeSession;
    sessionsById.set(id, s);
    if (!s.endedAt) activeTimerByUser.set(s.userId, id);
  }
}

if (getStore().timeSessions) hydrate();

function persist(): void {
  const obj: Record<string, TimeSession> = {};
  sessionsById.forEach((s, id) => { obj[id] = s; });
  getStore().timeSessions = obj;
  scheduleSave("timeSessions");
}

function assertTimeTrackingEntitlement(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new ForbiddenError(
      "Le suivi du temps nécessite le palier Small teams ou supérieur.",
      "TIME_TRACKING_PLAN_REQUIRED",
    );
  }
}

export function listTimeSessionsForTodo(todoId: string): TimeSession[] {
  return [...sessionsById.values()]
    .filter((s) => s.todoId === todoId && s.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function sumMinutesForTodo(todoId: string): number {
  return listTimeSessionsForTodo(todoId).reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
}

export function getActiveTimerForUser(userId: string): TimeSession | null {
  const id = activeTimerByUser.get(userId);
  if (!id) return null;
  return sessionsById.get(id) ?? null;
}

export async function startTimeTimer(userId: string, userEmail: string, todoId: string): Promise<TimeSession> {
  assertTimeTrackingEntitlement(userId);
  const found = await findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");

  const existing = activeTimerByUser.get(userId);
  if (existing) {
    throw new ValidationError("Un chronomètre est déjà en cours — arrêtez-le d'abord", "TIMER_ALREADY_RUNNING");
  }

  const now = new Date().toISOString();
  const session: TimeSession = {
    id: crypto.randomUUID(),
    todoId,
    userId,
    startedAt: now,
    endedAt: null,
    durationMinutes: null,
    note: null,
    source: "timer",
    createdAt: now,
  };
  sessionsById.set(session.id, session);
  activeTimerByUser.set(userId, session.id);
  persist();
  return session;
}

export function stopTimeTimer(userId: string, todoId?: string): TimeSession {
  assertTimeTrackingEntitlement(userId);
  const activeId = activeTimerByUser.get(userId);
  if (!activeId) throw new ValidationError("Aucun chronomètre en cours", "TIMER_NOT_RUNNING");
  const session = sessionsById.get(activeId);
  if (!session || session.endedAt) {
    activeTimerByUser.delete(userId);
    throw new ValidationError("Aucun chronomètre en cours", "TIMER_NOT_RUNNING");
  }
  if (todoId && session.todoId !== todoId) {
    throw new ValidationError("Le chronomètre actif concerne une autre tâche", "TIMER_WRONG_TASK");
  }

  const end = new Date();
  const start = new Date(session.startedAt);
  const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  session.endedAt = end.toISOString();
  session.durationMinutes = mins;
  activeTimerByUser.delete(userId);
  persist();
  return session;
}

export async function addManualTimeSession(
  userId: string,
  todoId: string,
  durationMinutes: number,
  note?: string | null,
  startedAt?: string,
): Promise<TimeSession> {
  assertTimeTrackingEntitlement(userId);
  const found = await findTodoForUser(userId, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new ValidationError("durationMinutes doit être entre 1 et 1440");
  }

  const start = startedAt ? new Date(startedAt) : new Date();
  if (isNaN(start.getTime())) throw new ValidationError("Date de début invalide");
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const now = new Date().toISOString();

  const session: TimeSession = {
    id: crypto.randomUUID(),
    todoId,
    userId,
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationMinutes: Math.round(durationMinutes),
    note: note?.trim().substring(0, 500) || null,
    source: "manual",
    createdAt: now,
  };
  sessionsById.set(session.id, session);
  persist();
  return session;
}

export function reloadTimeSessionsFromStore(): void {
  hydrate();
}
