import { getStore, scheduleSave, scheduleTodoShardPersist, flushNow } from "../persistence";
import { NotFoundError } from "../utils/errors";
import { createNotification } from "./notificationService";

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
  "googleCalendarTokens", "googleAccounts",
  "emailVerifyToken", "resetToken", "resetTokenExpiry",
];

function sanitizeUserForExport(user: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...user };
  for (const field of SENSITIVE_FIELDS) delete clean[field];
  return clean;
}

export async function deleteUserData(uid: string): Promise<void> {
  const store = getStore();

  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  if (!users[uid]) throw new NotFoundError("Utilisateur introuvable");
  const userEmail = (users[uid].email as string) ?? "";
  const userName = `${users[uid].firstName ?? ""} ${users[uid].lastName ?? ""}`.trim() || userEmail;

  // --- Build email→uid lookup for notifications ---
  const uidByEmail = new Map<string, string>();
  for (const [id, u] of Object.entries(users)) {
    if (id !== uid && u.email) uidByEmail.set((u.email as string).toLowerCase(), id);
  }

  // --- Collect deleted project IDs and notify team members ---
  const projectStore = (store.projects ?? {}) as Record<string, Record<string, unknown>>;
  const teamStore = (store.teams ?? {}) as Record<string, Record<string, unknown>>;
  const deletedProjectIds = new Set<string>();

  for (const [projId, proj] of Object.entries(projectStore)) {
    if (proj.ownerUid !== uid) continue;
    deletedProjectIds.add(projId);
    const projName = (proj.name as string) || projId;

    if (proj.teamId) {
      const team = teamStore[proj.teamId as string];
      if (team) {
        const members = (team.members as Array<{ email: string }>) ?? [];
        for (const m of members) {
          const memberUid = uidByEmail.get(m.email.toLowerCase());
          if (memberUid) {
            createNotification(
              memberUid,
              "project_deleted",
              `Project "${projName}" deleted`,
              `${userName} deleted their account. The project "${projName}" and all its data have been removed.`,
              { projectId: projId },
            );
          }
        }
      }
    }

    // Also collect sub-projects
    for (const [subId, sub] of Object.entries(projectStore)) {
      if (sub.parentProjectId === projId) deletedProjectIds.add(subId);
    }
  }

  // Delete owned projects + their sub-projects
  for (const projId of deletedProjectIds) {
    delete projectStore[projId];
  }
  scheduleSave("projects");

  // --- Clean up other users' todos linked to deleted projects ---
  const allTodos = (store.todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  for (const [todoOwnerUid, userTodos] of Object.entries(allTodos)) {
    if (todoOwnerUid === uid) continue;
    for (const todo of Object.values(userTodos)) {
      if (todo.projectId && deletedProjectIds.has(todo.projectId as string)) {
        todo.projectId = null;
        todo.phaseId = null;
      }
      if (todo.assignedTo === uid) {
        todo.assignedTo = null;
        todo.assignmentStatus = null;
      }
    }
  }

  // Remove deleted user's own todos
  const todoStore = (store.todos ?? {}) as Record<string, unknown>;
  delete todoStore[uid];
  scheduleTodoShardPersist("all");

  // Anonymize comments
  const commentStore = (store.comments ?? {}) as Record<string, Array<Record<string, unknown>>>;
  for (const list of Object.values(commentStore)) {
    for (const c of list) {
      if (c.userId === uid) {
        c.userId = "deleted";
        c.userEmail = "deleted user";
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
      entry.userEmail = "deleted user";
    }
  }
  scheduleSave("activityLog");

  // Remove sessions
  const sessionStore = (store.sessions ?? {}) as Record<string, Record<string, unknown>>;
  for (const [token, session] of Object.entries(sessionStore)) {
    if (session.uid === uid) delete sessionStore[token];
  }
  scheduleSave("sessions");

  // Remove webhooks
  const webhookStore = (store.webhooks ?? {}) as Record<string, unknown>;
  delete webhookStore[uid];
  scheduleSave("webhooks");

  // Remove from teams (memberships) and delete owned teams
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

  // Remove user record last (after all lookups are done)
  delete users[uid];
  scheduleSave("users");

  // Force immediate persistence so data is gone before the response
  await flushNow();
}
