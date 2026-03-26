const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthMeResponse {
  uid: string;
  email: string;
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

export interface Todo {
  id: string;
  userId: string;
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
}

export interface UpdateTodoPayload {
  title?: string;
  priority?: Priority;
  effort?: Effort;
  deadline?: string | null;
  status?: TodoStatus;
}

export async function getTodos(): Promise<Todo[]> {
  const res = await fetch(`${API_BASE_URL}/todos`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de charger les tâches");
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

