import { API_BASE_URL, parseJsonOrThrow, extractApiMessage } from "./core";

export interface TimeSession {
  id: string;
  todoId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  note: string | null;
  source: "timer" | "manual";
  createdAt: string;
}

export interface TimeSessionsResponse {
  sessions: TimeSession[];
  totalMinutes: number;
  activeTimer: TimeSession | null;
}

export async function getTodoTimeSessions(todoId: string): Promise<TimeSessionsResponse> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/time-sessions`, { credentials: "include" });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de charger le suivi du temps"));
  }
  return (await res.json()) as TimeSessionsResponse;
}

export async function startTodoTimer(todoId: string): Promise<TimeSession> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/time-sessions/start`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as TimeSession;
}

export async function stopTodoTimer(todoId: string): Promise<TimeSession> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/time-sessions/stop`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as TimeSession;
}

export async function addManualTodoTimeSession(
  todoId: string,
  payload: { durationMinutes: number; note?: string | null; startedAt?: string },
): Promise<TimeSession> {
  const res = await fetch(`${API_BASE_URL}/todos/${todoId}/time-sessions/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as TimeSession;
}
