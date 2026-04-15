import crypto from "crypto";
import dns from "dns/promises";
import { URL } from "url";

import { getStore, scheduleSave } from "../persistence";
import { ValidationError } from "../utils/errors";
import {
  escapeSlackMrkdwn,
  normalizeNotificationData,
  shouldUseRichLayout,
  taskDeepLink,
} from "./notificationFormatting";

export type WebhookEvent =
  | "task_assigned"
  | "task_completed"
  | "task_cancelled"
  | "task_declined"
  | "task_accepted"
  | "team_invite"
  | "deadline_approaching"
  | "deadline_today"
  | "comment_mention"
  | "project_deleted";

export type WebhookPlatform = "slack" | "discord" | "teams" | "google_chat" | "custom";

export interface WebhookConfig {
  id: string;
  label: string;
  url: string;
  platform: WebhookPlatform;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
}

const VALID_PLATFORMS = new Set<WebhookPlatform>(["slack", "discord", "teams", "google_chat", "custom"]);

function normalizePlatform(p: unknown): WebhookPlatform {
  if (typeof p === "string" && VALID_PLATFORMS.has(p as WebhookPlatform)) return p as WebhookPlatform;
  return "custom";
}

const VALID_EVENTS: WebhookEvent[] = [
  "task_assigned",
  "task_completed",
  "task_cancelled",
  "task_declined",
  "task_accepted",
  "team_invite",
  "deadline_approaching",
  "deadline_today",
  "comment_mention",
  "project_deleted",
];

const webhooksByUser = new Map<string, WebhookConfig[]>();

function persist(): void {
  const obj: Record<string, WebhookConfig[]> = {};
  webhooksByUser.forEach((list, uid) => { obj[uid] = list; });
  const store = getStore();
  store.webhooks = obj;
  scheduleSave("webhooks");
}

