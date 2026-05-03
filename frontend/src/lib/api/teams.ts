import {
  API_BASE_URL, parseJsonOrThrow, extractApiMessage,
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

export interface Team {
  id: string;
  name: string;
  ownerUid: string;
  members: TeamMember[];
  createdAt: string;
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
  if (!res.ok) throw new Error("Erreur lors de l'acceptation");
  broadcastResourceChange("teams");
}

export async function declineCollaboration(inviterEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviterEmail }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors du refus");
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
  | "project_deleted";

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
