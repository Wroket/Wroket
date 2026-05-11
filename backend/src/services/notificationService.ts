import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";
import { findUserByUid, getEntitlementsForUid, getNotificationDeliveryPrefs, getNotificationFilterPrefs } from "./authService";
import { enqueueDigest } from "./digestService";
import { sendNotificationEmail } from "./emailService";
import { dispatchOutboundWebhook, dispatchWebhooks, type WebhookEvent } from "./webhookService";

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
  | "project_deleted";

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

function persist(): void {
  const obj: Record<string, Notification[]> = {};
  notificationsByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = getStore();
  store.notifications = obj;
  scheduleSave("notifications");
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
  const payloadData: Record<string, string> | undefined =
    Object.keys(enriched).length > 0 ? enriched : undefined;

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
  const list = getUserNotifications(userId);
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

  return notif;
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
  if (
    (prefs.mode === "slack" || prefs.mode === "teams" || prefs.mode === "google_chat") &&
    prefs.webhookUrl
  ) {
    dispatchOutboundWebhook(prefs.webhookUrl, prefs.mode, type as WebhookEvent, title, message, data);
  }
}

export function listNotifications(userId: string): Notification[] {
  return getUserNotifications(userId);
}

export function unreadCount(userId: string): number {
  return getUserNotifications(userId).filter((n) => !n.read).length;
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