(function hydrate() {
  const store = getStore();
  if (store.webhooks) {
    for (const [uid, list] of Object.entries(store.webhooks as unknown as Record<string, WebhookConfig[]>)) {
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

export async function upsertWebhook(uid: string, input: Omit<WebhookConfig, "id" | "createdAt"> & { id?: string }): Promise<WebhookConfig> {
  const list = getUserWebhooks(uid);

  await validateWebhookUrl(input.url);

  const events = (input.events ?? []).filter((e) => VALID_EVENTS.includes(e));
  if (events.length === 0) events.push("task_assigned");

  if (input.id) {
    const existing = list.find((w) => w.id === input.id);
    if (existing) {
      existing.label = input.label?.trim() || existing.label;
      existing.url = input.url?.trim() || existing.url;
      existing.platform = normalizePlatform(input.platform ?? existing.platform);
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
    platform: normalizePlatform(input.platform),
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

function truncateDiscord(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Format a payload for the target platform.
 * Slack uses Block Kit, Discord uses embeds, Teams uses Adaptive Cards, Google Chat uses `text`.
 */
function formatPayload(platform: WebhookPlatform, payload: WebhookPayload): unknown {
  const color = {
    task_assigned: "#3B82F6",
    task_completed: "#10B981",
    task_cancelled: "#78716C",
    task_declined: "#EF4444",
    task_accepted: "#10B981",
    team_invite: "#8B5CF6",
    deadline_approaching: "#F59E0B",
    deadline_today: "#EF4444",
    comment_mention: "#6366F1",
    project_deleted: "#78716C",
  }[payload.event] ?? "#6B7280";

  const emoji = {
    task_assigned: "📋",
    task_completed: "✅",
    task_cancelled: "🚫",
    task_declined: "❌",
    task_accepted: "🤝",
    team_invite: "👥",
    deadline_approaching: "⏰",
    deadline_today: "📌",
    comment_mention: "💬",
    project_deleted: "🗑️",
  }[payload.event] ?? "🔔";

  const ctx = normalizeNotificationData(payload.data);
  const rich = shouldUseRichLayout(payload.data);
  const deepLink = taskDeepLink(ctx.todoId);

  switch (platform) {
    case "slack": {
      if (!rich) {
        return {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${emoji} *${escapeSlackMrkdwn(payload.title)}*\n${escapeSlackMrkdwn(payload.message)}`,
              },
            },
          ],
          attachments: [{ color, fallback: payload.message }],
        };
      }
      const blocks: Record<string, unknown>[] = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *${escapeSlackMrkdwn(payload.title)}*`,
          },
        },
      ];
      const fields: { type: string; text: string }[] = [];
      if (ctx.todoTitle) {
        fields.push({ type: "mrkdwn", text: `*Tâche*\n${escapeSlackMrkdwn(ctx.todoTitle)}` });
      }
      if (ctx.actorEmail) {
        fields.push({ type: "mrkdwn", text: `*Par*\n${escapeSlackMrkdwn(ctx.actorEmail)}` });
      }
      if (ctx.recipientEmail) {
        fields.push({ type: "mrkdwn", text: `*Pour*\n${escapeSlackMrkdwn(ctx.recipientEmail)}` });
      }
      if (ctx.projectName) {
        fields.push({ type: "mrkdwn", text: `*Projet*\n${escapeSlackMrkdwn(ctx.projectName)}` });
      }
      if (ctx.teamName) {
        fields.push({ type: "mrkdwn", text: `*Équipe*\n${escapeSlackMrkdwn(ctx.teamName)}` });
      }
      if (fields.length > 0) {
        blocks.push({ type: "section", fields });
      }
      if (ctx.commentPreview) {
        const quoted = escapeSlackMrkdwn(ctx.commentPreview)
          .split("\n")
          .map((line) => `>${line || " "}`)
          .join("\n");
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Commentaire*\n${quoted}`,
          },
        });
      }
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: escapeSlackMrkdwn(payload.message),
        },
      });
      if (deepLink) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${deepLink}|Ouvrir dans Wroket>`,
          },
        });
      }
      return {
        blocks,
        attachments: [{ color, fallback: payload.message }],
      };
    }

    case "discord": {
      if (!rich) {
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
      }
      const discordFields: { name: string; value: string; inline: boolean }[] = [];
      if (ctx.todoTitle) discordFields.push({ name: "Tâche", value: truncateDiscord(ctx.todoTitle, 1024), inline: true });
      if (ctx.actorEmail) discordFields.push({ name: "Par", value: truncateDiscord(ctx.actorEmail, 1024), inline: true });
      if (ctx.recipientEmail) discordFields.push({ name: "Pour", value: truncateDiscord(ctx.recipientEmail, 1024), inline: true });
      if (ctx.projectName) discordFields.push({ name: "Projet", value: truncateDiscord(ctx.projectName, 1024), inline: true });
      if (ctx.teamName) discordFields.push({ name: "Équipe", value: truncateDiscord(ctx.teamName, 1024), inline: true });
      if (ctx.commentPreview) {
        discordFields.push({
          name: "Commentaire",
          value: truncateDiscord(ctx.commentPreview, 1024),
          inline: false,
        });
      }
      return {
        embeds: [
          {
            title: `${emoji} ${payload.title}`,
            description: payload.message,
            color: parseInt(color.replace("#", ""), 16),
            timestamp: payload.timestamp,
            footer: { text: "Wroket" },
            fields: discordFields.length > 0 ? discordFields : undefined,
            url: deepLink,
          },
        ],
      };
    }

    case "teams": {
      const body: Record<string, unknown>[] = [
        { type: "TextBlock", text: `${emoji} ${payload.title}`, weight: "Bolder", size: "Medium" },
      ];
      if (rich) {
        const facts: { title: string; value: string }[] = [];
        if (ctx.todoTitle) facts.push({ title: "Tâche", value: ctx.todoTitle });
        if (ctx.actorEmail) facts.push({ title: "Par", value: ctx.actorEmail });
        if (ctx.recipientEmail) facts.push({ title: "Pour", value: ctx.recipientEmail });
        if (ctx.projectName) facts.push({ title: "Projet", value: ctx.projectName });
        if (ctx.teamName) facts.push({ title: "Équipe", value: ctx.teamName });
        if (ctx.commentPreview) facts.push({ title: "Commentaire", value: ctx.commentPreview });
        if (facts.length > 0) {
          body.push({ type: "FactSet", facts });
        }
      }
      body.push({ type: "TextBlock", text: payload.message, wrap: true });
      if (deepLink) {
        body.push({
          type: "ActionSet",
          actions: [
            {
              type: "Action.OpenUrl",
              title: "Ouvrir dans Wroket",
              url: deepLink,
            },
          ],
        });
      }
      return {
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
              type: "AdaptiveCard",
              version: "1.4",
              body,
            },
          },
        ],
      };
    }

    case "google_chat": {
      if (!rich) {
        return {
          text: `${emoji} *${payload.title}*\n\n${payload.message}`,
        };
      }
      const lines: string[] = [`${emoji} *${payload.title}*`];
      if (ctx.todoTitle) lines.push("", `*Tâche:* ${ctx.todoTitle}`);
      if (ctx.actorEmail) lines.push(`*Par:* ${ctx.actorEmail}`);
      if (ctx.recipientEmail) lines.push(`*Pour:* ${ctx.recipientEmail}`);
      if (ctx.projectName) lines.push(`*Projet:* ${ctx.projectName}`);
      if (ctx.teamName) lines.push(`*Équipe:* ${ctx.teamName}`);
      if (ctx.commentPreview) lines.push("", `*Commentaire:* ${ctx.commentPreview}`);
      lines.push("", payload.message);
      if (deepLink) lines.push("", `Ouvrir dans Wroket : ${deepLink}`);
      return {
        text: lines.join("\n"),
      };
    }

    default:
      return payload;
  }
}

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "metadata.google.internal"]);

