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
  | "project_deleted"
  | "dependency_blocked"
  | "milestone_due_soon"
  | "project_at_risk";

export type WebhookPlatform = "slack" | "discord" | "teams" | "google_chat" | "custom";

export type WebhookDeliveryStatus = "ok" | "error";

export interface WebhookConfig {
  id: string;
  label: string;
  url: string;
  platform: WebhookPlatform;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
  /** Empty / omitted = all projects. */
  projectIds?: string[];
  /** Empty / omitted = all teams. */
  teamIds?: string[];
  lastDeliveryAt?: string;
  lastStatus?: WebhookDeliveryStatus;
  lastStatusCode?: number;
  lastError?: string;
  consecutiveFailures?: number;
  /** ISO — skip dispatch until this time after repeated failures. */
  backoffUntil?: string;
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
  "dependency_blocked",
  "milestone_due_soon",
  "project_at_risk",
];

/** Failures before backoff starts. */
export const WEBHOOK_BACKOFF_AFTER_FAILURES = 3;
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

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

function normalizeIdList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  return ids.length > 0 ? ids : undefined;
}

export function listWebhooks(uid: string): WebhookConfig[] {
  return getUserWebhooks(uid);
}

export async function upsertWebhook(
  uid: string,
  input: Omit<WebhookConfig, "id" | "createdAt"> & { id?: string },
): Promise<WebhookConfig> {
  const list = getUserWebhooks(uid);

  await validateWebhookUrl(input.url);

  const events = (input.events ?? []).filter((e) => VALID_EVENTS.includes(e));
  if (events.length === 0) events.push("task_assigned");

  const projectIds = normalizeIdList(input.projectIds);
  const teamIds = normalizeIdList(input.teamIds);

  if (input.id) {
    const existing = list.find((w) => w.id === input.id);
    if (existing) {
      existing.label = input.label?.trim() || existing.label;
      existing.url = input.url?.trim() || existing.url;
      existing.platform = normalizePlatform(input.platform ?? existing.platform);
      existing.events = events;
      existing.enabled = input.enabled ?? existing.enabled;
      existing.projectIds = projectIds;
      existing.teamIds = teamIds;
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
    projectIds,
    teamIds,
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

export interface FormatWebhookOptions {
  /** Lot 3 interactive buttons — only for OAuth chat.postMessage, never Incoming Webhook. */
  interactive?: boolean;
  /** Wroket uid of the notification recipient (button target). */
  actorUid?: string;
}

/**
 * Build Slack actions block for Lot 3 (accept / decline / complete).
 * Value format: `todoId|targetUid`
 */
export function buildSlackTaskActionBlocks(
  event: WebhookEvent,
  data: Record<string, string> | undefined,
  actorUid: string | undefined,
): Record<string, unknown>[] {
  const todoId = data?.todoId?.trim();
  if (!todoId || !actorUid) return [];

  const value = `${todoId}|${actorUid}`;
  const elements: Record<string, unknown>[] = [];

  if (event === "task_assigned") {
    const asg = (data?.assignmentStatus ?? "pending").toLowerCase();
    if (asg === "pending" || !data?.assignmentStatus) {
      elements.push({
        type: "button",
        action_id: "wroket_accept",
        text: { type: "plain_text", text: "Accepter", emoji: true },
        style: "primary",
        value,
      });
      elements.push({
        type: "button",
        action_id: "wroket_decline",
        text: { type: "plain_text", text: "Refuser", emoji: true },
        style: "danger",
        value,
      });
    }
  }

  const completeEvents = new Set<WebhookEvent>([
    "deadline_approaching",
    "deadline_today",
    "task_accepted",
    "dependency_blocked",
  ]);
  if (completeEvents.has(event) || (event === "task_assigned" && data?.assignmentStatus === "accepted")) {
    elements.push({
      type: "button",
      action_id: "wroket_complete",
      text: { type: "plain_text", text: "Terminer", emoji: true },
      value,
    });
  }

  // Always offer complete on plain task_assigned after accept/decline? Prefer: also on pending assigned for power users — plan says complete when active+assigned. Add complete on task_assigned always as third button.
  if (event === "task_assigned" && !elements.some((e) => e.action_id === "wroket_complete")) {
    elements.push({
      type: "button",
      action_id: "wroket_complete",
      text: { type: "plain_text", text: "Terminer", emoji: true },
      value,
    });
  }

  if (elements.length === 0) return [];
  return [
    {
      type: "actions",
      block_id: "wroket_task_actions",
      elements: elements.slice(0, 5),
    },
  ];
}

function truncateDiscord(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Backoff duration after `failures` consecutive errors (0 when under threshold).
 */
export function computeBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures < WEBHOOK_BACKOFF_AFTER_FAILURES) return 0;
  const exp = consecutiveFailures - WEBHOOK_BACKOFF_AFTER_FAILURES;
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exp);
}

/** Whether dispatch should skip this webhook due to backoff window. */
export function isWebhookInBackoff(webhook: WebhookConfig, now = new Date()): boolean {
  if (!webhook.backoffUntil) return false;
  const until = new Date(webhook.backoffUntil).getTime();
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}

/**
 * Project/team filters: empty lists mean “all”.
 * Notifications without projectId / teamId pass when a filter is set (avoid silent drops on global events).
 */
export function matchesWebhookFilters(
  webhook: Pick<WebhookConfig, "projectIds" | "teamIds">,
  data?: Record<string, string>,
): boolean {
  const projectIds = webhook.projectIds?.filter(Boolean) ?? [];
  const teamIds = webhook.teamIds?.filter(Boolean) ?? [];
  if (projectIds.length > 0) {
    const pid = data?.projectId?.trim();
    if (pid && !projectIds.includes(pid)) return false;
  }
  if (teamIds.length > 0) {
    const tid = data?.teamId?.trim();
    if (tid && !teamIds.includes(tid)) return false;
  }
  return true;
}

function findWebhook(uid: string, webhookId: string): WebhookConfig | undefined {
  return getUserWebhooks(uid).find((w) => w.id === webhookId);
}

/**
 * Persist delivery health after a POST attempt.
 */
export function recordWebhookDelivery(
  uid: string,
  webhookId: string,
  result: { ok: boolean; statusCode?: number; error?: string },
): void {
  const webhook = findWebhook(uid, webhookId);
  if (!webhook) return;

  const now = new Date().toISOString();
  webhook.lastDeliveryAt = now;
  if (result.ok) {
    webhook.lastStatus = "ok";
    webhook.lastStatusCode = result.statusCode ?? 200;
    webhook.lastError = undefined;
    webhook.consecutiveFailures = 0;
    webhook.backoffUntil = undefined;
  } else {
    const failures = (webhook.consecutiveFailures ?? 0) + 1;
    webhook.consecutiveFailures = failures;
    webhook.lastStatus = "error";
    webhook.lastStatusCode = result.statusCode;
    webhook.lastError = (result.error ?? "delivery failed").slice(0, 200);
    const backoffMs = computeBackoffMs(failures);
    webhook.backoffUntil = backoffMs > 0 ? new Date(Date.now() + backoffMs).toISOString() : undefined;
  }
  persist();
}

/**
 * Format a payload for the target platform.
 * Slack uses Block Kit, Discord uses embeds, Teams uses Adaptive Cards, Google Chat uses `text`.
 */
export function formatWebhookPayload(
  platform: WebhookPlatform,
  payload: WebhookPayload,
  options?: FormatWebhookOptions,
): unknown {
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
    dependency_blocked: "#F97316",
    milestone_due_soon: "#F59E0B",
    project_at_risk: "#EF4444",
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
    dependency_blocked: "🧱",
    milestone_due_soon: "🏁",
    project_at_risk: "⚠️",
  }[payload.event] ?? "🔔";

  const ctx = normalizeNotificationData(payload.data);
  const rich = shouldUseRichLayout(payload.data);
  const deepLink = taskDeepLink(ctx.todoId);

  switch (platform) {
    case "slack": {
      const actionBlocks =
        options?.interactive === true
          ? buildSlackTaskActionBlocks(payload.event, payload.data, options.actorUid)
          : [];
      if (!rich) {
        return {
          text: `${emoji} ${payload.title}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${emoji} *${escapeSlackMrkdwn(payload.title)}*\n${escapeSlackMrkdwn(payload.message)}`,
              },
            },
            ...actionBlocks,
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
      blocks.push(...actionBlocks);
      return {
        text: `${emoji} ${payload.title}`,
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

async function postWebhookBody(
  uid: string,
  webhook: WebhookConfig,
  payload: WebhookPayload,
): Promise<void> {
  try {
    // Soft prefer Slack Web API when OAuth is connected for Slack configs (with Lot 3 buttons).
    if (webhook.platform === "slack") {
      try {
        const { tryPostViaSlackOAuth } = await import("./slackApiService");
        const oauthBody = formatWebhookPayload(webhook.platform, payload, {
          interactive: true,
          actorUid: uid,
        });
        const viaOAuth = await tryPostViaSlackOAuth(uid, oauthBody);
        if (viaOAuth) {
          recordWebhookDelivery(uid, webhook.id, { ok: true, statusCode: 200 });
          return;
        }
      } catch (err) {
        console.warn("[webhook] slack oauth post failed, falling back to URL: %s", (err as Error).message ?? err);
      }
    }

    const body = formatWebhookPayload(webhook.platform, payload);
    const validUrl = await validateWebhookUrl(webhook.url);
    const res = await fetch(validUrl.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (res.ok) {
      recordWebhookDelivery(uid, webhook.id, { ok: true, statusCode: res.status });
      return;
    }
    recordWebhookDelivery(uid, webhook.id, {
      ok: false,
      statusCode: res.status,
      error: `HTTP ${res.status}`,
    });
  } catch (err) {
    recordWebhookDelivery(uid, webhook.id, {
      ok: false,
      error: (err as Error).message ?? String(err),
    });
    console.warn("[webhook] dispatch failed for %s: %s", webhook.label, (err as Error).message ?? err);
  }
}

/**
 * Fire webhook(s) for a given user + event.
 * Non-blocking — errors are logged and recorded on the config.
 */
export function dispatchWebhooks(
  uid: string,
  event: WebhookEvent,
  title: string,
  message: string,
  data?: Record<string, string>,
): void {
  const list = getUserWebhooks(uid);
  const matching = list.filter(
    (w) =>
      w.enabled &&
      w.events.includes(event) &&
      !isWebhookInBackoff(w) &&
      matchesWebhookFilters(w, data),
  );
  if (matching.length === 0) return;

  const payload: WebhookPayload = {
    event,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const webhook of matching) {
    void postWebhookBody(uid, webhook, payload);
  }
}

/**
 * Send a test payload to a webhook URL. Returns true if 2xx.
 * When `uid` + `webhookId` are provided, also updates delivery health.
 */
export async function testWebhook(
  url: string,
  platform: WebhookPlatform | string,
  opts?: { uid?: string; webhookId?: string },
): Promise<boolean> {
  const p = normalizePlatform(platform);
  const payload: WebhookPayload = {
    event: "task_assigned",
    title: "Test Wroket",
    message: "Webhook configuré avec succès !",
    timestamp: new Date().toISOString(),
  };

  try {
    await validateWebhookUrl(url);
    const body = formatWebhookPayload(p, payload);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (opts?.uid && opts.webhookId) {
      recordWebhookDelivery(opts.uid, opts.webhookId, {
        ok: res.ok,
        statusCode: res.status,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    }
    return res.ok;
  } catch (err) {
    if (opts?.uid && opts.webhookId) {
      recordWebhookDelivery(opts.uid, opts.webhookId, {
        ok: false,
        error: (err as Error).message ?? String(err),
      });
    }
    return false;
  }
}

/**
 * Sends one notification to a user-configured Slack, Teams, or Google Chat URL (settings → delivery channel).
 * Fire-and-forget; errors are logged only. Prefers Slack OAuth when connected.
 */
export function dispatchOutboundWebhook(
  url: string,
  platform: "slack" | "teams" | "google_chat",
  event: WebhookEvent,
  title: string,
  message: string,
  data?: Record<string, string>,
  uid?: string,
): void {
  const payload: WebhookPayload = {
    event,
    title,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  const body = formatWebhookPayload(platform, payload);

  void (async () => {
    if (platform === "slack" && uid) {
      try {
        const { tryPostViaSlackOAuth } = await import("./slackApiService");
        const oauthBody = formatWebhookPayload(platform, payload, {
          interactive: true,
          actorUid: uid,
        });
        if (await tryPostViaSlackOAuth(uid, oauthBody)) return;
      } catch (err) {
        console.warn("[webhook] outbound slack oauth failed: %s", (err as Error).message ?? err);
      }
    }
    try {
      const validUrl = await validateWebhookUrl(url);
      await fetch(validUrl.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
    } catch (err) {
      console.warn("[webhook] outbound delivery failed: %s", (err as Error).message ?? err);
    }
  })();
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

/** Test helper — clears in-memory webhook configs. */
export function _resetWebhooksForTests(): void {
  webhooksByUser.clear();
  getStore().webhooks = {};
}
