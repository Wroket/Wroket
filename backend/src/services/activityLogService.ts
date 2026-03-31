import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

const MAX_ENTRIES = 10_000;
const activityLog: ActivityLogEntry[] = [];

function persist(): void {
  const store = getStore();
  store.activityLog = activityLog;
  scheduleSave("activityLog");
}

(function hydrate() {
  const store = getStore();
  if (store.activityLog) {
    activityLog.push(...(store.activityLog as ActivityLogEntry[]));
    console.log("[activityLog] chargées : %d entrée(s)", activityLog.length);
  }
})();

export function logActivity(
  userId: string,
  userEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
): void {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_ENTRIES) activityLog.length = MAX_ENTRIES;
  persist();
}

export function getTaskActivity(todoId: string): ActivityLogEntry[] {
  return activityLog
    .filter((e) => e.entityId === todoId && e.entityType === "todo")
    .slice(0, 50);
}

export function getActivityLog(filters?: {
  userId?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}): { entries: ActivityLogEntry[]; total: number } {
  let filtered = activityLog;
  if (filters?.userId) filtered = filtered.filter((e) => e.userId === filters.userId);
  if (filters?.entityType) filtered = filtered.filter((e) => e.entityType === filters.entityType);
  const total = filtered.length;
  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return { entries: filtered.slice(offset, offset + limit), total };
}

