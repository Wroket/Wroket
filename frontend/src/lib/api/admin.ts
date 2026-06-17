import { API_BASE_URL, type ActivityLogEntry, type BillingPlan } from "./core";

export interface AdminStats {
  users: { total: number; verified: number; last7d: number; last30d: number; googleSso: number };
  tasks: { total: number; active: number; completed: number; cancelled: number; scheduled: number };
  projects: { total: number; active: number };
  teams: number;
  invitesSent: number;
  notes: number;
  comments: number;
  uptime: number;
}

export interface AdminUser {
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
  billingPlan: BillingPlan;
  stripeLinked: boolean;
  stripeSubscriptionStatus: string | null;
  billingCurrentPeriodEnd: string | null;
  earlyBird: boolean;
}

export type InviteConversionStatus = "converted" | "pending" | "existing_account";

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

/** @deprecated Use AdminInviteLogEntry */
export type InviteLogEntry = AdminInviteLogEntry;

export interface SessionInfo {
  uid: string;
  email: string;
  expiresAt: number;
  createdAt: number;
}

export interface IntegrationOverview {
  webhooks: { total: number; active: number; byPlatform: Record<string, number> };
  googleCalendarConnected: number;
  microsoftCalendarConnected: number;
}

export interface CompletionRate {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  total: number;
  completed: number;
  rate: number;
}

export type AdminEngagementPeriodDays = 7 | 14 | 30;

export interface AdminEngagementSnapshot {
  periodDays: AdminEngagementPeriodDays;
  generatedAt: string;
  activeUsers: { dau: number; wau: number; mau: number; totalUsers: number };
  growth: {
    emailVerificationRate: number;
    weeklyTrends: Array<{ weekStartUtc: string; weekEndUtc: string; signups: number; completions: number }>;
  };
  tasks: {
    summary: {
      active: number;
      createdInPeriod: number;
      completedInPeriod: number;
      cancelledInPeriod: number;
    };
    velocityWeeks: Array<{ weekStartUtc: string; weekEndUtc: string; completed: number }>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byEffort: Record<string, number>;
  };
  adoption: Array<{ key: string; count: number; percent: number }>;
}

export interface AdminOpsSnapshot {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  store: { ok: boolean; backend: "local" | "firestore" };
  persistence: {
    lastFlushAt: string | null;
    lastFlushOpsCount: number;
    lastFlushDurationMs: number | null;
    consecutiveFlushFailures: number;
    failedFlushAttempts: number;
    dirtyDomainsCount: number;
    dirtyShardsCount: number;
  };
  todosDrift: {
    status: string;
    checkedAt: string | null;
    source?: string;
    owners?: number;
    countDriftOwners?: number;
    v2OnlyTotal?: number;
    inMemoryOnlyTotal?: number;
    error?: string;
  };
  sessions: { total: number; usersWithMultiple: number };
}

export interface AdminPricingLead {
  email: string;
  lastSubmittedAt: string;
  lastTier: string | null;
}

export interface AdminPricingLeadsSnapshot {
  leads: AdminPricingLead[];
  last7d: number;
  last30d: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${API_BASE_URL}/admin/stats`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE_URL}/admin/users`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminInvites(): Promise<AdminInviteLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/admin/invites`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function postAdminInviteRemind(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/invites/remind`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    let msg = "Erreur";
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function deleteAdminInvite(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/invites/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "Erreur";
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string") msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function getAdminActivity(params?: {
  limit?: number;
  offset?: number;
  userId?: string;
  entityType?: string;
  action?: string;
}): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.entityType) qs.set("entityType", params.entityType);
  if (params?.action) qs.set("action", params.action);
  const res = await fetch(`${API_BASE_URL}/admin/activity?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminSessions(): Promise<SessionInfo[]> {
  const res = await fetch(`${API_BASE_URL}/admin/sessions`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminIntegrations(): Promise<IntegrationOverview> {
  const res = await fetch(`${API_BASE_URL}/admin/integrations`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminUserExport(uid: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${uid}/export`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function deleteAdminUser(uid: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${uid}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Erreur lors de la suppression");
}

export async function getAdminCompletionRates(): Promise<CompletionRate[]> {
  const res = await fetch(`${API_BASE_URL}/admin/users/completion-rates`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function postAdminUserBillingPortalSession(
  uid: string,
  opts?: { returnUrl?: string },
): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(uid)}/billing-portal-session`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts?.returnUrl ? { returnUrl: opts.returnUrl } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; url?: string };
  if (!res.ok) throw new Error(data.message ?? "Impossible d’ouvrir le portail de facturation");
  if (!data.url) throw new Error("Réponse inattendue du serveur");
  return { url: data.url };
}

export async function patchAdminUserBillingPlan(
  uid: string,
  plan: BillingPlan,
  reason: string,
): Promise<{ billingPlan: BillingPlan; unchanged?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(uid)}/billing-plan`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, reason }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; billingPlan?: BillingPlan; unchanged?: boolean };
  if (!res.ok) throw new Error(data.message ?? "Impossible de mettre à jour le plan");
  return { billingPlan: data.billingPlan ?? plan, unchanged: data.unchanged };
}

export async function patchAdminUserEarlyBird(
  uid: string,
  earlyBird: boolean,
  reason: string,
): Promise<{ earlyBird: boolean; unchanged?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(uid)}/early-bird`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ earlyBird, reason }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; earlyBird?: boolean; unchanged?: boolean };
  if (!res.ok) throw new Error(data.message ?? "Impossible de mettre à jour le statut early bird");
  return { earlyBird: data.earlyBird ?? earlyBird, unchanged: data.unchanged };
}

export async function getAdminEngagement(periodDays: AdminEngagementPeriodDays = 7): Promise<AdminEngagementSnapshot> {
  const res = await fetch(`${API_BASE_URL}/admin/engagement?periodDays=${periodDays}`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminOps(): Promise<AdminOpsSnapshot> {
  const res = await fetch(`${API_BASE_URL}/admin/ops`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminLeads(): Promise<AdminPricingLeadsSnapshot> {
  const res = await fetch(`${API_BASE_URL}/admin/leads`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}
