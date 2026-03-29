import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";

export type WebhookEvent =
  | "task_assigned"
  | "task_completed"
  | "task_declined"
  | "task_accepted"
  | "team_invite"
  | "deadline_approaching";

export type WebhookPlatform = "slack" | "discord" | "teams" | "custom";

export interface WebhookConfig {
  id: string;
  label: string;
  url: string;
  platform: WebhookPlatform;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
}

const VALID_EVENTS: WebhookEvent[] = [
  "task_assigned",
  "task_completed",
  "task_declined",
  "task_accepted",
  "team_invite",
  "deadline_approaching",
];

const webhooksByUser = new Map<string, WebhookConfig[]>();

function persist(): void {
  const obj: Record<string, WebhookConfig[]> = {};
  webhooksByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = getStore();
  (store as Record<string, unknown>).webhooks = obj;
  scheduleSave();
}

(function hydrate() {
  const store = getStore() as Record<string, unknown>;
  if (store.webhooks) {
    for (const [uid, list] of Object.entries(store.webhooks as Record<string, WebhookConfig[]>)) {
      webhooksByUser.set(uid, list);
    }
    console.log("[webhooks] configs chargées pour %d utilisateur(s)", webhooksByUser.size);
  }
})();

function getUserWebhooks(uid: string): WebhookConfig[] {
  let list = webhooksByUser.get(uid);
  if (!list) {
    list = [];
    webhooksByUser.set(uid, list);
  }
  return list;
}

export function listWebhooks(uid: string): WebhookConfig[] {
  return getUserWebhooks(uid);
}

export function upsertWebhook(uid: string, input: Omit<WebhookConfig, "id" | "createdAt"> & { id?: string }): WebhookConfig {
  const list = getUserWebhooks(uid);

  const events = (input.events ?? []).filter((e) => VALID_EVENTS.includes(e));
  if (events.length === 0) events.push("task_assigned");

  if (input.id) {
    const existing = list.find((w) => w.id === input.id);
    if (existing) {
      existing.label = input.label?.trim() || existing.label;
      existing.url = input.url?.trim() || existing.url;
      existing.platform = input.platform || existing.platform;
      existing.events = events;
      existing.enabled = input.enabled ?? existing.enabled;
      persist();
      return existing;
    }
  }

  const config: WebhookConfig = {
    id: crypto.randomUUID(),
    label: input.label?.trim() || "Webhook",
    url: input.url.trim(),
    platform: input.platform || "custom",
    events,
    enabled: input.enabled ?? true,
    createdAt: new Date().toISOString(),
  };
  list.push(config);
  persist();
  return config;
}

export function deleteWebhook(uid: string, webhookId: string): void {
  const list = getUserWebhooks(uid);
  const idx = list.findIndex((w) => w.id === webhookId);
  if (idx !== -1) {
    list.splice(idx, 1);
    persist();
  }
}

interface WebhookPayload {
  event: WebhookEvent;
  title: string;
  message: string;
  data?: Record<string, string>;
  timestamp: string;
}

/**
 * Format a payload for the target platform.
 * Slack uses Block Kit, Discord uses embeds, Teams uses Adaptive Cards.
 */
function formatPayload(platform: WebhookPlatform, payload: WebhookPayload): unknown {
  const color = {
    task_assigned: "#3B82F6",
    task_completed: "#10B981",
    task_declined: "#EF4444",
    task_accepted: "#10B981",
    team_invite: "#8B5CF6",
    deadline_approaching: "#F59E0B",
  }[payload.event] ?? "#6B7280";

  const emoji = {
    task_assigned: "📋",
    task_completed: "✅",
    task_declined: "❌",
    task_accepted: "🤝",
    team_invite: "👥",
    deadline_approaching: "⏰",
  }[payload.event] ?? "🔔";

  switch (platform) {
    case "slack":
      return {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${payload.title}*\n${payload.message}`,
            },
          },
        ],
        attachments: [{ color, fallback: payload.message }],
      };

    case "discord":
      return {
        embeds: [
          {
            title: `${emoji} ${payload.title}`,
            description: payload.message,
            color: parseInt(color.replace("#", ""), 16),
            timestamp: payload.timestamp,
            footer: { text: "Wroket" },
          },
        ],
      };

    case "teams":
      return {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body: [
                { type: "TextBlock", text: `${emoji} ${payload.title}`, weight: "Bolder", size: "Medium" },
                { type: "TextBlock", text: payload.message, wrap: true },
              ],
            },
          },
        ],
      };

    default:
      return payload;
  }
}

/**
 * Fire webhook(s) for a given user + event.
 * Non-blocking — errors are logged and swallowed.
 */
export function dispatchWebhooks(
  uid: string,
  event: WebhookEvent,
  title: string,
  message: string,
  data?: Record<string, string>
): void {
  const list = getUserWebhooks(uid);
  const matching = list.filter((w) => w.enabled && w.events.includes(event));
  if (matching.length === 0) return;

  const payload: WebhookPayload = {
    event,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const webhook of matching) {
    const body = formatPayload(webhook.platform, payload);
    fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((err) => {
      console.warn("[webhook] dispatch failed for %s (%s): %s", webhook.label, webhook.url, err);
    });
  }
}

/**
 * Send a test payload to a webhook URL. Returns true if 2xx.
 */
export async function testWebhook(url: string, platform: WebhookPlatform): Promise<boolean> {
  const payload: WebhookPayload = {
    event: "task_assigned",
    title: "Test Wroket",
    message: "Webhook configuré avec succès !",
    timestamp: new Date().toISOString(),
  };

  try {
    const body = formatPayload(platform, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
