const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

interface LoginPayload {
  email: string;
  password: string;
}

export interface WorkingHours {
  start: string;
  end: string;
  timezone: string;
  daysOfWeek: number[];
}

export interface ScheduledSlot {
  start: string;
  end: string;
  calendarEventId: string | null;
}

export interface SlotProposal {
  start: string;
  end: string;
  label: string;
}

export interface AuthMeResponse {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: { light: number; medium: number; heavy: number };
  workingHours: WorkingHours;
  googleCalendarConnected: boolean;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`Erreur serveur (${res.status})`);
  }
}

/**
 * Safely extract a `message` string from an unknown API response body.
 *
 * Why: the original code repeated the pattern
 *   `typeof body === "object" && body !== null && "message" in body
 *     ? (body as any).message`
 * 17 times across this file. The `as any` cast suppresses TypeScript
 * entirely — if the response shape changes we get a runtime `undefined`
 * instead of a compile-time error.  This helper replaces every occurrence
 * with a single, typed narrowing that returns a `string` in all cases.
 */
function extractApiMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as Record<string, unknown>).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return fallback;
}

function getBrowserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  catch { return "Europe/Paris"; }
}

export async function login(
  payload: LoginPayload
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timezone: getBrowserTimezone() }),
    credentials: "include"
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Identifiants invalides"));
  }
}

export async function register(
  payload: LoginPayload
): Promise<{ needsVerification?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timezone: getBrowserTimezone() }),
    credentials: "include"
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de s'enregistrer"));
  }

  const body = await res.json();
  return body as { needsVerification?: boolean };
}

export async function verifyEmailApi(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur de vérification"));
  }
}

export async function resendVerificationApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors du renvoi"));
  }
}

export async function forgotPasswordApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function resetPasswordApi(token: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de la réinitialisation"));
  }
}

export async function getGoogleSsoUrl(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/google/url`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur d'authentification Google");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function shareInviteApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/share-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'envoi"));
  }
}

// ── Admin ──

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

export interface InviteLogEntry {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  sentAt: string;
}

export async function getAdminInvites(): Promise<InviteLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/admin/invites`, { credentials: "include" });
  if (!res.ok) throw new Error("Accès refusé");
  return res.json();
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
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

export async function getAdminActivity(params?: { limit?: number; offset?: number; userId?: string; entityType?: string }): Promise<{ entries: ActivityLogEntry[]; total: number }> {
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

export async function getMe(): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    credentials: "include"
  });

  if (!res.ok) {
    throw new Error("Non authentifié");
  }

  return (await res.json()) as AuthMeResponse;
}

export async function updateProfile(payload: { firstName?: string; lastName?: string; effortMinutes?: { light: number; medium: number; heavy: number }; workingHours?: WorkingHours }): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de mettre à jour le profil"));
  }

  return (await res.json()) as AuthMeResponse;
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include"
  });

  if (!res.ok) {
    throw new Error("Erreur lors de la déconnexion");
  }
}

// ── Password / Account ──

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erreur lors du changement de mot de passe");
  }
}

export async function getMyExport(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE_URL}/auth/my-export`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger l'export");
  return res.json();
}

export async function deleteMyAccount(confirmation: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/my-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erreur lors de la suppression");
  }
}

export async function getMyActivity(params?: { limit?: number; offset?: number }): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE_URL}/auth/my-activity?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger l'historique");
  return res.json();
}

// ── Search ──

export interface SearchResult {
  type: "todo" | "project" | "note";
  id: string;
  title: string;
  snippet?: string;
  status?: string;
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  if (query.length < 2) return [];
  const res = await fetch(`${API_BASE_URL}/auth/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

// ── Attachments ──

export interface Attachment {
  id: string;
  todoId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export async function uploadAttachment(todoId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractApiMessage(data, "Erreur d'upload"));
  }
  return res.json();
}

export async function getAttachments(todoId: string): Promise<Attachment[]> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

export async function downloadAttachment(todoId: string, attachmentId: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}/${attachmentId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de télécharger");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteAttachmentApi(todoId: string, attachmentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attachments/${todoId}/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer");
}

// ── Todos ──

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";

export type AssignmentStatus = "pending" | "accepted" | "declined";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  nextDueDate?: string;
  endDate?: string;
}

