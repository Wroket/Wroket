import {
  getMicrosoftAccountTokens,
  updateMicrosoftAccountTokens,
  type GoogleCalendarTokens,
} from "./authService";

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
const MICROSOFT_GRAPH_REDIRECT_URI =
  process.env.MICROSOFT_GRAPH_REDIRECT_URI ?? "http://localhost:3001/calendar/microsoft/callback";

/** Calendar OAuth scopes (separate consent from SSO login). */
const CALENDAR_SCOPES = [
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/Calendars.ReadWrite",
].join(" ");

function authorityHost(): string {
  return `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`;
}

export interface MicrosoftCalendarListItem {
  id: string;
  summary: string;
  backgroundColor: string;
  primary?: boolean;
  canWriteBooking?: boolean;
}

export interface MicrosoftCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "microsoft";
}

export function isMicrosoftCalendarOAuthConfigured(): boolean {
  return Boolean(MICROSOFT_CLIENT_ID.trim() && MICROSOFT_CLIENT_SECRET.trim());
}

export function getMicrosoftCalendarAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID.trim(),
    redirect_uri: MICROSOFT_GRAPH_REDIRECT_URI,
    response_type: "code",
    scope: CALENDAR_SCOPES,
    response_mode: "query",
    state,
    prompt: "consent",
  });
  return `${authorityHost()}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface TokenJson {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCalendarCodeForTokens(code: string): Promise<GoogleCalendarTokens> {
  const tokenRes = await fetch(`${authorityHost()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID.trim(),
      client_secret: MICROSOFT_CLIENT_SECRET.trim(),
      code,
      redirect_uri: MICROSOFT_GRAPH_REDIRECT_URI,
      grant_type: "authorization_code",
    }).toString(),
  });

  const text = await tokenRes.text();
  let json: TokenJson;
  try {
    json = JSON.parse(text) as TokenJson;
  } catch {
    throw new Error("Microsoft calendar token parse failed");
  }
  if (!tokenRes.ok || json.error || !json.access_token) {
    console.error("[microsoft-cal] Token exchange failed:", text.slice(0, 400));
    throw new Error("Microsoft calendar token exchange failed");
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

async function refreshIfNeeded(
  uid: string,
  accountId: string,
  tokens: GoogleCalendarTokens,
): Promise<string | null> {
  if (Date.now() < tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) return null;

  const tokenRes = await fetch(`${authorityHost()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID.trim(),
      client_secret: MICROSOFT_CLIENT_SECRET.trim(),
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const text = await tokenRes.text();
  let json: TokenJson;
  try {
    json = JSON.parse(text) as TokenJson;
  } catch {
    return null;
  }
  if (!tokenRes.ok || !json.access_token) {
    console.error("[microsoft-cal] Refresh failed:", text.slice(0, 300));
    return null;
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const updated: GoogleCalendarTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  updateMicrosoftAccountTokens(uid, accountId, updated);
  return updated.accessToken;
}

export async function getValidAccessTokenForMicrosoftAccount(
  uid: string,
  accountId: string,
): Promise<string | null> {
  const tokens = getMicrosoftAccountTokens(uid, accountId);
  if (!tokens) return null;
  return refreshIfNeeded(uid, accountId, tokens);
}

/** Graph default calendar when user has not saved any selection yet. */
export async function getDefaultMicrosoftCalendarId(uid: string, accountId: string): Promise<string | null> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return null;
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchMicrosoftAccountEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "Outlook";
    const data = (await res.json()) as { mail?: string | null; userPrincipalName?: string };
    const raw = (data.mail && data.mail.includes("@") ? data.mail : data.userPrincipalName) ?? "";
    const email = raw.trim();
    return email || "Outlook";
  } catch {
    return "Outlook";
  }
}

export async function listMicrosoftCalendarListForAccount(
  uid: string,
  accountId: string,
): Promise<MicrosoftCalendarListItem[]> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return [];

  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/calendars", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      value?: Array<{
        id: string;
        name?: string;
        hexColor?: string;
        isDefaultCalendar?: boolean;
        canEdit?: boolean;
      }>;
    };
    return (data.value ?? []).map((c) => {
      let hex = "#0078d4";
      if (c.hexColor && /^#[0-9a-fA-F]{6}$/.test(c.hexColor)) {
        hex = c.hexColor;
      }
      return {
        id: c.id,
        summary: c.name ?? c.id,
        backgroundColor: hex,
        primary: !!c.isDefaultCalendar,
        canWriteBooking: c.canEdit !== false,
      };
    });
  } catch {
    return [];
  }
}

function encodeGraphDate(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z");
}

export async function listMicrosoftEventsForAccount(
  uid: string,
  accountId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<MicrosoftCalendarEvent[]> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return [];

  const start = encodeURIComponent(encodeGraphDate(timeMin));
  const end = encodeURIComponent(encodeGraphDate(timeMax));
  const calSeg = encodeURIComponent(calendarId);

  try {
    const url =
      `https://graph.microsoft.com/v1.0/me/calendars/${calSeg}/calendarView` +
      `?startDateTime=${start}&endDateTime=${end}&$top=250`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      value?: Array<{
        id: string;
        subject?: string;
        isAllDay?: boolean;
        start?: { dateTime?: string; timeZone?: string };
        end?: { dateTime?: string; timeZone?: string };
      }>;
    };

    return (data.value ?? []).map((item) => {
      const allDay = !!item.isAllDay;
      let startStr = item.start?.dateTime ?? "";
      let endStr = item.end?.dateTime ?? "";
      if (allDay && startStr && !startStr.includes("T")) {
        startStr = `${startStr}T00:00:00`;
      }
      if (allDay && endStr && !endStr.includes("T")) {
        endStr = `${endStr}T00:00:00`;
      }
      if (startStr && !startStr.endsWith("Z") && !startStr.includes("+")) {
        startStr = new Date(startStr).toISOString();
      }
      if (endStr && !endStr.endsWith("Z") && !endStr.includes("+")) {
        endStr = new Date(endStr).toISOString();
      }

      return {
        id: item.id,
        summary: item.subject ?? "(Sans titre)",
        start: startStr,
        end: endStr,
        allDay,
        source: "microsoft" as const,
      };
    });
  } catch {
    return [];
  }
}

