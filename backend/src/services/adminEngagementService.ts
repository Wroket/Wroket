import { getStore } from "../persistence";
import { getActivityEntriesSince } from "./activityLogService";
import { countGoogleCalendarConnected, countMicrosoftCalendarConnected } from "./authService";
import {
  forEachInMemoryTodo,
  getInMemoryTodoIdsByOwner,
  type Todo,
} from "./todoService";

export type AdminEngagementPeriodDays = 7 | 14 | 30;

export interface AdminEngagementWeeklyBucket {
  weekStartUtc: string;
  weekEndUtc: string;
  signups: number;
  completions: number;
}

export interface AdminEngagementVelocityWeek {
  weekStartUtc: string;
  weekEndUtc: string;
  completed: number;
}

export interface AdminFeatureAdoption {
  key: string;
  count: number;
  percent: number;
}

export interface AdminEngagementSnapshot {
  periodDays: AdminEngagementPeriodDays;
  generatedAt: string;
  activeUsers: {
    dau: number;
    wau: number;
    mau: number;
    totalUsers: number;
  };
  growth: {
    emailVerificationRate: number;
    weeklyTrends: AdminEngagementWeeklyBucket[];
  };
  tasks: {
    summary: {
      active: number;
      createdInPeriod: number;
      completedInPeriod: number;
      cancelledInPeriod: number;
    };
    velocityWeeks: AdminEngagementVelocityWeek[];
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byEffort: Record<string, number>;
  };
  adoption: AdminFeatureAdoption[];
}

function isoUtcDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfUtcWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const day = x.getUTCDay();
  const delta = (day + 6) % 7;
  x.setUTCDate(x.getUTCDate() - delta);
  return x;
}

function safeTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function collectAllTodos(): Todo[] {
  const out: Todo[] = [];
  const inMemoryIds = getInMemoryTodoIdsByOwner();
  if (Object.keys(inMemoryIds).length > 0) {
    forEachInMemoryTodo((_uid, todo) => out.push(todo));
    return out;
  }
  const todoStore = getStore().todos ?? {};
  for (const userTodos of Object.values(todoStore)) {
    for (const todo of Object.values(userTodos as Record<string, Todo>)) {
      out.push(todo);
    }
  }
  return out;
}

function countSessionsActiveSince(sinceMs: number): number {
  const store = getStore();
  const sessionStore = (store.sessions ?? {}) as Record<string, { uid?: string; createdAt?: number; expiresAt?: number }>;
  const now = Date.now();
  const uids = new Set<string>();
  for (const session of Object.values(sessionStore)) {
    const expiresAt = session.expiresAt ?? 0;
    if (now > expiresAt) continue;
    const createdAt = session.createdAt ?? expiresAt - 7 * 24 * 60 * 60 * 1000;
    if (createdAt >= sinceMs && session.uid) uids.add(session.uid);
  }
  return uids.size;
}

async function countUniqueActiveUsers(days: number, nowMs: number): Promise<number> {
  const sinceMs = nowMs - days * 24 * 60 * 60 * 1000;
  const entries = await getActivityEntriesSince(sinceMs);
  const uids = new Set(entries.map((e) => e.userId).filter(Boolean));
  if (uids.size > 0) return uids.size;
  return countSessionsActiveSince(sinceMs);
}

function computeWeeklySignups(now: Date, users: Array<Record<string, unknown>>): number[] {
  const week0 = startOfUtcWeek(now);
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const u of users) {
    const createdMs = safeTimeMs(u.createdAt as string);
    if (createdMs === null) continue;
    for (let i = 0; i < 8; i++) {
      const start = new Date(week0);
      start.setUTCDate(start.getUTCDate() - (7 - i) * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      if (createdMs >= start.getTime() && createdMs < end.getTime()) {
        counts[i]++;
        break;
      }
    }
  }
  return counts;
}

