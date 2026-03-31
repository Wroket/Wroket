import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface UserDataExport {
  user: Record<string, unknown>;
  todos: unknown[];
  comments: unknown[];
  notifications: unknown[];
  notes: unknown[];
  teams: unknown[];
  projects: unknown[];
  activityLog: unknown[];
}

export function exportUserData(uid: string): UserDataExport {
  const store = getStore();

  // User record
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  const user = users[uid];
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  // Todos
  const todoStore = (store.todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const userTodos = todoStore[uid] ?? {};
  const todos = Object.values(userTodos);

  // Comments
  const commentStore = (store.comments ?? {}) as Record<string, Array<Record<string, unknown>>>;
  const comments: unknown[] = [];
  for (const list of Object.values(commentStore)) {
    for (const c of list) {
      if (c.userId === uid) comments.push(c);
    }
  }

  // Notifications
  const notifStore = (store.notifications ?? {}) as Record<string, unknown[]>;
  const notifications = notifStore[uid] ?? [];

  // Notes
  const noteStore = (store.notes ?? {}) as Record<string, Record<string, unknown>>;
  const userNotes = noteStore[uid] ?? {};
  const notes = Object.values(userNotes);

  // Teams
  const teamStore = (store.teams ?? {}) as Record<string, Record<string, unknown>>;
  const teams: unknown[] = [];
  for (const team of Object.values(teamStore)) {
    const members = (team.members as Array<{ email: string }>) ?? [];
    const userRecord = user as { email?: string };
    if (team.ownerUid === uid || members.some((m) => m.email === userRecord.email)) {
      teams.push(team);
    }
  }

  // Projects
  const projectStore = (store.projects ?? {}) as Record<string, Record<string, unknown>>;
  const projects = Object.values(projectStore).filter((p) => p.ownerUid === uid);

  // Activity log
  const activityStore = (store.activityLog ?? []) as Array<Record<string, unknown>>;
  const activityLog = activityStore.filter((e) => e.userId === uid);

  return { user: sanitizeUserForExport(user), todos, comments, notifications, notes, teams, projects, activityLog };
}

function sanitizeUserForExport(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHashB64, ...rest } = user;
  void passwordHashB64;
  return rest;
}

export function deleteUserData(uid: string): void {
  const store = getStore();

  // Remove user
  const users = (store.users ?? {}) as Record<string, unknown>;
  if (!users[uid]) throw new NotFoundError("Utilisateur introuvable");
  delete users[uid];
  scheduleSave("users");

  // Remove todos
  const todoStore = (store.todos ?? {}) as Record<string, unknown>;
  delete todoStore[uid];
  scheduleSave("todos");

  // Anonymize comments
  const commentStore = (store.comments ?? {}) as Record<string, Array<Record<string, unknown>>>;
  for (const list of Object.values(commentStore)) {
    for (const c of list) {
      if (c.userId === uid) {
        c.userId = "deleted";
        c.userEmail = "utilisateur supprimé";
      }
    }
  }
  scheduleSave("comments");

  // Remove notifications
  const notifStore = (store.notifications ?? {}) as Record<string, unknown>;
  delete notifStore[uid];
  scheduleSave("notifications");

  // Remove notes
  const noteStore = (store.notes ?? {}) as Record<string, unknown>;
  delete noteStore[uid];
  scheduleSave("notes");

  // Anonymize activity log
  const activityStore = (store.activityLog ?? []) as Array<Record<string, unknown>>;
  for (const entry of activityStore) {
    if (entry.userId === uid) {
      entry.userId = "deleted";
      entry.userEmail = "utilisateur supprimé";
    }
  }
  scheduleSave("activityLog");

  // Remove sessions
  const sessionStore = (store.sessions ?? {}) as Record<string, Record<string, unknown>>;
  for (const [token, session] of Object.entries(sessionStore)) {
    if (session.uid === uid) delete sessionStore[token];
  }
  scheduleSave("sessions");

  // Remove from webhooks
  const webhookStore = (store.webhooks ?? {}) as Record<string, unknown>;
  delete webhookStore[uid];
  scheduleSave("webhooks");
}
