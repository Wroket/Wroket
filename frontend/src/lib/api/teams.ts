import { parseApiErrorResponse } from "@/lib/apiErrors";

import {
  API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage,
} from "./core";
import type { Todo } from "./todos";
import { broadcastResourceChange } from "@/lib/useResourceSync";

export interface Collaborator {
  email: string;
  status: "active" | "pending";
}

export type TeamMemberRole = "co-owner" | "admin" | "super-user" | "user";

export interface TeamMember {
  email: string;
  role: TeamMemberRole;
}

export type BillingPlanTeam = "free" | "first" | "small" | "large";

export interface TeamCollaborator {
  email: string;
  status: "pending" | "active";
}

export interface WorkspaceAdmin {
  email: string;
  addedAt: string;
  addedByUid?: string;
}

export interface TeamFeatureFlags {
  integrationsEnabled?: boolean;
}

export interface Team {
  id: string;
  name: string;
  ownerUid: string;
  members: TeamMember[];
  createdAt: string;
  /** Plan commercial de l'équipe (défaut : "free"). */
  billingPlan?: BillingPlanTeam;
  /** Nombre de sièges couverts (undefined = pas de limite). */
  seatCount?: number;
  /** Collaborateurs externes (plan propre, non comptés dans les sièges). */
  collaborators?: TeamCollaborator[];
  workspaceAdmins?: WorkspaceAdmin[];
  featureFlags?: TeamFeatureFlags;
}

export interface ReceivedInvitation {
  fromEmail: string;
}

export async function getCollaborators(): Promise<Collaborator[]> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les collaborateurs");
  return (await res.json()) as Collaborator[];
}

/** Emails of collaborators + team members; server returns [] until query has at least 3 characters. */
export async function getEmailSuggestions(query: string, opts?: { signal?: AbortSignal }): Promise<string[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(
    `${API_BASE_URL}/teams/email-suggestions?q=${encodeURIComponent(q)}`,
    { method: "GET", credentials: "include", signal: opts?.signal },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { emails?: string[] };
  return Array.isArray(body.emails) ? body.emails : [];
}

export async function getReceivedInvitations(): Promise<ReceivedInvitation[]> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/received`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les invitations reçues");
  return (await res.json()) as ReceivedInvitation[];
}

export async function inviteCollaborator(email: string): Promise<Collaborator> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Collaborator;
  broadcastResourceChange("teams");
  return result;
}

/** Re-sends in-app notification (if applicable) and collaboration invite email for a pending invite. */
export async function resendCollaboratorInvite(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de renvoyer l'invitation"));
  }
}

export async function removeCollaborator(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le collaborateur");
  broadcastResourceChange("teams");
}

export async function acceptCollaboration(inviterEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviterEmail }),
    credentials: "include",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "errors.code.COLLAB_ACCEPT_FAILED");
  broadcastResourceChange("teams");
}

export async function declineCollaboration(inviterEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviterEmail }),
    credentials: "include",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "errors.code.COLLAB_DECLINE_FAILED");
  broadcastResourceChange("teams");
}

export async function getTeams(): Promise<Team[]> {
  const res = await fetch(`${API_BASE_URL}/teams`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les équipes");
  return (await res.json()) as Team[];
}

export async function createTeam(name: string, members: string[]): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, members }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export async function addTeamMember(teamId: string, email: string): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export async function removeTeamMemberApi(teamId: string, email: string): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur");
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export async function updateMemberRoleApi(teamId: string, email: string, role: TeamMemberRole): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export interface TeamDashboardData {
  team: Team;
  workspaceAdminMode?: boolean;
  usedSeats?: number;
  featureFlags?: TeamFeatureFlags;
  stats: {
    totalTasks: number;
    byMember: Record<string, { total: number; overdue: number }>;
    overdue: number;
    dueSoon: number;
  };
  todos: Todo[];
  memberMap: Record<string, string>;
}

export async function getTeamDashboard(teamId: string): Promise<TeamDashboardData> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/dashboard`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger le dashboard équipe");
  return res.json();
}

export interface TeamPortfolioProjectRow {
  projectId: string;
  projectName: string;
  teamId: string | null;
  health: "done" | "overdue" | "at-risk" | "on-track" | "empty";
  completionRatio: number | null;
  activeCount: number;
  overdueCount: number;
  atRiskCount: number;
  nextMilestone: { phaseName: string; endDate: string; daysLeft: number } | null;
}

export interface TeamPortfolioSnapshot {
  teamId: string;
  generatedAt: string;
  projects: TeamPortfolioProjectRow[];
}

