const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthMeResponse {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`Erreur serveur (${res.status})`);
  }
}

export async function login(
  payload: LoginPayload
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include"
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (body as any).message
        : "Identifiants invalides";
    throw new Error(String(message));
  }
}

export async function register(
  payload: LoginPayload
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include"
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (body as any).message
        : "Impossible de s'enregistrer";
    throw new Error(String(message));
  }
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

export async function updateProfile(payload: { firstName?: string; lastName?: string }): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Impossible de mettre à jour le profil";
    throw new Error(message);
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

// ── Todos ──

export type Priority = "low" | "medium" | "high";
export type Effort = "light" | "medium" | "heavy";
export type TodoStatus = "active" | "completed" | "cancelled" | "deleted";

export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface Todo {
  id: string;
  userId: string;
  parentId: string | null;
  assignedTo: string | null;
  assignmentStatus: AssignmentStatus | null;
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoPayload {
  title: string;
  priority: Priority;
  effort?: Effort;
  deadline?: string | null;
  parentId?: string | null;
  assignedTo?: string | null;
}

export interface UpdateTodoPayload {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  deadline?: string | null;
  status?: TodoStatus;
  assignedTo?: string | null;
  assignmentStatus?: AssignmentStatus | null;
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

export async function createTodo(payload: CreateTodoPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Impossible de créer la tâche";
    throw new Error(message);
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
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Impossible de modifier la tâche";
    throw new Error(message);
  }
  return (await res.json()) as Todo;
}

export async function deleteTodo(id: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/todos/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer la tâche");
  return (await res.json()) as Todo;
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

export type NotificationType = "task_assigned" | "task_completed" | "task_declined" | "task_accepted" | "team_invite";

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
  await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: "PUT",
    credentials: "include",
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: "PUT",
    credentials: "include",
  });
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

export async function getCollaborators(): Promise<Collaborator[]> {
  const res = await fetch(`${API_BASE_URL}/teams/collaborators`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les collaborateurs");
  return (await res.json()) as Collaborator[];
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
    throw new Error(
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Erreur"
    );
  }
  return (await res.json()) as Collaborator;
}

export async function removeCollaborator(email: string): Promise<void> {
  await fetch(`${API_BASE_URL}/teams/collaborators/${encodeURIComponent(email)}`, {
    method: "DELETE",
    credentials: "include",
  });
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
    throw new Error(
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Erreur"
    );
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
    throw new Error(
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : "Erreur"
    );
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

export async function deleteTeamApi(teamId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "DELETE",
    credentials: "include",
  });
}

