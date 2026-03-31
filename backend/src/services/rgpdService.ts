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

const SENSITIVE_FIELDS = [
  "passwordHashB64", "passwordSaltB64",
  "googleCalendarTokens", "emailVerifyToken",
  "resetToken", "resetTokenExpiry",
];

function sanitizeUserForExport(user: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...user };
  for (const field of SENSITIVE_FIELDS) delete clean[field];
  return clean;
}

export function deleteUserData(uid: string): void {
  const store = getStore();

  // Remove user (save email before deletion for cleanup)
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  if (!users[uid]) throw new NotFoundError("Utilisateur introuvable");
  const userEmail = (users[uid].email as string) ?? "";
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

  // Remove owned projects
  const projectStore = (store.projects ?? {}) as Record<string, Record<string, unknown>>;
  for (const [id, proj] of Object.entries(projectStore)) {
    if (proj.ownerUid === uid) delete projectStore[id];
  }
  scheduleSave("projects");

  // Remove from teams (memberships) and delete owned teams
  const teamStore = (store.teams ?? {}) as Record<string, Record<string, unknown>>;
  for (const [id, team] of Object.entries(teamStore)) {
    if (team.ownerUid === uid) {
      delete teamStore[id];
    } else {
      const members = (team.members as Array<{ email: string }>) ?? [];
      team.members = members.filter((m) => m.email !== userEmail);
    }
  }
  scheduleSave("teams");

  // Remove collaborator entries
  const collabStore = (store.collaborators ?? {}) as Record<string, unknown[]>;
  delete collabStore[uid];
  for (const [ownerUid, list] of Object.entries(collabStore)) {
    collabStore[ownerUid] = list.filter((c: unknown) => {
      const entry = c as Record<string, unknown>;
      return entry.email !== userEmail;
    });
  }
  scheduleSave("collaborators");

  // Clean up assigned tasks from other users
  const allTodos = (store.todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  for (const userTodos of Object.values(allTodos)) {
    for (const todo of Object.values(userTodos)) {
      if (todo.assignedTo === uid) {
        todo.assignedTo = null;
        todo.assignmentStatus = null;
      }
    }
  }
  scheduleSave("todos");
}
