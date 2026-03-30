import { getGoogleCalendarTokens, setGoogleCalendarTokens, GoogleCalendarTokens } from "./authService";

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
    const body = await res.text();
    throw new Error(`Google token exchange failed: ${body}`);
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
 * Get a valid access token, refreshing if expired.
 */
async function getValidAccessToken(uid: string): Promise<string | null> {
  const tokens = getGoogleCalendarTokens(uid);
  if (!tokens) return null;

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
  setGoogleCalendarTokens(uid, updated);
  return updated.accessToken;
}

/**
 * List Google Calendar events between timeMin and timeMax.
 */
export async function listGoogleCalendarEvents(
  uid: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
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
