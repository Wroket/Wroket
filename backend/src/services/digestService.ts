/**
 * Digest queue — collects outbound notifications for users who chose
 * hourly or daily delivery, then flushes them as grouped summaries.
 */
import { getStore, scheduleSave, type StoreData } from "../persistence";
import { getNotificationDeliveryPrefs, getNotificationFilterPrefs } from "./authService";
import { sendNotificationEmail } from "./emailService";
import { dispatchOutboundWebhook, type WebhookEvent } from "./webhookService";
import { escapeHtml } from "../utils/escapeHtml";
import { escapeSlackMrkdwn, taskDeepLink } from "./notificationFormatting";

export interface DigestEntry {
  type: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  createdAt: string;
}

const queueByUser = new Map<string, DigestEntry[]>();

function persist(): void {
  const obj: Record<string, DigestEntry[]> = {};
  queueByUser.forEach((list, uid) => { obj[uid] = list; });
  const store: StoreData = getStore();
  store.notifDigestQueue = obj as Record<string, unknown[]>;
  scheduleSave("notifDigestQueue");
}

(function hydrate() {
  const store: StoreData = getStore();
  const raw = store.notifDigestQueue;
  if (raw && typeof raw === "object") {
    for (const [uid, list] of Object.entries(raw)) {
      if (Array.isArray(list)) queueByUser.set(uid, list as DigestEntry[]);
    }
    console.log("[digest] queue chargée pour %d utilisateur(s)", queueByUser.size);
  }
})();

function getUserQueue(uid: string): DigestEntry[] {
  let q = queueByUser.get(uid);
  if (!q) { q = []; queueByUser.set(uid, q); }
  return q;
}

