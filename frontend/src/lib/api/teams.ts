import {
  API_BASE_URL, parseJsonOrThrow, extractApiMessage,
} from "./core";
import type { Todo } from "./todos";

export interface Collaborator {
  email: string;
  status: "active" | "pending";
}

export type TeamMemberRole = "admin" | "super-user" | "user";

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
  return (await res.json()) as Collaborator;
}

export async function removeCollaborator(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le collaborateur");
}

export async function acceptCollaboration(inviterEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviterEmail }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de l'acceptation");
}

export async function declineCollaboration(inviterEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviterEmail }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors du refus");
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
  return (await res.json()) as Team;
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
  return (await res.json()) as Team;
}

export async function removeTeamMemberApi(teamId: string, email: string): Promise<Team> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur");
  return (await res.json()) as Team;
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
  return (await res.json()) as Team;
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
}

// ── Notifications ──

export type NotificationType = "task_assigned" | "task_completed" | "task_declined" | "task_accepted" | "team_invite" | "deadline_approaching" | "deadline_today" | "comment_mention";

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
