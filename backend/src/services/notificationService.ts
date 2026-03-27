import crypto from "crypto";

import { loadStore, saveStore } from "../persistence";

export type NotificationType = "task_assigned" | "task_completed" | "task_declined" | "task_accepted" | "team_invite";

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
  const store = loadStore();
  store.notifications = obj;
  saveStore(store);
}

(function hydrate() {
  const store = loadStore();
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
  const notif: Notification = {
    id: crypto.randomUUID(),
    userId,
    type,
    title,
    message,
    read: false,
    data,
    createdAt: new Date().toISOString(),
  };
  const list = getUserNotifications(userId);
  list.unshift(notif);
  if (list.length > 100) list.length = 100;
  persist();
  return notif;
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
  if (!notif) throw new Error("Notification introuvable");
  notif.read = true;
  persist();
  return notif;
}

export function markAllAsRead(userId: string): void {
  const list = getUserNotifications(userId);
  list.forEach((n) => { n.read = true; });
  persist();
}