/** Add a notification to a user's outbound digest queue. */
export function enqueueDigest(
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, string>,
): void {
  const q = getUserQueue(userId);
  q.push({ type, title, message, data, createdAt: new Date().toISOString() });
  if (q.length > 200) q.splice(0, q.length - 200);
  persist();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMOJI: Record<string, string> = {
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
};

function emoji(type: string): string { return EMOJI[type] ?? "🔔"; }

/** Local hour in a given IANA timezone from a UTC Date. */
function localHour(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(date);
    const h = parts.find((p) => p.type === "hour");
    return h ? parseInt(h.value, 10) % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

// ── Email digest ─────────────────────────────────────────────────────────────

function buildDigestEmailHtml(entries: DigestEntry[]): string {
  const frontendUrl = process.env.FRONTEND_URL || "https://wroket.com";
  const logoUrl = `${frontendUrl}/wroket-logo.png`;
  const rows = entries
    .map((e) => {
      const link = e.data?.todoId
        ? `<a href="${frontendUrl}/todos?task=${encodeURIComponent(e.data.todoId)}" style="font-size:11px;color:#64748b;text-decoration:none">Ouvrir →</a>`
        : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:28px;font-size:16px">${escapeHtml(emoji(e.type))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top">
          <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#334155">${escapeHtml(e.title)}</p>
          <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(e.message)}</p>
          ${link ? `<p style="margin:4px 0 0">${link}</p>` : ""}
        </td>
      </tr>`;
    })
    .join("");
  return `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
    <div style="text-align:center;padding:24px 0 16px">
      <img src="${logoUrl}" alt="Wroket" width="48" height="48" style="display:inline-block" />
    </div>
    <h2 style="color:#334155;text-align:center;font-size:16px;margin:0 0 16px">Résumé Wroket — ${entries.length} notification${entries.length > 1 ? "s" : ""}</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">${rows}</table>
    <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0">
      <p style="font-size:11px;color:#94a3b8;margin:0">Wroket — Gestion de tâches collaborative</p>
      <a href="${frontendUrl}" style="font-size:11px;color:#64748b;text-decoration:none">wroket.com</a>
    </div>
  </div>`;
}

// ── Slack / Teams / Google Chat digest ───────────────────────────────────────

function buildSlackDigestBlocks(entries: DigestEntry[]): unknown {
  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔔 *Résumé Wroket — ${entries.length} notification${entries.length > 1 ? "s" : ""}*`,
      },
    },
    { type: "divider" },
  ];
  for (const e of entries) {
    const link = e.data?.todoId ? ` — <${taskDeepLink(e.data.todoId)}|Ouvrir>` : "";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji(e.type)} *${escapeSlackMrkdwn(e.title)}*\n${escapeSlackMrkdwn(e.message)}${link}`,
      },
    });
  }
  return { blocks };
}

function buildTeamsDigestCard(entries: DigestEntry[]): unknown {
  const body: unknown[] = [
    { type: "TextBlock", text: `🔔 Résumé Wroket — ${entries.length} notification${entries.length > 1 ? "s" : ""}`, weight: "Bolder", size: "Medium" },
  ];
  for (const e of entries) {
    body.push({ type: "TextBlock", text: `${emoji(e.type)} **${e.title}**`, wrap: true, spacing: "Small" });
    body.push({ type: "TextBlock", text: e.message, wrap: true, isSubtle: true, size: "Small" });
    if (e.data?.todoId) {
      body.push({
        type: "ActionSet",
        actions: [{ type: "Action.OpenUrl", title: "Ouvrir", url: taskDeepLink(e.data.todoId) }],
      });
    }
  }
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body },
    }],
  };
}

function buildGoogleChatDigestText(entries: DigestEntry[]): unknown {
  const lines: string[] = [`🔔 *Résumé Wroket — ${entries.length} notification${entries.length > 1 ? "s" : ""}*`, ""];
  for (const e of entries) {
    lines.push(`${emoji(e.type)} *${e.title}*`);
    lines.push(e.message);
    if (e.data?.todoId) lines.push(`Ouvrir : ${taskDeepLink(e.data.todoId)}`);
    lines.push("");
  }
  return { text: lines.join("\n") };
}

// ── Flush logic ───────────────────────────────────────────────────────────────

function flushUserDigest(userId: string): void {
  const q = queueByUser.get(userId);
  if (!q || q.length === 0) return;

  const entries = [...q];
  q.length = 0;
  persist();

  const prefs = getNotificationDeliveryPrefs(userId);
  if (!prefs || prefs.mode === "none") return;

  try {
    if (prefs.mode === "email") {
      const subject = `Wroket — Résumé (${entries.length} notification${entries.length > 1 ? "s" : ""})`;
      const html = buildDigestEmailHtml(entries);
      const nodemailer = require("nodemailer") as typeof import("nodemailer");
      const smtpUser = process.env.SMTP_USER ?? "";
      const smtpPass = process.env.SMTP_PASS ?? "";
      if (!smtpUser || !smtpPass) return;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      const from = process.env.EMAIL_FROM || smtpUser;
      void transporter.sendMail({ from: `"Wroket" <${from}>`, to: prefs.email, subject, html });
      return;
    }

    if (!prefs.webhookUrl) return;
    const url = prefs.webhookUrl;

    let body: unknown;
    if (prefs.mode === "slack") {
      body = buildSlackDigestBlocks(entries);
    } else if (prefs.mode === "teams") {
      body = buildTeamsDigestCard(entries);
    } else if (prefs.mode === "google_chat") {
      body = buildGoogleChatDigestText(entries);
    } else {
      return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    }).catch((err) => {
      console.warn("[digest] outbound flush failed for %s: %s", userId, (err as Error).message ?? err);
    });
  } catch (err) {
    console.warn("[digest] flush error for %s: %s", userId, (err as Error).message ?? err);
  }
}

/**
 * Called every hour — flushes all users whose frequency is "hourly_digest".
 */
export function flushHourlyDigests(): void {
  for (const [uid] of queueByUser) {
    const filterPrefs = getNotificationFilterPrefs(uid);
    if (filterPrefs?.frequency === "hourly_digest") {
      flushUserDigest(uid);
    }
  }
}

/**
 * Called every hour — flushes users whose frequency is "daily_digest"
 * and whose local digest hour matches the current hour.
 */
export function flushDailyDigests(nowUtc: Date): void {
  for (const [uid] of queueByUser) {
    const filterPrefs = getNotificationFilterPrefs(uid);
    if (filterPrefs?.frequency !== "daily_digest") continue;
    const currentLocalHour = localHour(nowUtc, filterPrefs.timezone);
    if (currentLocalHour === filterPrefs.digestHour) {
      flushUserDigest(uid);
    }
  }
}
