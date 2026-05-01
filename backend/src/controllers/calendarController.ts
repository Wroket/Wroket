import { Request, Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { findAvailableSlots } from "../services/calendarService";
import {
  updateTodo,
  listTodos,
  findTodoForUser,
  listAssignedToMe,
  todoToClientJson,
  type RecurrenceFrequency,
  type Todo,
} from "../services/todoService";
import { findPhaseById } from "../services/projectService";
import {
  findUserByUid,
  DEFAULT_WORKING_HOURS,
  getGoogleCalendarTokens,
  getGoogleAccounts,
  addGoogleAccount,
  removeGoogleAccount,
  removeAllGoogleAccounts,
  setGoogleAccountCalendars,
  getGoogleBookingTarget,
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
  createGoogleMeetEvent,
  deleteGoogleCalendarEvent,
  deleteGoogleCalendarEventForTodo,
  patchGoogleCalendarEvent,
} from "../services/googleCalendarService";
import { createOAuthState, consumeOAuthState } from "../utils/oauthState";

/** Advance a Date in-place by the recurrence step, preserving time-of-day. */
function advanceDate(d: Date, freq: RecurrenceFrequency, interval: number): void {
  switch (freq) {
    case "daily":   d.setDate(d.getDate() + interval); break;
    case "weekly":  d.setDate(d.getDate() + 7 * interval); break;
    case "monthly": d.setMonth(d.getMonth() + interval); break;
  }
}

interface WroketEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "wroket";
  priority: string;
  effort: string;
  deadline: string | null;
  recurring?: boolean;
  delegated?: boolean;
}

const MAX_EMITTED = 200;
const MAX_ITERATIONS = 400;

function pushRecurrences(
  out: WroketEvent[],
  t: Todo,
  rangeStart: Date,
  rangeEnd: Date,
  skipDays: boolean,
  workDays: number[],
): void {
  const slot = t.scheduledSlot!;
  const slotStart = new Date(slot.start);
  const durationMs = new Date(slot.end).getTime() - slotStart.getTime();
  const { frequency, interval, endDate } = t.recurrence!;
  const recEnd = endDate ? new Date(endDate) : null;
  const cursor = new Date(slotStart);
  let emitted = 0;

  for (let i = 0; i < MAX_ITERATIONS && emitted < MAX_EMITTED; i++) {
    advanceDate(cursor, frequency, interval);
    if (recEnd && cursor > recEnd) break;
    if (cursor > rangeEnd) break;
    if (skipDays && !workDays.includes(cursor.getDay())) continue;
    if (cursor < rangeStart) continue;

    out.push({
      id: `${t.id}_rec_${cursor.toISOString()}`,
      summary: t.title,
      start: cursor.toISOString(),
      end: new Date(cursor.getTime() + durationMs).toISOString(),
      allDay: false,
      source: "wroket",
      priority: t.priority,
      effort: t.effort,
      deadline: t.deadline,
      recurring: true,
    });
    emitted++;
  }
}

