export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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

export interface GoogleCalendarEntry {
  calendarId: string;
  label: string;
  color: string;
  enabled: boolean;
  primary?: boolean;
}

export interface GoogleAccountPublic {
  id: string;
  email: string;
  calendars: GoogleCalendarEntry[];
}

export interface AuthMeResponse {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: { light: number; medium: number; heavy: number };
  googleAccounts?: GoogleAccountPublic[];
  workingHours: WorkingHours;
  googleCalendarConnected: boolean;
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

export async function parseJsonOrThrow(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`Erreur serveur (${res.status})`);
  }
}

export function extractApiMessage(body: unknown, fallback: string): string {
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

export function getBrowserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  catch { return "Europe/Paris"; }
}
