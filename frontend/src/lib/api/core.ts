export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

/** Default options for authenticated API calls (avoid stale JSON from HTTP caches). */
export const apiFetchDefaults: Pick<RequestInit, "credentials" | "cache"> = {
  credentials: "include",
  cache: "no-store",
};

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
  bookingCalendarId?: string | null;
  bookingAccountId?: string | null;
  meetingUrl?: string | null;
  meetingInvitees?: string[] | null;
  meetingProvider?: "google-meet" | null;
}

export interface SuggestedSlot {
  start: string;
  end: string;
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
  defaultForBooking?: boolean;
  canWriteBooking?: boolean;
}

export interface GoogleAccountPublic {
  id: string;
  email: string;
  calendars: GoogleCalendarEntry[];
}

export type NotificationDeliveryMode = "none" | "email" | "slack" | "teams" | "google_chat";
export type NotificationOutboundFrequency = "immediate" | "hourly_digest" | "daily_digest";

export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "note_mention"
  | "task_cancelled"
  | "task_declined"
  | "task_accepted"
  | "team_invite"
  | "deadline_approaching"
  | "deadline_today"
  | "comment_mention"
  | "project_deleted";

export interface AuthMeResponse {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  effortMinutes: { light: number; medium: number; heavy: number };
  googleAccounts?: GoogleAccountPublic[];
  workingHours: WorkingHours;
  skipNonWorkingDays: boolean;
  googleCalendarConnected: boolean;
  /** True when TOTP 2FA is enabled */
  twoFactorEnabled?: boolean;
  /** When true, disabling 2FA requires the account password (email/password users). SSO-only accounts use TOTP only. */
  twoFactorDisableRequiresPassword?: boolean;
  /** Primary 2FA is email OTP (no authenticator) */
  emailOtp2faEnabled?: boolean;
  /** When true, TOTP users can request an email code at login if they lose their phone */
  totpEmailFallbackEnabled?: boolean;
  /** Copies of in-app notifications (Paramètres → Intégrations) */
  notificationDeliveryMode?: NotificationDeliveryMode;
  notificationDeliveryWebhookUrl?: string | null;
  /** Notification types suppressed entirely (neither in-app nor outbound). */
  notificationTypesDisabledInApp?: NotificationType[];
  /** Notification types suppressed from outbound only (in-app still shown). */
  notificationTypesDisabledOutbound?: NotificationType[];
  /** How often outbound notifications are flushed. Default: "immediate". */
  notificationOutboundFrequency?: NotificationOutboundFrequency;
  /** Local hour (0-23) at which the daily digest is sent. */
  notificationDigestHour?: number;
  /** Days before archived tasks are permanently removed; 0 = never. Default 30. */
  archivedTaskRetentionDays?: number;
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
  if (typeof body === "object" && body !== null) {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return fallback;
}

export function getBrowserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  catch { return "Europe/Paris"; }
}