export async function getSlots(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  const user = findUserByUid(uid);
  const workingHours = user?.workingHours ?? DEFAULT_WORKING_HOURS;

  const effortDefaults = user?.effortMinutes ?? { light: 10, medium: 30, heavy: 60 };
  const effort = todo.effort ?? "medium";
  const hasCustomEstimate = todo.estimatedMinutes != null;
  const duration = hasCustomEstimate ? todo.estimatedMinutes! : effortDefaults[effort];
  const durationSource = hasCustomEstimate ? "task" as const : "settings" as const;

  const googleBusySlots: { start: Date; end: Date }[] = [];
  const accounts = getGoogleAccounts(uid);
  if (accounts.length > 0) {
    const now = new Date();
    const searchEnd = new Date(now.getTime() + 31 * 24 * 3600_000);
    const fetches: Promise<{ start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of accounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || fetches.length >= 10) continue;
        fetches.push(listEventsForAccount(uid, account.id, cal.calendarId, now.toISOString(), searchEnd.toISOString()));
      }
    }
    try {
      const results = await Promise.all(fetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          googleBusySlots.push({ start: new Date(ev.start), end: new Date(ev.end) });
        }
      }
    } catch { /* Google Calendar unavailable */ }
  }

  let effectiveStartDate = todo.startDate;
  let effectiveDeadline = todo.deadline;
  if (todo.phaseId) {
    const phase = findPhaseById(todo.phaseId);
    if (phase) {
      if (phase.startDate && (!effectiveStartDate || effectiveStartDate < phase.startDate)) {
        effectiveStartDate = phase.startDate;
      }
      if (phase.endDate && (!effectiveDeadline || effectiveDeadline > phase.endDate)) {
        effectiveDeadline = phase.endDate;
      }
    }
  }

  if (effectiveStartDate && effectiveDeadline && effectiveStartDate > effectiveDeadline) {
    effectiveStartDate = todo.startDate;
    effectiveDeadline = todo.deadline;
  }

  const ctx = {
    priority: todo.priority,
    deadline: effectiveDeadline,
    startDate: effectiveStartDate,
  };
  const slots = findAvailableSlots(uid, duration, workingHours, googleBusySlots, 3, undefined, ctx);
  if (slots.length === 0) {
    console.log(`[getSlots] 0 slots for todo=${todoId} title="${todo.title}" duration=${duration}min ctx=`, JSON.stringify(ctx), `busySlots=${googleBusySlots.length} occupiedTasks=${listTodos(uid).filter(t => t.scheduledSlot).length}`);
  }
  res.status(200).json({ slots, duration, durationSource, effort, suggestedSlot: todo.suggestedSlot ?? null });
}

interface ConflictInfo { id: string; title: string; start: string; end: string }

const MAX_CONFLICT_CALENDAR_FETCHES = 10;

async function findConflicts(uid: string, todoId: string, start: Date, end: Date): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  const checkTodo = (t: Todo) => {
    if (t.id === todoId || t.status !== "active" || !t.scheduledSlot) return;
    const sStart = new Date(t.scheduledSlot.start);
    const sEnd = new Date(t.scheduledSlot.end);
    if (start < sEnd && end > sStart) {
      conflicts.push({ id: t.id, title: t.title, start: t.scheduledSlot.start, end: t.scheduledSlot.end });
    }
  };

  for (const t of listTodos(uid)) checkTodo(t);
  for (const t of listAssignedToMe(uid)) checkTodo(t);

  const accounts = getGoogleAccounts(uid);
  if (accounts.length > 0) {
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();
    const fetches: Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of accounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || fetches.length >= MAX_CONFLICT_CALENDAR_FETCHES) continue;
        fetches.push(listEventsForAccount(uid, account.id, cal.calendarId, timeMin, timeMax));
      }
    }
    try {
      const results = await Promise.all(fetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          if (start < evEnd && end > evStart) {
            conflicts.push({ id: ev.id, title: ev.summary, start: ev.start, end: ev.end });
          }
        }
      }
    } catch { /* Google Calendar unavailable — skip */ }
  }

  return conflicts;
}