const WROKET_OUTLOOK_BOOKING_NOTE = "Booked from Wroket";

function graphUtcBody(startIso: string, endIso: string): { start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } } {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const startStr = Number.isNaN(s.getTime()) ? startIso : s.toISOString().replace(/\.\d{3}Z$/, "Z");
  const endStr = Number.isNaN(e.getTime()) ? endIso : e.toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    start: { dateTime: startStr, timeZone: "UTC" },
    end: { dateTime: endStr, timeZone: "UTC" },
  };
}

/**
 * Create an event on a specific Outlook calendar (Microsoft Graph).
 */
export async function createMicrosoftCalendarEvent(
  uid: string,
  accountId: string,
  calendarId: string,
  summary: string,
  start: string,
  end: string,
  description: string = WROKET_OUTLOOK_BOOKING_NOTE,
): Promise<string | null> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return null;

  const calSeg = encodeURIComponent(calendarId);
  const { start: startBody, end: endBody } = graphUtcBody(start, end);

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calSeg}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: summary,
        body: { contentType: "text", content: description },
        start: startBody,
        end: endBody,
      }),
    });
    if (!res.ok) {
      const details = await res.text().catch(() => "");
      console.error("[microsoft-cal] create event failed", res.status, details.slice(0, 400));
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.error("[microsoft-cal] create event exception", err);
    return null;
  }
}