export interface Todo {
  id: string;
  userId: string;
  parentId: string | null;
  projectId: string | null;
  phaseId: string | null;
  assignedTo: string | null;
  assignmentStatus: AssignmentStatus | null;
  title: string;
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  startDate: string | null;
  deadline: string | null;
  tags: string[];
  scheduledSlot: ScheduledSlot | null;
  recurrence: Recurrence | null;
  sortOrder?: number | null;
  status: TodoStatus;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoPayload {
  title: string;
  priority: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  parentId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  recurrence?: Recurrence | null;
}

export interface UpdateTodoPayload {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  startDate?: string | null;
  deadline?: string | null;
  tags?: string[];
  status?: TodoStatus;
  projectId?: string | null;
  phaseId?: string | null;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
  recurrence?: Recurrence | null;
}

export async function getTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les tâches");
  return (await res.json()) as Todo[];
}

export async function getAssignedTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos/assigned`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les tâches assignées");
  return (await res.json()) as Todo[];
}

export async function getArchivedTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos/archived`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les tâches archivées");
  return (await res.json()) as Todo[];
}

export async function createTodo(payload: CreateTodoPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de créer la tâche"));
  }
  return (await res.json()) as Todo;
}

export async function updateTodo(id: string, payload: UpdateTodoPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de modifier la tâche"));
  }
  return (await res.json()) as Todo;
}

// ── Comments ──

export interface Comment {
  id: string;
  todoId: string;
  userId: string;
  userEmail: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  reactions?: Record<string, string[]>;
}

export async function getComments(todoId: string): Promise<Comment[]> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les commentaires");
  return res.json();
}

export async function getCommentCounts(): Promise<Record<string, number>> {
  const res = await fetch(`${API_BASE_URL}/todos/comment-counts`, { credentials: "include" });
  if (!res.ok) return {};
  return res.json();
}

export async function postCommentApi(todoId: string, text: string): Promise<Comment> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible d'ajouter le commentaire");
  return res.json();
}

export async function editCommentApi(todoId: string, commentId: string, text: string): Promise<Comment> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de modifier le commentaire");
  return res.json();
}

export async function deleteCommentApi(todoId: string, commentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le commentaire");
}

export async function toggleReactionApi(todoId: string, commentId: string, emoji: string): Promise<Comment> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/comments/${commentId}/reactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de réagir");
  return res.json();
}

export async function deleteTodo(id: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer la tâche");
  return (await res.json()) as Todo;
}

export async function reorderTodos(todoIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/todos/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todoIds }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur de réordonnancement");
}

// ── User lookup ──

export async function lookupUser(email: string): Promise<AuthMeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/auth/lookup?email=${encodeURIComponent(email)}`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur lors de la recherche utilisateur");
  return (await res.json()) as AuthMeResponse;
}

export async function lookupUserByUid(uid: string): Promise<AuthMeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/auth/lookup-uid?uid=${encodeURIComponent(uid)}`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur lors de la recherche utilisateur");
  return (await res.json()) as AuthMeResponse;
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
  const res = await fetch(`${API_BASE_URL}/notifications`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les notifications");
  return (await res.json()) as AppNotification[];
}

export async function getUnreadCount(): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/notifications/count`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) return 0;
  const body = (await res.json()) as { count: number };
  return body.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de marquer la notification comme lue");
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de marquer les notifications comme lues");
}

// ── Teams & Collaborators ──

export interface Collaborator {
  email: string;
  status: "active" | "pending";
}

export interface TeamMember {
  email: string;
  role: "admin" | "member";
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
  const res = await fetch(`${API_BASE_URL}/teams/collaborators`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les collaborateurs");
  return (await res.json()) as Collaborator[];
}

export async function getReceivedInvitations(): Promise<ReceivedInvitation[]> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators/received`, {
    method: "GET",
    credentials: "include",
  });
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
  const res = await fetch(`${API_BASE_URL}/teams`, {
    method: "GET",
    credentials: "include",
  });
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

export async function updateMemberRoleApi(teamId: string, email: string, role: "admin" | "member"): Promise<Team> {
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
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer l'équipe");
}

// ── Projects ──

export type ProjectStatus = "active" | "archived";

export interface ProjectPhase {
  id: string;
  projectId: string;
  name: string;
  color: string;
  order: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  teamId: string | null;
  status: ProjectStatus;
  phases: ProjectPhase[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  teamId?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  teamId?: string | null;
  status?: ProjectStatus;
}

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les projets");
  return (await res.json()) as Project[];
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Projet introuvable");
  return (await res.json()) as Project;
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as Project;
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour du projet");
  return (await res.json()) as Project;
}