export async function bookSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;
  const { start, end, force } = req.body as { start: string; end: string; force?: unknown };

  if (!start || !end) throw new ValidationError("start and end required");
  if (typeof start !== "string" || typeof end !== "string") throw new ValidationError("start and end must be strings");
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new ValidationError("Invalid date format");
  if (startDate >= endDate) throw new ValidationError("start must be before end");

  const MAX_SLOT_DAYS = 7;
  if (endDate.getTime() - startDate.getTime() > MAX_SLOT_DAYS * 24 * 3600_000) {
    throw new ValidationError("Slot duration too long");
  }

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (!force) {
    const conflicts = await findConflicts(uid, todoId, startDate, endDate);
    if (conflicts.length > 0) {
      const safeConflicts = conflicts.slice(0, 10).map((c) => ({
        id: c.id,
        title: c.title.slice(0, 100),
        start: c.start,
        end: c.end,
      }));
      res.status(409).json({ conflict: true, conflicts: safeConflicts });
      return;
    }
  }

  let calendarEventId: string | null = null;
  const tokens = getGoogleCalendarTokens(uid);
  if (tokens) {
    const user = findUserByUid(uid);
    const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;
    const bookingTarget = getGoogleBookingTarget(uid);
    const bookingCalendarId = bookingTarget?.calendarId ?? "primary";
    const existingEventId = todo.scheduledSlot?.calendarEventId ?? null;
    if (existingEventId) {
      const patched = await patchGoogleCalendarEvent(
        uid,
        existingEventId,
        todo.title,
        start,
        end,
        tz,
        undefined,
        bookingCalendarId,
      );
      if (patched) {
        calendarEventId = existingEventId;
      } else {
        await deleteGoogleCalendarEvent(uid, existingEventId, bookingCalendarId);
        calendarEventId = await createGoogleCalendarEvent(uid, todo.title, start, end, tz);
      }
    } else {
      calendarEventId = await createGoogleCalendarEvent(uid, todo.title, start, end, tz);
    }
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: { start, end, calendarEventId, bookedByUid: uid },
  });

  res.status(200).json(todoToClientJson(updated));
}

export async function clearSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteGoogleCalendarEventForTodo(todo);
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: null,
  });
  res.status(200).json(todoToClientJson(updated));
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

  const ownedTodos = listTodos(uid);
  const assignedTodos = listAssignedToMe(uid);
  const seenIds = new Set<string>();
  const wroketEvents: WroketEvent[] = [];

  const userCache = new Map<string, { skipDays: boolean; workDays: number[] }>();
  function getOwnerPrefs(userId: string) {
    let cached = userCache.get(userId);
    if (!cached) {
      const u = findUserByUid(userId);
      cached = {
        skipDays: !!u?.skipNonWorkingDays,
        workDays: (u?.workingHours ?? DEFAULT_WORKING_HOURS).daysOfWeek,
      };
      userCache.set(userId, cached);
    }
    return cached;
  }

  for (const t of ownedTodos) {
    if (t.status !== "active" || !t.scheduledSlot) continue;
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);

    wroketEvents.push({
      id: t.id, summary: t.title,
      start: t.scheduledSlot.start, end: t.scheduledSlot.end,
      allDay: false, source: "wroket",
      priority: t.priority, effort: t.effort, deadline: t.deadline,
    });

    if (t.recurrence) {
      const { skipDays, workDays } = getOwnerPrefs(t.userId);
      pushRecurrences(wroketEvents, t, startDate, endDateParsed, skipDays, workDays);
    }
  }
  for (const t of assignedTodos) {
    if (t.status !== "active" || !t.scheduledSlot) continue;
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);

    wroketEvents.push({
      id: t.id, summary: t.title,
      start: t.scheduledSlot.start, end: t.scheduledSlot.end,
      allDay: false, source: "wroket",
      priority: t.priority, effort: t.effort, deadline: t.deadline,
      delegated: true,
    });

    if (t.recurrence) {
      const { skipDays, workDays } = getOwnerPrefs(t.userId);
      pushRecurrences(wroketEvents, t, startDate, endDateParsed, skipDays, workDays);
    }
  }

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

  const wroketGoogleIds = new Set<string>();
  for (const t of ownedTodos) {
    if (t.scheduledSlot?.calendarEventId) wroketGoogleIds.add(t.scheduledSlot.calendarEventId);
  }
  for (const t of assignedTodos) {
    if (t.scheduledSlot?.calendarEventId) wroketGoogleIds.add(t.scheduledSlot.calendarEventId);
  }
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
    defaultForBooking: savedMap.has(cal.id) ? !!savedMap.get(cal.id)!.defaultForBooking : !!cal.primary,
    canWriteBooking: savedMap.has(cal.id) ? savedMap.get(cal.id)!.canWriteBooking !== false : !!cal.canWriteBooking,
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
    defaultForBooking: !!c.defaultForBooking,
    canWriteBooking: c.canWriteBooking !== false,
    primary: !!c.primary,
  }));

  setGoogleAccountCalendars(uid, accountId, entries);
  res.status(200).json({ message: "OK", calendars: entries });
}

