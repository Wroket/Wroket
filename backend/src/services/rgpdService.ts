import { getStore, scheduleSave, scheduleTodoShardPersist, flushNow } from "../persistence";
import { NotFoundError } from "../utils/errors";
import { exportCommentsByAuthor } from "./commentService";
import { createNotification } from "./notificationService";
import { listAllTodos, purgeTodoRuntimeForUid, listTodoIdsForOwner } from "./todoService";
import { purgeAuthRuntimeForUid } from "./authService";
import { purgeNotesRuntimeForUid } from "./noteService";
import { deleteAllTodosV2ForOwner } from "./todoDocStore";
import { purgeAttachmentsForTodoIds } from "./attachmentService";
import { cancelStripeSubscriptionsById } from "./stripeBillingService";
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

export interface ExportUserDataOptions {
  /**
   * When true (self-service export), todos and comments come from the in-memory services (same normalized
   * models as the running app). When false or omitted (e.g. admin), exports use raw store rows with any
   * legacy `encV1` field stripped — there is no application-layer encryption in production anymore.
   */
  decryptedTaskContent?: boolean;
}

export function exportUserData(uid: string, opts?: ExportUserDataOptions): UserDataExport {
  const store = getStore();

  // User record
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
  const user = users[uid];
  if (!user) throw new NotFoundError("Utilisateur introuvable");

  // Todos — self-service: normalized in-memory todos; admin: raw shard rows with legacy encV1 removed
  let todos: unknown[];
  if (opts?.decryptedTaskContent) {
    todos = listAllTodos(uid) as unknown[];
  } else {
    const todoStore = (store.todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
    const userTodos = todoStore[uid] ?? {};
    todos = Object.values(userTodos).map((t) => {
      const row = { ...t } as Record<string, unknown>;
      delete row.encV1;
      return row;
    });
  }

  // Comments — same as todos (in-memory vs raw rows, encV1 stripped from raw)
  let comments: unknown[];
  if (opts?.decryptedTaskContent) {
    comments = exportCommentsByAuthor(uid) as unknown[];
  } else {
    const commentStore = (store.comments ?? {}) as Record<string, Array<Record<string, unknown>>>;
    comments = [];
    for (const list of Object.values(commentStore)) {
      for (const c of list) {
        if (c.userId === uid) {
          const row = { ...c } as Record<string, unknown>;
          delete row.encV1;
          comments.push(row);
        }
      }
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
  "googleCalendarTokens", "googleAccounts", "microsoftAccounts",
  "emailVerifyToken", "resetToken", "resetTokenExpiry",
  "totpSecretB64", "totpPendingSecretB64", "totpEnabled",
  "emailOtp2faEnabled", "email2faEnrollHash", "email2faDisableHash",
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
              { projectId: projId, projectName: projName, actorEmail: userEmail },
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
  const legacyTodoIds = Object.keys((todoStore[uid] as Record<string, unknown>) ?? {});
  const runtimeTodoIds = listTodoIdsForOwner(uid);
  const allTodoIds = [...new Set([...legacyTodoIds, ...runtimeTodoIds])];
  delete todoStore[uid];
  scheduleTodoShardPersist("all");

  const todosStorageMode = (process.env.TODOS_STORAGE_MODE ?? "legacy").trim().toLowerCase();
  if (todosStorageMode === "v2" || todosStorageMode === "dual") {
    await deleteAllTodosV2ForOwner(uid);
  }

  await purgeAttachmentsForTodoIds(allTodoIds);

  const noteIds = purgeNotesRuntimeForUid(uid);
  const noteStore = (store.notes ?? {}) as Record<string, unknown>;
  delete noteStore[uid];
  scheduleSave("notes");
  const archivedNoteStore = (store.archivedNotes ?? {}) as Record<string, unknown>;
  delete archivedNoteStore[uid];
  scheduleSave("archivedNotes");
  const noteAttachmentStore = (store.noteAttachments ?? {}) as Record<string, unknown[]>;
  for (const noteId of noteIds) {
    delete noteAttachmentStore[noteId];
  }
  scheduleSave("noteAttachments");

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

  const stripeSubIds: string[] = [];
  const userRecord = users[uid] as { stripeSubscriptionId?: string } | undefined;
  if (typeof userRecord?.stripeSubscriptionId === "string" && userRecord.stripeSubscriptionId.trim()) {
    stripeSubIds.push(userRecord.stripeSubscriptionId.trim());
  }
  for (const team of Object.values(teamStore)) {
    const t = team as { ownerUid?: string; stripeSubscriptionId?: string };
    if (t.ownerUid === uid && typeof t.stripeSubscriptionId === "string" && t.stripeSubscriptionId.trim()) {
      stripeSubIds.push(t.stripeSubscriptionId.trim());
    }
  }

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

  await cancelStripeSubscriptionsById(uid, stripeSubIds);

  // Remove user record last (after all lookups are done)
  delete users[uid];
  scheduleSave("users");

  purgeTodoRuntimeForUid(uid);
  purgeAuthRuntimeForUid(uid);

  // Force immediate persistence so data is gone before the response
  await flushNow();
}
