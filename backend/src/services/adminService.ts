import { getStore } from "../persistence";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "francois@broudeur.com")
  .split(",")
  .map((e) => e.trim().toLowerCase());

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

interface UserSummary {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  googleSso: boolean;
  taskCount: number;
  createdAt: string;
}

interface AdminStats {
  users: { total: number; verified: number; last7d: number; last30d: number; googleSso: number };
  tasks: { total: number; active: number; completed: number; cancelled: number };
  projects: { total: number; active: number };
  teams: number;
  invitesSent: number;
}

export function getAdminStats(): AdminStats {
  const store = getStore();
  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const userStats = {
    total: users.length,
    verified: 0,
    last7d: 0,
    last30d: 0,
    googleSso: 0,
  };
  for (const u of users) {
    if (u.emailVerified) userStats.verified++;
    if (u.googleCalendarTokens) userStats.googleSso++;
    const created = new Date(u.createdAt as string).getTime();
    if (created >= d7) userStats.last7d++;
    if (created >= d30) userStats.last30d++;
    if (!u.passwordSaltB64 || (u.passwordHashB64 as string)?.length > 100) userStats.googleSso++;
  }
  // Deduplicate googleSso count — count users without a real password (random 64-char hex hash from SSO)
  userStats.googleSso = 0;
  for (const u of users) {
    const hash = u.passwordHashB64 as string | undefined;
    if (hash && hash.length > 80) userStats.googleSso++;
  }

  const todoStore = store.todos ?? {};
  let taskTotal = 0, taskActive = 0, taskCompleted = 0, taskCancelled = 0;
  for (const userTodos of Object.values(todoStore)) {
    const todos = userTodos as Record<string, Record<string, unknown>>;
    for (const todo of Object.values(todos)) {
      taskTotal++;
      const status = todo.status as string;
      if (status === "active") taskActive++;
      else if (status === "completed") taskCompleted++;
      else if (status === "cancelled") taskCancelled++;
    }
  }

  const projects = Object.values(store.projects ?? {}) as Array<Record<string, unknown>>;
  const projectStats = {
    total: projects.length,
    active: projects.filter((p) => p.status !== "archived").length,
  };

  const teams = Object.keys(store.teams ?? {}).length;

  let invitesSent = 0;
  const collabs = store.collaborators ?? {};
  for (const list of Object.values(collabs)) {
    invitesSent += (list as unknown[]).length;
  }

  return {
    users: userStats,
    tasks: { total: taskTotal, active: taskActive, completed: taskCompleted, cancelled: taskCancelled },
    projects: projectStats,
    teams,
    invitesSent,
  };
}

export interface InviteLogEntry {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  sentAt: string;
}

export function getInviteLog(): InviteLogEntry[] {
  const store = getStore();
  const log = (store.inviteLog ?? []) as InviteLogEntry[];
  return [...log].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

export function getAdminUsers(): UserSummary[] {
  const store = getStore();
  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const todoStore = store.todos ?? {};

  return users.map((u) => {
    const uid = u.uid as string;
    const userTodos = (todoStore as Record<string, Record<string, unknown>>)[uid] ?? {};
    const taskCount = Object.keys(userTodos).length;
    const hash = u.passwordHashB64 as string | undefined;

    return {
      uid,
      email: u.email as string,
      firstName: (u.firstName as string) ?? "",
      lastName: (u.lastName as string) ?? "",
      emailVerified: !!u.emailVerified,
      googleSso: !!(hash && hash.length > 80),
      taskCount,
      createdAt: (u.createdAt as string) ?? "",
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