export async function patchMicrosoftCalendarEvent(
  uid: string,
  accountId: string,
  eventId: string,
  summary: string,
  start: string,
  end: string,
  description: string = WROKET_OUTLOOK_BOOKING_NOTE,
  attendees?: string[],
): Promise<boolean> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return false;

  const evSeg = encodeURIComponent(eventId);
  const { start: startBody, end: endBody } = graphUtcBody(start, end);

  try {
    const body: Record<string, unknown> = {
      subject: summary,
      body: { contentType: "text", content: description },
      start: startBody,
      end: endBody,
    };
    if (attendees !== undefined) {
      body.attendees = attendees.map((email) => ({
        emailAddress: { address: email, name: email },
        type: "required",
      }));
    }
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${evSeg}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const details = await res.text().catch(() => "");
      console.error("[microsoft-cal] patch event failed", res.status, details.slice(0, 400));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteMicrosoftCalendarEvent(
  uid: string,
  accountId: string,
  eventId: string,
): Promise<boolean> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return false;

  const evSeg = encodeURIComponent(eventId);

  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${evSeg}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) {
      const details = await res.text().catch(() => "");
      console.error("[microsoft-cal] delete event failed", res.status, details.slice(0, 400));
    }
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function parseTeamsJoinUrlFromEventJson(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const om = o.onlineMeeting;
  if (!om || typeof om !== "object") return null;
  const m = om as Record<string, unknown>;
  const joinUrl = m.joinUrl ?? m.joinWebUrl;
  return typeof joinUrl === "string" && joinUrl.startsWith("http") ? joinUrl : null;
}

async function fetchMicrosoftEventJoinUrl(
  uid: string,
  accountId: string,
  eventId: string,
): Promise<string | null> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) return null;
  const evSeg = encodeURIComponent(eventId);
  const url = `https://graph.microsoft.com/v1.0/me/events/${evSeg}?$select=onlineMeeting`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return parseTeamsJoinUrlFromEventJson(data);
  } catch {
    return null;
  }
}

/** User-facing hint when Graph rejects Teams on calendar. */
export function mapMicrosoftTeamsMeetCreateError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("onlinemeeting") || msg.includes("teams")) {
    return "Microsoft n'a pas pu générer le lien Teams (licence ou stratégie d'organisation).";
  }
  if (msg.includes("forbidden") || msg.includes("\"code\":403") || msg.includes("accessdenied")) {
    return "Permissions Outlook insuffisantes pour créer une réunion Teams sur ce calendrier.";
  }
  if (msg.includes("invalid") && msg.includes("attendee")) {
    return "Un ou plusieurs invités ont été rejetés par Outlook.";
  }
  return "Erreur Microsoft Graph lors de la création de la réunion Teams.";
}

/**
 * Create a calendar event with a Teams conference (same UX as Google Meet on a task slot).
 */
export async function createMicrosoftTeamsCalendarEvent(
  uid: string,
  accountId: string,
  calendarId: string,
  summary: string,
  start: string,
  end: string,
  description: string,
  attendees: string[],
): Promise<{ eventId: string; joinUrl: string }> {
  const accessToken = await getValidAccessTokenForMicrosoftAccount(uid, accountId);
  if (!accessToken) {
    throw new Error("Microsoft calendar token unavailable");
  }

  const calSeg = encodeURIComponent(calendarId);
  const { start: startBody, end: endBody } = graphUtcBody(start, end);

  const attendeesPayload =
    attendees.length > 0
      ? attendees.map((email) => ({
          emailAddress: { address: email, name: email },
          type: "required" as const,
        }))
      : undefined;

  const body: Record<string, unknown> = {
    subject: summary,
    body: { contentType: "text", content: description },
    start: startBody,
    end: endBody,
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };
  if (attendeesPayload) body.attendees = attendeesPayload;

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calSeg}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[microsoft-cal] create Teams event failed", res.status, text.slice(0, 500));
    throw new Error(text.slice(0, 800) || `HTTP ${res.status}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON from Microsoft Graph");
  }

  const eventId = typeof data.id === "string" ? data.id : null;
  if (!eventId) throw new Error("Microsoft Graph did not return an event id");

  let joinUrl = parseTeamsJoinUrlFromEventJson(data);
  if (!joinUrl) {
    joinUrl = await fetchMicrosoftEventJoinUrl(uid, accountId, eventId);
  }
  if (!joinUrl) {
    await deleteMicrosoftCalendarEvent(uid, accountId, eventId).catch(() => null);
    throw new Error("Teams join URL missing after event create");
  }

  return { eventId, joinUrl };
}