export async function deleteProjectApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la suppression du projet");
}

export async function getProjectTodos(projectId: string): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/todos`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les tâches du projet");
  return (await res.json()) as Todo[];
}

// ── Phases ──

export interface CreatePhasePayload {
  name: string;
  color?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdatePhasePayload {
  name?: string;
  color?: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createPhase(projectId: string, payload: CreatePhasePayload): Promise<ProjectPhase> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as ProjectPhase;
}

export async function updatePhaseApi(projectId: string, phaseId: string, payload: UpdatePhasePayload): Promise<ProjectPhase> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour de la phase");
  return (await res.json()) as ProjectPhase;
}

export async function deletePhaseApi(projectId: string, phaseId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la suppression de la phase");
}

// ── Calendar / Scheduling ──

export async function getTaskSlots(todoId: string): Promise<{ slots: SlotProposal[]; duration: number; durationSource: "task" | "settings"; effort: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/slots/${todoId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les créneaux");
  return res.json();
}

export async function bookTaskSlot(todoId: string, start: string, end: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/book/${todoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de réserver le créneau");
  return res.json();
}

export async function clearTaskSlot(todoId: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/slot/${todoId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le créneau");
  return res.json();
}

// ── Calendar Events (Agenda) ──

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "wroket" | "google";
  priority?: string;
  effort?: string;
  deadline?: string | null;
}

export interface CalendarEventsResponse {
  wroketEvents: CalendarEvent[];
  googleEvents: CalendarEvent[];
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({ start, end });
  const res = await fetch(`${API_BASE_URL}/calendar/events?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les événements");
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/auth-url`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur d'authentification Google");
  return res.json();
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/disconnect`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

// ── Webhooks / Integrations ──

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

export async function getWebhooks(): Promise<WebhookConfig[]> {
  const res = await fetch(`${API_BASE_URL}/webhooks`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les webhooks");
  return res.json();
}

export async function saveWebhook(config: Partial<WebhookConfig> & { url: string }): Promise<WebhookConfig> {
  const res = await fetch(`${API_BASE_URL}/webhooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la sauvegarde du webhook");
  return res.json();
}

export async function deleteWebhookApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/webhooks/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le webhook");
}

export async function testWebhookApi(url: string, platform: WebhookPlatform): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/webhooks/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, platform }),
    credentials: "include",
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

// ── Notes ──

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  pinned: boolean;
  folder?: string;
  tags?: string[];
  shared?: boolean;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes");
  return res.json();
}

export async function getSharedNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/shared`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes partagées");
  return res.json();
}

export async function createNoteApi(input: { title?: string; content?: string; id?: string; folder?: string; tags?: string[]; shared?: boolean; teamId?: string }): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de créer la note");
  return res.json();
}

export async function updateNoteApi(id: string, input: { title?: string; content?: string; pinned?: boolean; folder?: string; tags?: string[]; shared?: boolean; teamId?: string }): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/notes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de mettre à jour la note");
  return res.json();
}

export async function deleteNoteApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer la note");
}

export async function syncNotesApi(notes: Array<{ id: string; title: string; content: string; updatedAt: string; pinned?: boolean }>): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

// ── Export CSV / Activity ──

export async function exportTasksCsv(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/todos/export-csv`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wroket-tasks.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function getTaskActivity(todoId: string): Promise<ActivityLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/activity`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

export async function exportNotesMarkdown(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/export`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wroket-notes.md";
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSV Import ──

export interface ImportParsedTask {
  row: number;
  phase: string;
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  startDate: string | null;
  assigneeEmail: string | null;
  assigneeUid: string | null;
  tags: string[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreview {
  projectName: string;
  phases: { name: string; taskCount: number }[];
  tasks: ImportParsedTask[];
  errors: ImportError[];
}

export async function uploadCsvPreview(file: File, projectName: string): Promise<ImportPreview> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectName", projectName);
  const res = await fetch(`${API_BASE_URL}/projects/import/preview`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'analyse du CSV"));
  }
  return res.json();
}

export async function confirmCsvImport(file: File, projectName: string, teamId: string | null): Promise<{ project: Project; taskCount: number }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectName", projectName);
  if (teamId) fd.append("teamId", teamId);
  const res = await fetch(`${API_BASE_URL}/projects/import/confirm`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'import"));
  }
  return res.json();
}
