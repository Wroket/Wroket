import crypto from "node:crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";
import type { BillingPlan } from "./entitlementsService";
import { resolveBillingPlan } from "./entitlementsService";
import { normalizeEmail } from "./authService";
import { sendInviteEmail } from "./emailService";

/**
 * FIX: Do not fall back to a hardcoded email. If ADMIN_EMAILS is not
 * configured the admin panel is simply inaccessible — which is the safe
 * default. The original code fell back to "francois@broudeur.com",
 * meaning an unconfigured production deploy would grant admin access to
 * whoever registered that email.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (ADMIN_EMAILS.length === 0) {
  console.warn("[admin] ADMIN_EMAILS not configured — admin panel disabled");
}

export function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(email.toLowerCase());
}

export interface AdminUserSummary {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  googleSso: boolean;
  taskCount: number;
  /** Projects owned by this user (all statuses). */
  projectCount: number;
  noteCount: number;
  createdAt: string;
  lastLoginAt: string;
  /** Effective plan (legacy accounts without stored plan resolve to `first`). */
  billingPlan: BillingPlan;
  stripeLinked: boolean;
  stripeSubscriptionStatus: string | null;
  billingCurrentPeriodEnd: string | null;
  /** Statut early bird (admin uniquement). */
  earlyBird: boolean;
}

interface AdminStats {
  users: { total: number; verified: number; last7d: number; last30d: number; googleSso: number };
  tasks: { total: number; active: number; completed: number; cancelled: number; scheduled: number };
  projects: { total: number; active: number };
  teams: number;
  invitesSent: number;
  notes: number;
  comments: number;
  uptime: number;
}

export function getAdminStats(): AdminStats {
  const store = getStore();
  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const userStats = {
    total: users.length,
    verified: 0,
    last7d: 0,
    last30d: 0,
    googleSso: 0,
  };
  for (const u of users) {
    if (u.emailVerified) userStats.verified++;
    const created = new Date(u.createdAt as string).getTime();
    if (created >= d7) userStats.last7d++;
    if (created >= d30) userStats.last30d++;
    const hash = u.passwordHashB64 as string | undefined;
    if (hash && hash.length > 80) userStats.googleSso++;
  }

  const todoStore = store.todos ?? {};
  let taskTotal = 0, taskActive = 0, taskCompleted = 0, taskCancelled = 0, taskScheduled = 0;
  for (const userTodos of Object.values(todoStore)) {
    const todos = userTodos as Record<string, Record<string, unknown>>;
    for (const todo of Object.values(todos)) {
      taskTotal++;
      const status = todo.status as string;
      if (status === "active") taskActive++;
      else if (status === "completed") taskCompleted++;
      else if (status === "cancelled") taskCancelled++;
      if (todo.scheduledSlot) taskScheduled++;
    }
  }

  const projects = Object.values(store.projects ?? {}) as Array<Record<string, unknown>>;
  const projectStats = {
    total: projects.length,
    active: projects.filter((p) => p.status !== "archived").length,
  };

  const teams = Object.keys(store.teams ?? {}).length;

  let invitesSent = 0;
  const collabs = store.collaborators ?? {};
  for (const list of Object.values(collabs)) {
    invitesSent += (list as unknown[]).length;
  }

  // Notes count
  const noteStore = store.notes ?? {};
  let notesCount = 0;
  for (const userNotes of Object.values(noteStore)) {
    notesCount += Object.keys(userNotes as Record<string, unknown>).length;
  }

  // Comments count
  const commentStore = store.comments ?? {};
  let commentsCount = 0;
  for (const list of Object.values(commentStore)) {
    commentsCount += (list as unknown[]).length;
  }

  return {
    users: userStats,
    tasks: { total: taskTotal, active: taskActive, completed: taskCompleted, cancelled: taskCancelled, scheduled: taskScheduled },
    projects: projectStats,
    teams,
    invitesSent,
    notes: notesCount,
    comments: commentsCount,
    uptime: process.uptime(),
  };
}

