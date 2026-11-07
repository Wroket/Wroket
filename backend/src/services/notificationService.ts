import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";
import { findUserByUid, getEntitlementsForUid, getNotificationDeliveryPrefs, getNotificationFilterPrefs } from "./authService";
import { enqueueDigest } from "./digestService";
import { sendNotificationEmail } from "./emailService";
import { getProjectById } from "./projectService";
import {
  dispatchOutboundWebhook,
  dispatchWebhooks,
  listMatchingWebhooks,
  type WebhookEvent,
  type WebhookPlatform,
} from "./webhookService";
import { sendWebPushForNotification } from "./webPushService";
import { filterNotificationsForDisplay } from "./notificationDisplayPolicy";
import { getSlackConnectionForUser } from "./slackConnectionService";
import { getTeamsConnectionForUser } from "./teamsConnectionService";
import { getGoogleChatConnectionForUser } from "./googleChatConnectionService";

export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "task_cancelled"
  | "task_declined"
  | "task_accepted"
  | "team_invite"
  | "deadline_approaching"
  | "deadline_today"
  | "comment_mention"
  | "note_mention"
  | "project_deleted"
  | "dependency_blocked"
  | "milestone_due_soon"
  | "project_at_risk";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, string>;
  createdAt: string;
}

const notificationsByUser = new Map<string, Notification[]>();

/** Short in-app dedup window for identical (recipient, type, resource) creates. */
export const NOTIFICATION_DEDUP_WINDOW_MS = 60_000;

const TASK_TODO_LINKED_TYPES = new Set<NotificationType>([
  "task_assigned",
  "task_completed",
  "task_cancelled",
  "task_declined",
  "task_accepted",
  "deadline_approaching",
  "deadline_today",
  "dependency_blocked",
]);

function persist(): void {
  const obj: Record<string, Notification[]> = {};
  notificationsByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = getStore();
  store.notifications = obj;
  scheduleSave("notifications");
}

/**
 * Stable resource key for dedup: todo → note → team → project.
 * Returns null when no resource id is present (dedup skipped).
 */
export function notificationResourceKey(data?: Record<string, string>): string | null {
  if (!data) return null;
  const key = data.todoId || data.noteId || data.teamId || data.projectId;
  return key && key.trim() ? key.trim() : null;
}

function findRecentDuplicate(
  list: Notification[],
  type: NotificationType,
  resourceKey: string,
  nowMs: number,
): Notification | undefined {
  return list.find((n) => {
    if (n.type !== type) return false;
    if (notificationResourceKey(n.data) !== resourceKey) return false;
    const createdMs = new Date(n.createdAt).getTime();
    if (Number.isNaN(createdMs)) return false;
    return nowMs - createdMs <= NOTIFICATION_DEDUP_WINDOW_MS;
  });
}

(function hydrate() {
  const store = getStore();
  if (store.notifications) {
    for (const [uid, list] of Object.entries(store.notifications)) {
      notificationsByUser.set(uid, list as Notification[]);
    }
    console.log("[notifications] chargées pour %d utilisateur(s)", notificationsByUser.size);
  }
})();

function getUserNotifications(userId: string): Notification[] {
  let list = notificationsByUser.get(userId);
  if (!list) {
    list = [];
    notificationsByUser.set(userId, list);
  }
  return list;
}

export function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, string>
): Notification {
  const filterPrefs = getNotificationFilterPrefs(userId);
  if (filterPrefs?.disabledInApp.includes(type)) {
    return {
      id: "",
      userId,
      type,
      title,
      message,
      read: true,
      data,
      createdAt: new Date().toISOString(),
    };
  }

  const enriched: Record<string, string> = { ...(data ?? {}) };
  const recipient = findUserByUid(userId);
  if (recipient?.email && !enriched.recipientEmail) {
    enriched.recipientEmail = recipient.email;
  }
  // Enrich project / team for webhook filters when producers pass projectId.
  if (enriched.projectId && (!enriched.projectName || !enriched.teamId)) {
    const project = getProjectById(enriched.projectId);
    if (project) {
      if (!enriched.projectName) enriched.projectName = project.name;
      if (!enriched.teamId && project.teamId) enriched.teamId = project.teamId;
    }
  }
  const payloadData: Record<string, string> | undefined =
    Object.keys(enriched).length > 0 ? enriched : undefined;

  const list = getUserNotifications(userId);
  const resourceKey = notificationResourceKey(payloadData);
  if (resourceKey) {
    const dup = findRecentDuplicate(list, type, resourceKey, Date.now());
    if (dup) {
      return dup;
    }
  }

  const notif: Notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    title,
    message,
    read: false,
    data: payloadData,
    createdAt: new Date().toISOString(),
  };
  list.unshift(notif);
  if (list.length > 100) list.length = 100;
  persist();

  try {
    if (getEntitlementsForUid(userId).integrations) {
      dispatchWebhooks(userId, type as WebhookEvent, title, message, payloadData);
    }
  } catch (err) {
    console.warn("[notifications] webhook dispatch error:", err);
  }

  try {
    deliverProfileOutbound(userId, type, title, message, payloadData);
  } catch (err) {
    console.warn("[notifications] profile outbound error:", err);
  }

  try {
    void sendWebPushForNotification(userId, notif);
  } catch (err) {
    console.warn("[notifications] web push error:", err);
  }

  return notif;
}