function computeWeeklyCompletions(now: Date, todos: Todo[]): number[] {
  const week0 = startOfUtcWeek(now);
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const todo of todos) {
    if (todo.status !== "completed") continue;
    const t = safeTimeMs(todo.statusChangedAt);
    if (t === null) continue;
    for (let i = 0; i < 8; i++) {
      const start = new Date(week0);
      start.setUTCDate(start.getUTCDate() - (7 - i) * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      if (t >= start.getTime() && t < end.getTime()) {
        counts[i]++;
        break;
      }
    }
  }
  return counts;
}

function buildWeeklyTrends(now: Date, todos: Todo[], users: Array<Record<string, unknown>>): AdminEngagementWeeklyBucket[] {
  const signups = computeWeeklySignups(now, users);
  const completions = computeWeeklyCompletions(now, todos);
  const week0 = startOfUtcWeek(now);
  const buckets: AdminEngagementWeeklyBucket[] = [];
  for (let i = 0; i < 8; i++) {
    const start = new Date(week0);
    start.setUTCDate(start.getUTCDate() - (7 - i) * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    buckets.push({
      weekStartUtc: isoUtcDate(start),
      weekEndUtc: isoUtcDate(end),
      signups: signups[i] ?? 0,
      completions: completions[i] ?? 0,
    });
  }
  return buckets;
}

function computeVelocityWeeks(now: Date, todos: Todo[]): AdminEngagementVelocityWeek[] {
  const week0 = startOfUtcWeek(now);
  const weeks: AdminEngagementVelocityWeek[] = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(week0);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const startMs = start.getTime();
    const endMs = end.getTime();
    let completed = 0;
    for (const todo of todos) {
      if (todo.status !== "completed") continue;
      const t = safeTimeMs(todo.statusChangedAt);
      if (t === null || t < startMs || t >= endMs) continue;
      completed++;
    }
    weeks.push({
      weekStartUtc: isoUtcDate(start),
      weekEndUtc: isoUtcDate(end),
      completed,
    });
  }
  return weeks;
}

function computeAdoption(totalUsers: number): AdminFeatureAdoption[] {
  const store = getStore();
  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const pct = (count: number) => (totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0);

  const googleCount = countGoogleCalendarConnected();
  const microsoftCount = countMicrosoftCalendarConnected();

  const usersWithActiveWebhook = new Set<string>();
  const whStore = store.webhooks ?? {};
  for (const [uid, list] of Object.entries(whStore)) {
    if ((list as Array<{ active?: boolean }>).some((wh) => wh.active !== false)) {
      usersWithActiveWebhook.add(uid);
    }
  }

  let pushEnabled = 0;
  let hasProject = 0;
  let hasNote = 0;

  const projectOwners = new Set<string>();
  for (const p of Object.values(store.projects ?? {})) {
    const ou = (p as { ownerUid?: string }).ownerUid;
    if (ou) projectOwners.add(ou);
  }

  const noteStore = store.notes ?? {};
  const noteOwners = new Set(Object.keys(noteStore).filter((uid) => {
    const notes = (noteStore as Record<string, Record<string, unknown>>)[uid];
    return notes && Object.keys(notes).length > 0;
  }));

  for (const u of users) {
    const uid = u.uid as string;
    if (u.webPushEnabled) pushEnabled++;
    if (projectOwners.has(uid)) hasProject++;
    if (noteOwners.has(uid)) hasNote++;
  }

  const notionUids = new Set<string>();
  const mondayUids = new Set<string>();
  const ext = store.externalConnections ?? {};
  for (const row of Object.values(ext)) {
    const conn = row as { ownerUid?: string; provider?: string };
    if (!conn.ownerUid) continue;
    if (conn.provider === "notion") notionUids.add(conn.ownerUid);
    if (conn.provider === "monday") mondayUids.add(conn.ownerUid);
  }

  let hasScheduled = 0;
  const scheduledUids = new Set<string>();
  if (Object.keys(getInMemoryTodoIdsByOwner()).length > 0) {
    forEachInMemoryTodo((uid, todo) => {
      if (todo.scheduledSlot) scheduledUids.add(uid);
    });
    hasScheduled = scheduledUids.size;
  } else {
    const todoStore = store.todos ?? {};
    for (const [uid, userTodos] of Object.entries(todoStore)) {
      for (const todo of Object.values(userTodos as Record<string, { scheduledSlot?: unknown }>)) {
        if (todo.scheduledSlot) scheduledUids.add(uid);
      }
    }
    hasScheduled = scheduledUids.size;
  }

  return [
    { key: "google_calendar", count: googleCount, percent: pct(googleCount) },
    { key: "microsoft_calendar", count: microsoftCount, percent: pct(microsoftCount) },
    { key: "notion", count: notionUids.size, percent: pct(notionUids.size) },
    { key: "monday", count: mondayUids.size, percent: pct(mondayUids.size) },
    { key: "webhooks_active", count: usersWithActiveWebhook.size, percent: pct(usersWithActiveWebhook.size) },
    { key: "push_enabled", count: pushEnabled, percent: pct(pushEnabled) },
    { key: "has_project", count: hasProject, percent: pct(hasProject) },
    { key: "has_note", count: hasNote, percent: pct(hasNote) },
    { key: "has_scheduled_task", count: hasScheduled, percent: pct(hasScheduled) },
  ];
}