export async function getTeamPortfolio(teamId: string): Promise<TeamPortfolioSnapshot> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/portfolio`, { ...apiFetchDefaults, method: "GET" });
  if (!res.ok) throw new Error("Impossible de charger le portfolio");
  return res.json() as Promise<TeamPortfolioSnapshot>;
}

export type TeamReportingPeriodDays = 7 | 14 | 30;

export interface TeamReportingMemberRow {
  email: string;
  active: number;
  createdInPeriod: number;
  completedInPeriod: number;
  cancelledInPeriod: number;
  overdueActive: number;
}

export interface TeamReportingProjectRow {
  projectId: string;
  active: number;
  createdInPeriod: number;
  completedInPeriod: number;
  cancelledInPeriod: number;
  overdueActive: number;
  noDeadlineActive: number;
  completionRatio: number | null;
}

export interface TeamReportingVelocityWeek {
  weekStartUtc: string;
  weekEndUtc: string;
  completed: number;
  byProject: Record<string, number>;
}

export interface TeamReportingSnapshot {
  periodDays: TeamReportingPeriodDays;
  generatedAt: string;
  summary: {
    active: number;
    createdInPeriod: number;
    completedInPeriod: number;
    cancelledInPeriod: number;
    overdueActive: number;
    noDeadlineActive: number;
  };
  byMember: TeamReportingMemberRow[];
  byProject: TeamReportingProjectRow[];
  velocityWeeks: TeamReportingVelocityWeek[];
}

export interface TeamReportingResponse extends TeamReportingSnapshot {
  team: Team;
  memberMap: Record<string, string>;
}

export async function getTeamReporting(teamId: string, periodDays: TeamReportingPeriodDays): Promise<TeamReportingResponse> {
  const res = await fetch(
    `${API_BASE_URL}/teams/${teamId}/reporting?periodDays=${encodeURIComponent(String(periodDays))}`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de charger le reporting équipe"));
  }
  return res.json();
}

export async function deleteTeamApi(teamId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer l'équipe");
  broadcastResourceChange("teams");
}

export async function getOwnedTeams(): Promise<Team[]> {
  const res = await fetch(`${API_BASE_URL}/teams/owned`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les équipes");
  return (await res.json()) as Team[];
}

export async function transferTeamOwnership(teamId: string, newOwnerEmail: string): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newOwnerEmail }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors du transfert"));
  }
  return (await res.json()) as Team;
}

// ── Team External Collaborators ──

export async function getTeamCollaborators(teamId: string): Promise<TeamCollaborator[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/ext-collaborators`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les collaborateurs");
  return (await res.json()) as TeamCollaborator[];
}

export async function addTeamCollaboratorApi(teamId: string, email: string): Promise<TeamCollaborator> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/ext-collaborators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as TeamCollaborator;
  broadcastResourceChange("teams");
  return result;
}

export async function removeTeamCollaboratorApi(teamId: string, email: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/teams/${teamId}/ext-collaborators/${encodeURIComponent(email)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new Error("Impossible de supprimer le collaborateur");
  broadcastResourceChange("teams");
}

// ── Workspace admins (hors siège) ──

export async function getWorkspaceAdmins(teamId: string): Promise<WorkspaceAdmin[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/workspace-admins`, { credentials: "include" });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de charger les administrateurs workspace"));
  }
  const data = (await res.json()) as { workspaceAdmins?: WorkspaceAdmin[] };
  return Array.isArray(data.workspaceAdmins) ? data.workspaceAdmins : [];
}

export async function addWorkspaceAdminApi(teamId: string, email: string): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/workspace-admins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export async function removeWorkspaceAdminApi(teamId: string, email: string): Promise<Team> {
  const res = await fetch(
    `${API_BASE_URL}/teams/${teamId}/workspace-admins/${encodeURIComponent(email)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const result = (await res.json()) as Team;
  broadcastResourceChange("teams");
  return result;
}

export async function getTeamFeatures(teamId: string): Promise<TeamFeatureFlags> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/features`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les options équipe");
  const body = (await res.json()) as { featureFlags?: TeamFeatureFlags };
  return body.featureFlags ?? {};
}

export async function patchTeamFeaturesApi(
  teamId: string,
  patch: Partial<TeamFeatureFlags>,
): Promise<TeamFeatureFlags> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/features`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  const body = (await res.json()) as { featureFlags?: TeamFeatureFlags };
  broadcastResourceChange("teams");
  return body.featureFlags ?? {};
}

export async function createTeamBillingPortalSession(
  teamId: string,
  returnUrl?: string,
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/billing/team-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, ...(returnUrl ? { returnUrl } : {}) }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible d'ouvrir le portail de facturation"));
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("URL portail manquante");
  return data.url;
}

// ── Notifications ──

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
  | "project_deleted"
  | "dependency_blocked"
  | "milestone_due_soon"
  | "project_at_risk";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, string>;
  createdAt: string;
}

export async function getNotifications(): Promise<AppNotification[]> {
  const res = await fetch(`${API_BASE_URL}/notifications`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notifications");
  return (await res.json()) as AppNotification[];
}

export async function getUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/notifications/count`, { method: "GET", credentials: "include" });
  if (!res.ok) return 0;
  const body = (await res.json()) as { count: number };
  return body.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, { method: "PUT", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de marquer la notification comme lue");
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/read-all`, { method: "PUT", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de marquer les notifications comme lues");
}