/**
 * POST /calendar/meet/:todoId
 * Creates a Google Calendar event with a Meet conference attached and stores
 * the join URL on the task's scheduledSlot. If the task has no slot yet, a
 * 1-hour window starting now is used as a placeholder; the user can reschedule
 * via the agenda.
 */
export async function createMeet(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  if (!getGoogleCalendarTokens(uid)) {
    throw new ValidationError("Compte Google Calendar non connecté. Connectez-le dans les paramètres.");
  }

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (todo.scheduledSlot?.meetingUrl) {
    // Already has a Meet link — return the current slot without creating a duplicate.
    res.status(200).json(todoToClientJson(todo));
    return;
  }

  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  const body = (req.body ?? {}) as {
    start?: string;
    end?: string;
    attendees?: string[];
    summary?: string;
    description?: string;
  };

  const requestStart = typeof body.start === "string" ? body.start : undefined;
  const requestEnd = typeof body.end === "string" ? body.end : undefined;
  if ((requestStart && !requestEnd) || (!requestStart && requestEnd)) {
    throw new ValidationError("start et end doivent être fournis ensemble");
  }
  if (requestStart && requestEnd) {
    const s = new Date(requestStart);
    const e = new Date(requestEnd);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s >= e) {
      throw new ValidationError("Plage horaire invalide");
    }
  }
  const attendees = Array.isArray(body.attendees)
    ? body.attendees
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0)
        .slice(0, 50)
    : [];
  for (const email of attendees) {
    if (!email.includes("@") || email.length < 5) {
      throw new ValidationError("Un ou plusieurs invités ont un email invalide");
    }
  }
  const summary = typeof body.summary === "string" && body.summary.trim().length > 0
    ? body.summary.trim().slice(0, 200)
    : todo.title;
  const description = typeof body.description === "string" && body.description.trim().length > 0
    ? body.description.trim().slice(0, 5000)
    : undefined;

  // Use existing slot times if present, otherwise default to now + 1 h.
  const existingStart = todo.scheduledSlot?.start;
  const existingEnd = todo.scheduledSlot?.end;
  const now = new Date();
  const slotStart = requestStart ?? existingStart ?? now.toISOString();
  const slotEnd = requestEnd ?? existingEnd ?? new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  // Delete any existing plain calendar event before replacing with Meet one.
  const existingEventId = todo.scheduledSlot?.calendarEventId;
  if (existingEventId) {
    const bookingTarget = getGoogleBookingTarget(uid);
    await deleteGoogleCalendarEvent(uid, existingEventId, bookingTarget?.calendarId ?? "primary").catch(() => null);
  }

  let result: { eventId: string; meetingUrl: string } | null = null;
  try {
    result = await createGoogleMeetEvent(uid, summary, slotStart, slotEnd, tz, description, attendees);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue Google Calendar";
    throw new ValidationError(`Impossible de créer la réunion Google Meet. ${message}`);
  }
  if (!result) {
    throw new ValidationError("Impossible de créer la réunion Google Meet. Vérifiez les permissions d'écriture du calendrier par défaut.");
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: {
      start: slotStart,
      end: slotEnd,
      calendarEventId: result.eventId,
      bookedByUid: uid,
      meetingUrl: result.meetingUrl,
      meetingProvider: "google-meet",
    },
  });

  res.status(200).json(todoToClientJson(updated));
}

/**
 * DELETE /calendar/meet/:todoId
 * Removes the meeting URL from the task slot. Deletes the Google Calendar event
 * if one was associated. The slot itself (start/end) is preserved if it existed
 * independently before the Meet was created.
 */
export async function clearMeet(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteGoogleCalendarEventForTodo(todo).catch(() => null);
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: todo.scheduledSlot
      ? {
          ...todo.scheduledSlot,
          calendarEventId: null,
          meetingUrl: null,
          meetingProvider: null,
        }
      : null,
  });

  res.status(200).json(todoToClientJson(updated));
}