/**
 * Platform-wide engagement metrics for the admin dashboard.
 * Aggregates in-memory store data — no extra Firestore reads beyond activity log cache.
 */
export async function computeAdminEngagementSnapshot(args: {
  periodDays: AdminEngagementPeriodDays;
  now?: Date;
}): Promise<AdminEngagementSnapshot> {
  const now = args.now ?? new Date();
  const nowMs = now.getTime();
  const cutoffMs = nowMs - args.periodDays * 24 * 60 * 60 * 1000;

  const store = getStore();
  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const totalUsers = users.length;
  let verified = 0;
  for (const u of users) {
    if (u.emailVerified) verified++;
  }

  const [dau, wau, mau] = await Promise.all([
    countUniqueActiveUsers(1, nowMs),
    countUniqueActiveUsers(7, nowMs),
    countUniqueActiveUsers(30, nowMs),
  ]);

  const todos = collectAllTodos();
  let active = 0;
  let createdInPeriod = 0;
  let completedInPeriod = 0;
  let cancelledInPeriod = 0;
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byEffort: Record<string, number> = {};

  for (const todo of todos) {
    if (todo.status !== "deleted") {
      byStatus[todo.status] = (byStatus[todo.status] ?? 0) + 1;
      byPriority[todo.priority ?? "medium"] = (byPriority[todo.priority ?? "medium"] ?? 0) + 1;
      byEffort[todo.effort ?? "medium"] = (byEffort[todo.effort ?? "medium"] ?? 0) + 1;
    }

    if (todo.status === "deleted") continue;

    const createdMs = safeTimeMs(todo.createdAt);
    if (createdMs !== null && createdMs >= cutoffMs) createdInPeriod++;

    const statusChangedMs = safeTimeMs(todo.statusChangedAt);
    if (todo.status === "completed") {
      if (statusChangedMs !== null && statusChangedMs >= cutoffMs) completedInPeriod++;
    } else if (todo.status === "cancelled") {
      if (statusChangedMs !== null && statusChangedMs >= cutoffMs) cancelledInPeriod++;
    } else if (todo.status === "active") {
      active++;
    }
  }

  return {
    periodDays: args.periodDays,
    generatedAt: now.toISOString(),
    activeUsers: { dau, wau, mau, totalUsers },
    growth: {
      emailVerificationRate: totalUsers > 0 ? Math.round((verified / totalUsers) * 100) : 0,
      weeklyTrends: buildWeeklyTrends(now, todos, users),
    },
    tasks: {
      summary: { active, createdInPeriod, completedInPeriod, cancelledInPeriod },
      velocityWeeks: computeVelocityWeeks(now, todos),
      byStatus,
      byPriority,
      byEffort,
    },
    adoption: computeAdoption(totalUsers),
  };
}