/** Raw row in store.inviteLog (legacy rows may omit id). */
export interface InviteLogRow {
  id?: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  sentAt: string;
  reminderSentAt?: string;
}

export type InviteConversionStatus = "converted" | "pending" | "existing_account";

/** Enriched invite row returned by GET /admin/invites. */
export interface AdminInviteLogEntry {
  id: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  sentAt: string;
  reminderSentAt: string | null;
  accepted: boolean;
  status: InviteConversionStatus;
  canResend: boolean;
  eligibleResendAt: string | null;
}

const REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

function legacyInviteId(sentAt: string, fromEmail: string, toEmail: string): string {
  const h = crypto.createHash("sha256").update(`${sentAt}|${fromEmail}|${toEmail}`, "utf8").digest("hex");
  return `legacy-${h.slice(0, 16)}`;
}

function resolveInviteRowId(row: InviteLogRow): string {
  if (typeof row.id === "string" && row.id.length > 0) return row.id;
  return legacyInviteId(row.sentAt, row.fromEmail, row.toEmail);
}

function getCreatedAtIsoForInviteeEmail(toEmail: string): string | null {
  const norm = normalizeEmail(toEmail);
  const store = getStore();
  for (const u of Object.values(store.users ?? {})) {
    const row = u as Record<string, unknown>;
    if (normalizeEmail(String(row.email ?? "")) !== norm) continue;
    const ca = row.createdAt;
    if (typeof ca === "string" && ca.length > 0) return ca;
    return null;
  }
  return null;
}

function inviteConversionStatus(sentAtMs: number, inviteeCreatedAt: string | null): InviteConversionStatus {
  if (!inviteeCreatedAt) return "pending";
  if (new Date(inviteeCreatedAt).getTime() >= sentAtMs) return "converted";
  return "existing_account";
}

function enrichInviteRow(row: InviteLogRow, nowMs: number): AdminInviteLogEntry {
  const sentAtMs = new Date(row.sentAt).getTime();
  const createdAt = getCreatedAtIsoForInviteeEmail(row.toEmail);
  const status = inviteConversionStatus(sentAtMs, createdAt);
  const accepted = status === "converted";
  const reminderSentAt =
    typeof row.reminderSentAt === "string" && row.reminderSentAt.length > 0 ? row.reminderSentAt : null;
  const eligibleMs = sentAtMs + REMINDER_DELAY_MS;
  const eligibleResendAt = status === "pending" ? new Date(eligibleMs).toISOString() : null;
  const canResend =
    status === "pending" && !reminderSentAt && nowMs >= eligibleMs;

  return {
    id: resolveInviteRowId(row),
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    toEmail: row.toEmail,
    sentAt: row.sentAt,
    reminderSentAt,
    accepted,
    status,
    canResend,
    eligibleResendAt,
  };
}

export function getInviteLog(): AdminInviteLogEntry[] {
  const store = getStore();
  const log = (store.inviteLog ?? []) as InviteLogRow[];
  const nowMs = Date.now();
  return [...log]
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .map((row) => enrichInviteRow(row, nowMs));
}

function findInviteRowByResolvedId(inviteId: string): InviteLogRow | null {
  const store = getStore();
  const log = (store.inviteLog ?? []) as InviteLogRow[];
  for (const row of log) {
    if (resolveInviteRowId(row) === inviteId) return row;
  }
  return null;
}