function isPrivateIP(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(normalized)) return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  const parts = normalized.split(".");
  if (parts.length === 4) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 0) return true;
  }

  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  return false;
}

/**
 * Reject URLs targeting private/internal networks (SSRF protection).
 * Resolves DNS to block rebinding attacks (e.g. nip.io, localtest.me).
 */
export async function validateWebhookUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ValidationError("URL invalide");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ValidationError("Seuls les protocoles http/https sont autorisés");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(hostname) || isPrivateIP(hostname)) {
    throw new ValidationError("URL vers un hôte interne non autorisée");
  }

  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    for (const addr of [...addresses, ...addresses6]) {
      if (isPrivateIP(addr)) {
        throw new ValidationError("URL vers un réseau privé non autorisée (résolution DNS)");
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
  }

  return parsed;
}

const WEBHOOK_TIMEOUT_MS = 5_000;

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
    validateWebhookUrl(webhook.url).then((validUrl) => {
      const body = formatPayload(webhook.platform, payload);
      return fetch(validUrl.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    }).catch((err) => {
      console.warn("[webhook] dispatch failed for %s: %s", webhook.label, (err as Error).message ?? err);
    });
  }
}

/**
 * Send a test payload to a webhook URL. Returns true if 2xx.
 */
export async function testWebhook(url: string, platform: WebhookPlatform | string): Promise<boolean> {
  const p = normalizePlatform(platform);
  const payload: WebhookPayload = {
    event: "task_assigned",
    title: "Test Wroket",
    message: "Webhook configuré avec succès !",
    timestamp: new Date().toISOString(),
  };

  try {
    await validateWebhookUrl(url);
    const body = formatPayload(p, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends one notification to a user-configured Slack, Teams, or Google Chat URL (settings → delivery channel).
 * Fire-and-forget; errors are logged only.
 */
export function dispatchOutboundWebhook(
  url: string,
  platform: "slack" | "teams" | "google_chat",
  event: WebhookEvent,
  title: string,
  message: string,
  data?: Record<string, string>,
): void {
  const payload: WebhookPayload = {
    event,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  validateWebhookUrl(url)
    .then((validUrl) => {
      const body = formatPayload(platform, payload);
      return fetch(validUrl.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    })
    .catch((err) => {
      console.warn("[webhook] outbound delivery failed: %s", (err as Error).message ?? err);
    });
}

export function getWebhooksOverview(): { total: number; active: number; byPlatform: Record<string, number> } {
  let total = 0;
  let active = 0;
  const byPlatform: Record<string, number> = {};
  for (const list of webhooksByUser.values()) {
    for (const w of list) {
      total++;
      if (w.enabled) active++;
      byPlatform[w.platform] = (byPlatform[w.platform] ?? 0) + 1;
    }
  }
  return { total, active, byPlatform };
}
