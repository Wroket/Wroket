import { API_BASE_URL, extractApiMessage } from "./core";
import type { SlotProposal, SuggestedSlot, GoogleCalendarEntry } from "./core";
import type { Todo } from "./todos";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "wroket" | "google" | "microsoft";
  meetingUrl?: string | null;
  meetingProvider?: "google-meet" | "microsoft-teams" | null;
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
  microsoftEvents?: CalendarEvent[];
}

async function throwCalendarHttpError(res: Response, fallback: string): Promise<never> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  throw new Error(extractApiMessage(body, fallback));
}

export async function getTaskSlots(todoId: string): Promise<{
  slots: SlotProposal[];
  duration: number;
  durationSource: "task" | "settings";
  effort: string;
  suggestedSlot: SuggestedSlot | null;
}> {
  const res = await fetch(`${API_BASE_URL}/calendar/slots/${todoId}`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de charger les créneaux");
  }
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
  if (!res.ok) {
    let msg = "Impossible de réserver le créneau";
    try {
      const j = (await res.json()) as { message?: string };
      if (typeof j.message === "string" && j.message.trim()) msg = j.message.trim();
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
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
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de charger les événements");
  }
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/auth-url`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(
      res,
      res.status === 403
        ? "Google Calendar est réservé au palier Small teams (pack intégrations)."
        : "Erreur d'authentification Google",
    );
  }
  return res.json();
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/disconnect`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

export async function getAccountCalendars(accountId: string): Promise<GoogleCalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de charger les calendriers");
  }
  return res.json();
}

export async function saveAccountCalendars(accountId: string, calendars: GoogleCalendarEntry[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ calendars }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de sauvegarder");
  }
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

export async function getMicrosoftAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/auth-url`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(
      res,
      res.status === 403
        ? "Outlook est réservé au palier Small teams (pack intégrations)."
        : "Erreur d'authentification Microsoft",
    );
  }
  return res.json();
}

export async function disconnectMicrosoftCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/disconnect`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

export async function getMicrosoftAccountCalendars(accountId: string): Promise<GoogleCalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/accounts/${encodeURIComponent(accountId)}/calendars`, {
    credentials: "include",
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de charger les calendriers");
  }
  return res.json();
}

export async function saveMicrosoftAccountCalendars(accountId: string, calendars: GoogleCalendarEntry[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/accounts/${encodeURIComponent(accountId)}/calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ calendars }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de sauvegarder");
  }
}

export async function disconnectMicrosoftAccount(accountId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/disconnect/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur de déconnexion");
}

/**
 * Create a video conference for the given task (Google Meet or Microsoft Teams),
 * depending on the user's connected calendar and booking preference.
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
    await throwCalendarHttpError(res, "Impossible de créer le meeting");
  }
  return res.json() as Promise<Todo>;
}

export async function updateTaskMeet(todoId: string, payload: CreateTaskMeetPayload): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/meet/${encodeURIComponent(todoId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de modifier le meeting");
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

export interface InAppSlotsPendingCountResponse {
  count: number;
}

export async function getInAppScheduledSlotsPendingCount(): Promise<InAppSlotsPendingCountResponse> {
  const res = await fetch(`${API_BASE_URL}/calendar/in-app-slots/pending-count`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de compter les créneaux");
  }
  return res.json();
}

export interface SyncInAppScheduledSlotsResponse {
  synced: number;
  skippedConflicts: number;
  failed: { todoId: string; message: string }[];
}

export async function syncInAppScheduledSlotsToCalendar(
  body: { skipIfConflict?: boolean } = {},
): Promise<SyncInAppScheduledSlotsResponse> {
  const res = await fetch(`${API_BASE_URL}/calendar/in-app-slots/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de synchroniser les créneaux");
  }
  return res.json();
}

export interface SyncOneInAppScheduledSlotResponse {
  outcome: "synced" | "skipped" | "failed";
  calendarEventId?: string;
  message?: string;
}

export async function syncOneScheduledSlotToCalendar(
  todoId: string,
  body: { skipIfConflict?: boolean } = {},
): Promise<SyncOneInAppScheduledSlotResponse> {
  const res = await fetch(`${API_BASE_URL}/calendar/in-app-slots/${encodeURIComponent(todoId)}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Impossible de synchroniser le créneau");
  }
  return res.json();
}
