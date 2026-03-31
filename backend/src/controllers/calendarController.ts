import { Request, Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { findAvailableSlots } from "../services/calendarService";
import { updateTodo, listTodos } from "../services/todoService";
import {
  findUserByUid,
  DEFAULT_WORKING_HOURS,
  getGoogleCalendarTokens,
  getGoogleAccounts,
  addGoogleAccount,
  removeGoogleAccount,
  removeAllGoogleAccounts,
  setGoogleAccountCalendars,
  type GoogleCalendarEntry,
} from "../services/authService";
import { NotFoundError, ValidationError } from "../utils/errors";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  listEventsForAccount,
  listGoogleCalendarEvents,
  listGoogleCalendarListForAccount,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../services/googleCalendarService";
import { createOAuthState, consumeOAuthState } from "../utils/oauthState";

export async function getSlots(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId;
  const uid = req.user!.uid;

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");

  const user = findUserByUid(uid);
  const workingHours = user?.workingHours ?? DEFAULT_WORKING_HOURS;

  const effortDefaults = user?.effortMinutes ?? { light: 10, medium: 30, heavy: 60 };
  const effort = todo.effort ?? "medium";
  const hasCustomEstimate = todo.estimatedMinutes != null;
  const duration = hasCustomEstimate ? todo.estimatedMinutes! : effortDefaults[effort];
  const durationSource = hasCustomEstimate ? "task" as const : "settings" as const;

  const slots = findAvailableSlots(uid, duration, workingHours, [], 3, undefined, {
    priority: todo.priority,
    deadline: todo.deadline,
    startDate: todo.startDate,
  });
  res.status(200).json({ slots, duration, durationSource, effort });
}

export async function bookSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;
  const { start, end } = req.body as { start: string; end: string };

  if (!start || !end) throw new ValidationError("start and end required");
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new ValidationError("Invalid date format");
  if (startDate >= endDate) throw new ValidationError("start must be before end");

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");

  let calendarEventId: string | null = null;
  const tokens = getGoogleCalendarTokens(uid);
  if (tokens) {
    const user = findUserByUid(uid);
    const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;
    calendarEventId = await createGoogleCalendarEvent(uid, todo.title, start, end, tz);
  }

  const updated = updateTodo(uid, todoId, {
    scheduledSlot: { start, end, calendarEventId },
  });

  res.status(200).json(updated);
}

export async function clearSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteGoogleCalendarEvent(uid, todo.scheduledSlot.calendarEventId);
  }

  const updated = updateTodo(uid, todoId, {
    scheduledSlot: null,
  });
  res.status(200).json(updated);
}

export async function googleAuthUrl(req: AuthenticatedRequest, res: Response) {
  const state = createOAuthState(req.user!.uid);
  const url = getGoogleAuthUrl(state);
  res.status(200).json({ url });
}

export async function googleCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state) {
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
    return;
  }

  const uid = consumeOAuthState(state);
  if (!uid) {
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    addGoogleAccount(uid, email, tokens);
    res.redirect(`${frontendUrl}/agenda/manage?google=connected`);
  } catch (err) {
    console.error("[google-oauth] Error:", err);
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
  }
}

/** Disconnect a specific Google account or all accounts */
export async function disconnectGoogle(req: AuthenticatedRequest, res: Response) {
  const accountId = req.params.accountId as string | undefined;
  if (accountId) {
    removeGoogleAccount(req.user!.uid, accountId);
  } else {
    removeAllGoogleAccounts(req.user!.uid);
  }
  res.status(200).json({ message: "Google Calendar disconnected" });
}

