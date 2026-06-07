import webpush from "web-push";

import { getNotificationFilterPrefs } from "./authService";
import type { Notification, NotificationType } from "./notificationService";
import { taskDeepLink } from "./notificationFormatting";
import {
  getWebPushEnabled,
  listPushSubscriptions,
  removePushSubscriptions,
  type StoredPushSubscription,
} from "./pushSubscriptionService";

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  notifId: string;
  type: NotificationType;
}

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:team@wroket.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

/** Mirrors frontend `taskNotifOpenHref` for consistent deep-links. */
export function notifOpenUrl(type: NotificationType, data?: Record<string, string>): string {
  const base = (process.env.FRONTEND_URL || "https://wroket.com").replace(/\/$/, "");

  if (type === "note_mention") {
    if (data?.noteAccessible === "false") return `${base}/notes`;
    if (data?.noteId) return `${base}/notes?id=${encodeURIComponent(data.noteId)}`;
    return `${base}/notes`;
  }

  const taskId = data?.todoId;
  const taskDeepLinkTypes: NotificationType[] = [
    "task_assigned",
    "task_completed",
    "task_cancelled",
    "task_declined",
    "task_accepted",
    "comment_mention",
    "deadline_approaching",
    "deadline_today",
  ];
  if (taskId && taskDeepLinkTypes.includes(type)) {
    return taskDeepLink(taskId) ?? `${base}/todos`;
  }

  const taskListTypes: NotificationType[] = [
    "task_assigned",
    "task_completed",
    "task_cancelled",
    "task_declined",
    "task_accepted",
  ];
  if (taskListTypes.includes(type)) return `${base}/todos`;

  if (type === "team_invite") return `${base}/teams`;
  if (type === "project_deleted") return `${base}/projects`;

  return `${base}/notifications`;
}

export function buildWebPushPayload(notif: Notification): WebPushPayload {
  return {
    title: notif.title,
    body: notif.message,
    url: notifOpenUrl(notif.type, notif.data),
    notifId: notif.id,
    type: notif.type,
  };
}

export function shouldSendWebPush(uid: string, type: NotificationType): boolean {
  if (!getWebPushEnabled(uid)) return false;
  if (!configureVapid()) return false;
  if (listPushSubscriptions(uid).length === 0) return false;

  const filterPrefs = getNotificationFilterPrefs(uid);
  if (filterPrefs?.disabledOutbound.includes(type)) return false;
  return true;
}

async function sendToSubscription(
  sub: StoredPushSubscription,
  payload: WebPushPayload,
): Promise<{ endpoint: string; expired: boolean }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return { endpoint: sub.endpoint, expired: false };
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      return { endpoint: sub.endpoint, expired: true };
    }
    console.warn("[webPush] send error for %s: %s", sub.endpoint.slice(0, 48), err);
    return { endpoint: sub.endpoint, expired: false };
  }
}

export async function sendWebPushForNotification(uid: string, notif: Notification): Promise<void> {
  if (!notif.id) return;
  if (!shouldSendWebPush(uid, notif.type)) return;

  const payload = buildWebPushPayload(notif);
  const subs = listPushSubscriptions(uid);
  const results = await Promise.all(subs.map((s) => sendToSubscription(s, payload)));

  for (const r of results) {
    if (r.expired) removePushSubscriptions(uid, r.endpoint);
  }
}