/**
 * True when profile Slack/Teams/Google Chat delivery would hit the same destination
 * as an already-matching webhook (OAuth same channel, or identical Incoming Webhook URL).
 * Prevents duplicate side-channel posts from createNotification.
 */
export function shouldSkipProfileChatDelivery(
  userId: string,
  platform: Extract<WebhookPlatform, "slack" | "teams" | "google_chat">,
  event: WebhookEvent,
  data: Record<string, string> | undefined,
  profileWebhookUrl: string | null,
): boolean {
  const matching = listMatchingWebhooks(userId, event, data).filter((w) => w.platform === platform);
  if (matching.length === 0) return false;

  if (platform === "slack") {
    const conn = getSlackConnectionForUser(userId);
    if (conn?.accessToken && conn.channelId) return true;
  } else if (platform === "teams") {
    if (getTeamsConnectionForUser(userId)) return true;
  } else if (platform === "google_chat") {
    if (getGoogleChatConnectionForUser(userId)) return true;
  }

  const profileUrl = profileWebhookUrl?.trim().toLowerCase() ?? "";
  if (!profileUrl) return false;
  return matching.some((w) => w.url.trim().toLowerCase() === profileUrl);
}

/** Email / Slack / Teams / Google Chat channel from user settings (Paramètres → Intégrations). */
function deliverProfileOutbound(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, string>,
): void {
  const filterPrefs = getNotificationFilterPrefs(userId);
  if (filterPrefs?.disabledOutbound.includes(type)) return;

  const prefs = getNotificationDeliveryPrefs(userId);
  if (!prefs || prefs.mode === "none") return;

  if (filterPrefs && filterPrefs.frequency !== "immediate") {
    enqueueDigest(userId, type, title, message, data);
    return;
  }

  if (prefs.mode === "email") {
    void sendNotificationEmail(prefs.email, title, message, data);
    return;
  }
  if (prefs.mode === "slack" || prefs.mode === "teams" || prefs.mode === "google_chat") {
    if (
      shouldSkipProfileChatDelivery(
        userId,
        prefs.mode,
        type as WebhookEvent,
        data,
        prefs.webhookUrl,
      )
    ) {
      return;
    }
    dispatchOutboundWebhook(
      prefs.webhookUrl,
      prefs.mode,
      type as WebhookEvent,
      title,
      message,
      data,
      userId,
    );
  }
}

export function listNotifications(userId: string): Notification[] {
  return getUserNotifications(userId);
}

/** Notifications visible in UI (7-day window + upcoming deadline exceptions). */
export function listNotificationsForDisplay(userId: string): Notification[] {
  return filterNotificationsForDisplay(getUserNotifications(userId), userId);
}

export function unreadCount(userId: string): number {
  return listNotificationsForDisplay(userId).filter((n) => !n.read).length;
}

export function markAsRead(userId: string, notifId: string): Notification {
  const list = getUserNotifications(userId);
  const notif = list.find((n) => n.id === notifId);
  if (!notif) throw new NotFoundError("Notification introuvable");
  notif.read = true;
  persist();
  return notif;
}

export function markAllAsRead(userId: string): void {
  const list = getUserNotifications(userId);
  list.forEach((n) => { n.read = true; });
  persist();
}

/**
 * When an assignee accepts/declines from todos (not from the notification row),
 * mark matching `task_assigned` notifications read and stamp the final status
 * so Accepter/Refuser buttons disappear.
 */
export function resolveTaskAssignedNotifications(
  userId: string,
  todoId: string,
  status: "accepted" | "declined",
): number {
  const list = getUserNotifications(userId);
  let updated = 0;
  for (const n of list) {
    if (n.type !== "task_assigned") continue;
    if (n.data?.todoId !== todoId) continue;
    n.read = true;
    n.data = { ...(n.data ?? {}), assignmentStatus: status };
    updated++;
  }
  if (updated > 0) persist();
  return updated;
}

/** Removes a notification from the user's feed (dismiss / hide). */
export function deleteNotification(userId: string, notifId: string): void {
  const list = getUserNotifications(userId);
  const idx = list.findIndex((n) => n.id === notifId);
  if (idx === -1) throw new NotFoundError("Notification introuvable");
  list.splice(idx, 1);
  persist();
}

/**
 * Purge in-app notifications that reference a deleted todo across all users.
 * Covers assignee `task_assigned` leftovers after owner delete/archive.
 */
export function purgeNotificationsForTodo(todoId: string): number {
  if (!todoId) return 0;
  let removed = 0;
  for (const [, list] of notificationsByUser) {
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i]!;
      if (n.data?.todoId !== todoId) continue;
      if (!TASK_TODO_LINKED_TYPES.has(n.type) && n.type !== "comment_mention") continue;
      list.splice(i, 1);
      removed++;
    }
  }
  if (removed > 0) persist();
  return removed;
}

/** Test helper: clear in-memory notification store. */
export function _resetNotificationsForTests(): void {
  notificationsByUser.clear();
  const store = getStore();
  store.notifications = {};
}
