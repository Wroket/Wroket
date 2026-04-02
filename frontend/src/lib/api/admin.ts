import { API_BASE_URL, type ActivityLogEntry } from "./core";

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
  noteCount: number;
  createdAt: string;
  lastLoginAt: string;
}

export interface InviteLogEntry {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  sentAt: string;
}

export interface SessionInfo {
  uid: string;
  email: string;
  expiresAt: number;
}

export interface IntegrationOverview {
  webhooks: { total: number; active: number; byPlatform: Record<string, number> };
  googleCalendarConnected: number;
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

export async function getAdminInvites(): Promise<InviteLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/admin/invites`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export async function getAdminActivity(params?: {
  limit?: number;
  offset?: number;
  userId?: string;
  entityType?: string;
}): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.userId) qs.set("userId", params.userId);
  if (params?.entityType) qs.set("entityType", params.entityType);
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
