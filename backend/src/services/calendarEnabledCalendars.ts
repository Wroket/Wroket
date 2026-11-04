import { getGoogleAccounts, getMicrosoftAccounts } from "./authService";

export const MAX_ENABLED_CALENDAR_FETCHES = 25;

export type EnabledExternalCalendar = {
  provider: "google" | "microsoft";
  accountId: string;
  calendarId: string;
};

/**
 * Collect all calendars marked `enabled` across Google + Microsoft accounts
 * (including read-only). Falls back to the primary calendar when a newly
 * connected account has an empty `calendars` list so availability is never blind.
 */
export function collectEnabledExternalCalendars(uid: string): EnabledExternalCalendar[] {
  const out: EnabledExternalCalendar[] = [];

  for (const account of getGoogleAccounts(uid)) {
    if (!account.calendars || account.calendars.length === 0) {
      out.push({ provider: "google", accountId: account.id, calendarId: "primary" });
      continue;
    }
    for (const cal of account.calendars) {
      if (!cal.enabled) continue;
      out.push({ provider: "google", accountId: account.id, calendarId: cal.calendarId });
    }
  }

  for (const account of getMicrosoftAccounts(uid)) {
    // Newly connected MS accounts without a saved calendar list: skip until seed
    // (googleCallback/microsoftCallback seed primary via buildCalendarSeedEntries).
    if (!account.calendars || account.calendars.length === 0) continue;
    for (const cal of account.calendars) {
      if (!cal.enabled) continue;
      if (!cal.calendarId) continue;
      out.push({
        provider: "microsoft",
        accountId: account.id,
        calendarId: cal.calendarId,
      });
    }
  }

  return out.slice(0, MAX_ENABLED_CALENDAR_FETCHES);
}
