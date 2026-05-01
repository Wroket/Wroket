import { API_BASE_URL } from "./core";
import type { SlotProposal, SuggestedSlot, GoogleCalendarEntry } from "./core";
import type { Todo } from "./todos";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "wroket" | "google";
  meetingUrl?: string | null;
  priority?: string;
  effort?: string;
  deadline?: string | null;
  recurring?: boolean;
  delegated?: boolean;
  calendarId?: string;
  calendarColor?: string;
  accountEmail?: string;
}

export interface CalendarEventsResponse {
  wroketEvents: CalendarEvent[];
  googleEvents: CalendarEvent[];
}

export async function getTaskSlots(todoId: string): Promise<{
  slots: SlotProposal[];
  duration: number;
  durationSource: "task" | "settings";
  effort: string;
  suggestedSlot: SuggestedSlot | null;
}> {
  const res = await fetch(`${API_BASE_URL}/calendar/slots/${todoId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les créneaux");
  return res.json();
}

export interface SlotConflict {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface BookSlotResult {
  todo?: Todo;
  conflict?: true;
  conflicts?: SlotConflict[];
}

export async function bookTaskSlot(todoId: string, start: string, end: string, force?: boolean): Promise<BookSlotResult> {
  const res = await fetch(`${API_BASE_URL}/calendar/book/${todoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end, force }),
    credentials: "include",
  });
  if (res.status === 409) {
    return res.json() as Promise<BookSlotResult>;
  }
  if (!res.ok) throw new Error("Impossible de réserver le créneau");
  const todo = await res.json() as Todo;
  return { todo };
}

export async function clearTaskSlot(todoId: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/slot/${todoId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer le créneau");
  return res.json();
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({ start, end });
  const res = await fetch(`${API_BASE_URL}/calendar/events?${params.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les événements");
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/auth-url`, { credentials: "include" });
  if (!res.ok) throw new Error("Erreur d'authentification Google");
  return res.json();
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/disconnect`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

export async function getAccountCalendars(accountId: string): Promise<GoogleCalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les calendriers");
  return res.json();
}

export async function saveAccountCalendars(accountId: string, calendars: GoogleCalendarEntry[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ calendars }),
  });
  if (!res.ok) throw new Error("Impossible de sauvegarder");
}

export interface CreateTaskMeetPayload {
  start?: string;
  end?: string;
  attendees?: string[];
  summary?: string;
  description?: string;
}

export async function disconnectGoogleAccount(accountId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/disconnect/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

/**
 * Create a Google Meet conference for the given task.
 * Returns the updated Todo (with meetingUrl set on scheduledSlot).
 */
export async function createTaskMeet(todoId: string, payload?: CreateTaskMeetPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/meet/${encodeURIComponent(todoId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
    credentials: "include",
  });
  if (!res.ok) {
    const msg = await res.json().then((d: { message?: string }) => d.message).catch(() => null);
    throw new Error(msg ?? "Impossible de créer le meeting");
  }
  return res.json() as Promise<Todo>;
}

/**
 * Remove the Google Meet conference from the given task.
 * Returns the updated Todo.
 */
export async function clearTaskMeet(todoId: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/meet/${encodeURIComponent(todoId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le meeting");
  return res.json() as Promise<Todo>;
}