export async function resendInviteReminder(inviteId: string): Promise<void> {
  const row = findInviteRowByResolvedId(inviteId);
  if (!row) {
    throw new NotFoundError("Invitation introuvable.");
  }
  const nowMs = Date.now();
  const enriched = enrichInviteRow(row, nowMs);
  if (!enriched.canResend) {
    if (enriched.status !== "pending") {
      throw new ValidationError(
        "Relance impossible : le destinataire avait déjà un compte ou s'est inscrit suite à cette invitation.",
      );
    }
    if (enriched.reminderSentAt) {
      throw new ValidationError("Une relance a déjà été envoyée pour cette invitation.");
    }
    throw new ValidationError("La relance n'est possible qu'à partir du 7e jour après l'envoi.");
  }
  await sendInviteEmail(row.toEmail, row.fromName, "fr");
  row.reminderSentAt = new Date().toISOString();
  scheduleSave("inviteLog");
}

export function deleteInviteLogEntry(inviteId: string): { fromEmail: string; toEmail: string } {
  const store = getStore();
  const log = (store.inviteLog ?? []) as InviteLogRow[];
  const idx = log.findIndex((row) => resolveInviteRowId(row) === inviteId);
  if (idx === -1) {
    throw new NotFoundError("Invitation introuvable.");
  }
  const removed = log[idx];
  store.inviteLog = [...log.slice(0, idx), ...log.slice(idx + 1)];
  scheduleSave("inviteLog");
  return { fromEmail: removed.fromEmail, toEmail: removed.toEmail };
}

export function getAdminUsers(): AdminUserSummary[] {
  const store = getStore();
  const users = Object.values(store.users ?? {}) as Array<Record<string, unknown>>;
  const todoStore = store.todos ?? {};
  const noteStoreAll = store.notes ?? {};
  const projects = Object.values(store.projects ?? {}) as Array<Record<string, unknown>>;
  const projectCountByUid = new Map<string, number>();
  for (const p of projects) {
    const ou = p.ownerUid as string | undefined;
    if (!ou) continue;
    projectCountByUid.set(ou, (projectCountByUid.get(ou) ?? 0) + 1);
  }

  // Determine last login from active sessions
  const sessionStore = (store.sessions ?? {}) as Record<string, Record<string, unknown>>;
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const lastLoginMap = new Map<string, number>();
  for (const session of Object.values(sessionStore)) {
    const suid = session.uid as string;
    const loginTs = (session.createdAt as number) || ((session.expiresAt as number ?? 0) - SESSION_TTL_MS);
    const prev = lastLoginMap.get(suid) ?? 0;
    if (loginTs > prev) lastLoginMap.set(suid, loginTs);
  }

  return users.map((u) => {
    const uid = u.uid as string;
    const userTodos = (todoStore as Record<string, Record<string, unknown>>)[uid] ?? {};
    const taskCount = Object.keys(userTodos).length;
    const userNotes = (noteStoreAll as Record<string, Record<string, unknown>>)[uid] ?? {};
    const noteCount = Object.keys(userNotes).length;
    const projectCount = projectCountByUid.get(uid) ?? 0;
    const hash = u.passwordHashB64 as string | undefined;
    const lastLogin = lastLoginMap.get(uid);

    const cid = (u.stripeCustomerId as string | undefined)?.trim() ?? "";
    const subStatus = (u.stripeSubscriptionStatus as string | undefined)?.trim() ?? "";
    const periodEnd = (u.billingCurrentPeriodEnd as string | undefined)?.trim() ?? "";

    return {
      uid,
      email: u.email as string,
      firstName: (u.firstName as string) ?? "",
      lastName: (u.lastName as string) ?? "",
      emailVerified: !!u.emailVerified,
      googleSso: !!(hash && hash.length > 80),
      taskCount,
      projectCount,
      noteCount,
      createdAt: (u.createdAt as string) ?? "",
      lastLoginAt: lastLogin ? new Date(lastLogin).toISOString() : "",
      billingPlan: resolveBillingPlan(u.billingPlan),
      stripeLinked: cid.length > 0,
      stripeSubscriptionStatus: subStatus.length > 0 ? subStatus : null,
      billingCurrentPeriodEnd: periodEnd.length > 0 ? periodEnd : null,
      earlyBird: !!(u.earlyBird as boolean | undefined),
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