export async function getCalendarEvents(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const start = req.query.start as string;
  const end = req.query.end as string;

  if (!start || !end) throw new ValidationError("start and end query params required");
  const startDate = new Date(start);
  const endDateParsed = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDateParsed.getTime())) throw new ValidationError("Invalid date format");
  if (startDate >= endDateParsed) throw new ValidationError("start must be before end");
  const rangeMs = endDateParsed.getTime() - startDate.getTime();
  if (rangeMs > 90 * 24 * 60 * 60 * 1000) throw new ValidationError("Date range too large (max 90 days)");

  const todos = listTodos(uid);
  const wroketEvents = todos
    .filter((t) => t.scheduledSlot && t.status === "active")
    .map((t) => ({
      id: t.id,
      summary: t.title,
      start: t.scheduledSlot!.start,
      end: t.scheduledSlot!.end,
      allDay: false,
      source: "wroket" as const,
      priority: t.priority,
      effort: t.effort,
      deadline: t.deadline,
    }));

  const accounts = getGoogleAccounts(uid);

  type GEvent = { id: string; summary: string; start: string; end: string; allDay: boolean; source: "google"; calendarId?: string; calendarColor?: string; accountEmail?: string };
  let allGoogleEvents: GEvent[] = [];

  const MAX_CALENDAR_FETCHES = 20;

  if (accounts.length > 0) {
    const fetches: Promise<GEvent[]>[] = [];
    for (const account of accounts) {
      if (fetches.length >= MAX_CALENDAR_FETCHES) break;
      const enabledCals = account.calendars.filter((c) => c.enabled);
      if (enabledCals.length > 0) {
        for (const cal of enabledCals) {
          if (fetches.length >= MAX_CALENDAR_FETCHES) break;
          fetches.push(
            listEventsForAccount(uid, account.id, cal.calendarId, start, end)
              .then((events) => events.map((e) => ({ ...e, calendarId: cal.calendarId, calendarColor: cal.color, accountEmail: account.email })))
              .catch(() => [] as GEvent[]),
          );
        }
      } else {
        fetches.push(
          listEventsForAccount(uid, account.id, "primary", start, end)
            .then((events) => events.map((e) => ({ ...e, accountEmail: account.email })))
            .catch(() => [] as GEvent[]),
        );
      }
    }
    const results = await Promise.all(fetches);
    allGoogleEvents = results.flat();
  }

  const wroketGoogleIds = new Set(
    todos
      .filter((t) => t.scheduledSlot?.calendarEventId)
      .map((t) => t.scheduledSlot!.calendarEventId!),
  );
  const filteredGoogleEvents = allGoogleEvents.filter((e) => !wroketGoogleIds.has(e.id));

  res.status(200).json({ wroketEvents, googleEvents: filteredGoogleEvents });
}

/** List all calendars for a specific Google account */
export async function listCalendars(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const accountId = String(req.params.accountId);

  const accounts = getGoogleAccounts(uid);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new NotFoundError("Compte Google introuvable");

  const available = await listGoogleCalendarListForAccount(uid, accountId);
  const savedMap = new Map(account.calendars.map((c) => [c.calendarId, c]));

  const merged = available.map((cal) => ({
    calendarId: cal.id,
    label: cal.summary,
    color: cal.backgroundColor,
    enabled: savedMap.has(cal.id) ? savedMap.get(cal.id)!.enabled : !!cal.primary,
    primary: cal.primary ?? false,
  }));

  res.status(200).json(merged);
}

/** Save calendar selection for a specific Google account */
export async function saveCalendarSelection(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const accountId = String(req.params.accountId);

  const { calendars } = req.body as { calendars?: GoogleCalendarEntry[] };
  if (!Array.isArray(calendars)) throw new ValidationError("calendars array required");
  if (calendars.length > 50) throw new ValidationError("Trop de calendriers (max 50)");

  const entries: GoogleCalendarEntry[] = calendars.map((c) => ({
    calendarId: String(c.calendarId).substring(0, 200),
    label: String(c.label).substring(0, 100),
    color: String(c.color).substring(0, 20),
    enabled: !!c.enabled,
  }));

  setGoogleAccountCalendars(uid, accountId, entries);
  res.status(200).json({ message: "OK", calendars: entries });
}
