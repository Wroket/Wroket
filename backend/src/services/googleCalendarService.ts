import {
  getGoogleCalendarTokens,
  setGoogleCalendarTokens,
  getGoogleAccountTokens,
  updateGoogleAccountTokens,
  type GoogleCalendarTokens,
} from "./authService";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/calendar/google/callback";
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO
  end: string;   // ISO
  allDay: boolean;
  source: "google";
}

/**
 * Generate the Google OAuth2 consent URL.
 */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleCalendarTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) {
    throw new Error("Google token exchange failed");
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Get a valid access token, refreshing if expired (legacy: first account).
 */
async function getValidAccessToken(uid: string): Promise<string | null> {
  const tokens = getGoogleCalendarTokens(uid);
  if (!tokens) return null;
  return refreshIfNeeded(tokens, (updated) => setGoogleCalendarTokens(uid, updated));
}

/**
 * Get a valid access token for a specific account, refreshing if expired.
 */
export async function getValidAccessTokenForAccount(uid: string, accountId: string): Promise<string | null> {
  const tokens = getGoogleAccountTokens(uid, accountId);
  if (!tokens) return null;
  return refreshIfNeeded(tokens, (updated) => updateGoogleAccountTokens(uid, accountId, updated));
}

async function refreshIfNeeded(
  tokens: GoogleCalendarTokens,
  onRefresh: (updated: GoogleCalendarTokens) => void,
): Promise<string | null> {
  if (Date.now() < tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) return null;

  const data = await res.json() as { access_token: string; expires_in: number };
  const updated: GoogleCalendarTokens = {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  onRefresh(updated);
  return updated.accessToken;
}

/**
 * Fetch the email of a Google account using its access token (via calendarList primary).
 */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return "Google Calendar";
    const data = await res.json() as {
      items?: Array<{ id: string; primary?: boolean }>;
    };
    const primary = (data.items ?? []).find((c) => c.primary);
    return primary?.id ?? "Google Calendar";
  } catch {
    return "Google Calendar";
  }
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  backgroundColor: string;
  primary?: boolean;
}

/**
 * List all calendars available on a specific Google account.
 */
export async function listGoogleCalendarListForAccount(uid: string, accountId: string): Promise<GoogleCalendarListItem[]> {
  const accessToken = await getValidAccessTokenForAccount(uid, accountId);
  if (!accessToken) return [];
  return fetchCalendarList(accessToken);
}

/**
 * List all calendars available on the user's Google account (legacy: first account).
 */
export async function listGoogleCalendarList(uid: string): Promise<GoogleCalendarListItem[]> {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) return [];
  return fetchCalendarList(accessToken);
}

async function fetchCalendarList(accessToken: string): Promise<GoogleCalendarListItem[]> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{
        id: string;
        summary?: string;
        backgroundColor?: string;
        primary?: boolean;
      }>;
    };
    return (data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      backgroundColor: c.backgroundColor ?? "#4285f4",
      primary: c.primary,
    }));
  } catch {
    return [];
  }
}

/**
 * List events for a specific account + calendar.
 */
export async function listEventsForAccount(
  uid: string,
  accountId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessTokenForAccount(uid, accountId);
  if (!accessToken) return [];
  return fetchEvents(accessToken, calendarId, timeMin, timeMax);
}

/**
 * List Google Calendar events between timeMin and timeMax for a specific calendar (legacy).
 */
export async function listGoogleCalendarEvents(
  uid: string,
  timeMin: string,
  timeMax: string,
  calendarId = "primary",
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) return [];
  return fetchEvents(accessToken, calendarId, timeMin, timeMax);
}

async function fetchEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary ?? "(Sans titre)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      allDay: !item.start?.dateTime,
      source: "google" as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Create an event on Google Calendar.
 */
export async function createGoogleCalendarEvent(
  uid: string,
  summary: string,
  start: string,
  end: string,
  timezone?: string,
): Promise<string | null> {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) return null;

  const tz = timezone || "UTC";

  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          start: { dateTime: start, timeZone: tz },
          end: { dateTime: end, timeZone: tz },
        }),
      },
    );

    if (!res.ok) return null;
    const data = await res.json() as { id: string };
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Delete an event from Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  uid: string,
  eventId: string,
): Promise<boolean> {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) return false;

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
