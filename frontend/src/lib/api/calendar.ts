import { parseApiErrorResponse } from "@/lib/apiErrors";

import { API_BASE_URL } from "./core";
import type {
  SlotProposal,
  SuggestedSlot,
  GoogleCalendarEntry,
  BookableCalendarOption,
  PreferredBookingTarget,
} from "./core";
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

async function throwCalendarHttpError(res: Response): Promise<never> {
  throw await parseApiErrorResponse(res, "errors.fallback.generic");
}

export type TodayAvailability =
  | "available"
  | "not_working_day"
  | "outside_hours"
  | "no_remaining_fit"
  | "busy"
  | "before_start_date";

export async function getTaskSlots(todoId: string): Promise<{
  slots: SlotProposal[];
  duration: number;
  durationSource: "task" | "settings";
  effort: string;
  suggestedSlot: SuggestedSlot | null;
  todayAvailability?: TodayAvailability;
  effectiveStartDate?: string | null;
  bookableCalendars?: BookableCalendarOption[];
  resolvedTarget?: PreferredBookingTarget | null;
}> {
  const res = await fetch(`${API_BASE_URL}/calendar/slots/${todoId}`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
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
  code?: string;
  requestId?: string;
  conflicts?: SlotConflict[];
}

export interface DayReorderMove {
  todoId: string;
  title: string;
  from: { start: string; end: string };
  to: { start: string; end: string } | null;
}

export interface DayReorderPlan {
  date: string;
  triggers: { id: string; title: string; start: string; end: string }[];
  moves: DayReorderMove[];
  signature: string;
}

const DAY_REORDER_IGNORE_KEY = "wroket.dayReorder.ignore";

export function dayReorderIgnored(signature: string): boolean {
  try {
    return localStorage.getItem(DAY_REORDER_IGNORE_KEY) === signature;
  } catch {
    return false;
  }
}

export function ignoreDayReorder(signature: string): void {
  try {
    localStorage.setItem(DAY_REORDER_IGNORE_KEY, signature);
  } catch {
    /* private mode */
  }
}

/** Today's proposal. Null when the call fails. An empty move list means nothing to show. */
export async function getDayReorder(): Promise<DayReorderPlan | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/calendar/day-reorder`, { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as DayReorderPlan;
  } catch {
    return null;
  }
}

export async function applyDayReorder(signature: string): Promise<
  | { stale: true; plan: DayReorderPlan }
  | { stale: false; applied: { todoId: string; title: string }[]; failed: { todoId: string; title: string; message: string }[] }
> {
  const res = await fetch(`${API_BASE_URL}/calendar/day-reorder/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ signature }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as { plan?: DayReorderPlan };
    if (body.plan) return { stale: true, plan: body.plan };
  }
  if (!res.ok) await throwCalendarHttpError(res);
  const body = (await res.json()) as {
    applied?: { todoId: string; title: string }[];
    failed?: { todoId: string; title: string; message: string }[];
  };
  return { stale: false, applied: body.applied ?? [], failed: body.failed ?? [] };
}

export async function bookTaskSlot(
  todoId: string,
  start: string,
  end: string,
  force?: boolean,
  target?: PreferredBookingTarget | null,
): Promise<BookSlotResult> {
  const res = await fetch(`${API_BASE_URL}/calendar/book/${todoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end, force, ...(target ? { target } : {}) }),
    credentials: "include",
  });
  if (res.status === 409) {
    return res.json() as Promise<BookSlotResult>;
  }
  if (!res.ok) {
    throw await parseApiErrorResponse(res, "errors.fallback.generic");
  }
  const todo = await res.json() as Todo;
  return { todo };
}

export async function clearTaskSlot(todoId: string): Promise<Todo> {
  const res = await fetch(`${API_BASE_URL}/calendar/slot/${todoId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json();
}

export async function getCalendarEvents(start: string, end: string): Promise<CalendarEventsResponse> {
  const params = new URLSearchParams({ start, end });
  const res = await fetch(`${API_BASE_URL}/calendar/events?${params.toString()}`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json();
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/auth-url`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json();
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/disconnect`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
}

export async function getAccountCalendars(accountId: string): Promise<GoogleCalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json();
}

export async function setPriorityCalendarAccount(
  provider: "google" | "microsoft",
  accountId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/accounts/priority`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ provider, accountId }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
}

export async function saveAccountCalendars(accountId: string, calendars: GoogleCalendarEntry[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/google/accounts/${encodeURIComponent(accountId)}/calendars`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ calendars }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res);
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
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
}

export async function getMicrosoftAuthUrl(): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/auth-url`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json();
}

export async function disconnectMicrosoftCalendar(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/disconnect`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
}

export async function getMicrosoftAccountCalendars(accountId: string): Promise<GoogleCalendarEntry[]> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/accounts/${encodeURIComponent(accountId)}/calendars`, {
    credentials: "include",
  });
  if (!res.ok) {
    await throwCalendarHttpError(res);
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
    await throwCalendarHttpError(res);
  }
}

export async function disconnectMicrosoftAccount(accountId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/calendar/microsoft/disconnect/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
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
    await throwCalendarHttpError(res);
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
    await throwCalendarHttpError(res);
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
  if (!res.ok) {
    await throwCalendarHttpError(res);
  }
  return res.json() as Promise<Todo>;
}

export interface InAppSlotsPendingCountResponse {
  count: number;
}

export async function getInAppScheduledSlotsPendingCount(): Promise<InAppSlotsPendingCountResponse> {
  const res = await fetch(`${API_BASE_URL}/calendar/in-app-slots/pending-count`, { credentials: "include" });
  if (!res.ok) {
    await throwCalendarHttpError(res);
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
    await throwCalendarHttpError(res);
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
    await throwCalendarHttpError(res);
  }
  return res.json();
}
