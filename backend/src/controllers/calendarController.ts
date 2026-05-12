import { Request, Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { findAvailableSlots } from "../services/calendarService";
import {
  updateTodo,
  listTodos,
  listAllTodos,
  isArchived,
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
  getGoogleAccounts,
  resolveBookingTarget,
  addGoogleAccount,
  removeGoogleAccount,
  removeAllGoogleAccounts,
  setGoogleAccountCalendars,
  getGoogleBookingTarget,
  getMicrosoftBookingTarget,
  getMicrosoftAccounts,
  addMicrosoftAccount,
  removeMicrosoftAccount,
  removeAllMicrosoftAccounts,
  setMicrosoftAccountCalendars,
  getEntitlementsForUid,
  type GoogleCalendarEntry,
  type ResolvedBookingTarget,
} from "../services/authService";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
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
  patchGoogleCalendarEvent,
  mapGoogleMeetCreateError,
  WROKET_CALENDAR_BOOKING_NOTE,
} from "../services/googleCalendarService";
import {
  exchangeCalendarCodeForTokens,
  fetchMicrosoftAccountEmail,
  getMicrosoftCalendarAuthUrl,
  getDefaultMicrosoftCalendarId,
  listMicrosoftCalendarListForAccount,
  listMicrosoftEventsForAccount,
  isMicrosoftCalendarOAuthConfigured,
  createMicrosoftCalendarEvent,
  createMicrosoftTeamsCalendarEvent,
  patchMicrosoftCalendarEvent,
  deleteMicrosoftCalendarEvent,
  mapMicrosoftTeamsMeetCreateError,
} from "../services/microsoftCalendarService";
import { deleteExternalBookingForTodo } from "../services/calendarBookingCleanup";
import { createOAuthState, consumeOAuthState } from "../utils/oauthState";

function assertCalendarIntegrations(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new ForbiddenError(
      "Google Calendar, Outlook et la réservation sur calendrier externe nécessitent le palier Small teams (pack intégrations) ou le statut early bird (attribué par un administrateur).",
    );
  }
}

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
  meetingUrl?: string | null;
  meetingProvider?: "google-meet" | "microsoft-teams" | null;
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
      meetingUrl: t.scheduledSlot?.meetingUrl ?? null,
      meetingProvider: t.scheduledSlot?.meetingProvider ?? null,
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
  const extCal = getEntitlementsForUid(uid).integrations;
  const accounts = getGoogleAccounts(uid);
  if (extCal && accounts.length > 0) {
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

  const msAccounts = getMicrosoftAccounts(uid);
  if (extCal && msAccounts.length > 0) {
    const now = new Date();
    const searchEnd = new Date(now.getTime() + 31 * 24 * 3600_000);
    const msFetches: Promise<{ start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of msAccounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || msFetches.length >= 10) continue;
        msFetches.push(
          listMicrosoftEventsForAccount(uid, account.id, cal.calendarId, now.toISOString(), searchEnd.toISOString())
            .then((events) => events.map((e) => ({ start: e.start, end: e.end, allDay: e.allDay }))),
        );
      }
    }
    try {
      const results = await Promise.all(msFetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          googleBusySlots.push({ start: new Date(ev.start), end: new Date(ev.end) });
        }
      }
    } catch { /* Outlook unavailable */ }
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
const meetCreationInFlight = new Map<string, Promise<Todo>>();

async function findConflicts(uid: string, todoId: string, start: Date, end: Date): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];
  const extCal = getEntitlementsForUid(uid).integrations;

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
  if (extCal && accounts.length > 0) {
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

  const msAccounts = getMicrosoftAccounts(uid);
  if (extCal && msAccounts.length > 0) {
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();
    const msFetches: Promise<{ id: string; summary: string; start: string; end: string; allDay: boolean }[]>[] = [];
    for (const account of msAccounts) {
      for (const cal of account.calendars) {
        if (!cal.enabled || msFetches.length >= MAX_CONFLICT_CALENDAR_FETCHES) continue;
        msFetches.push(listMicrosoftEventsForAccount(uid, account.id, cal.calendarId, timeMin, timeMax));
      }
    }
    try {
      const results = await Promise.all(msFetches);
      for (const events of results) {
        for (const ev of events) {
          if (ev.allDay) continue;
          const evStart = new Date(ev.start);
          const evEnd = new Date(ev.end);
          if (start < evEnd && end > evStart) {
            conflicts.push({ id: `ms:${ev.id}`, title: ev.summary, start: ev.start, end: ev.end });
          }
        }
      }
    } catch { /* Outlook unavailable */ }
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
  let bookingCalendarId: string | null = null;
  let bookingAccountId: string | null = null;
  let bookingProvider: "google" | "microsoft" | undefined;

  const hasCalendarIntegration =
    getGoogleAccounts(uid).length > 0 || getMicrosoftAccounts(uid).length > 0;
  const bookingTarget = resolveBookingTarget(uid);

  if (bookingTarget && !getEntitlementsForUid(uid).integrations) {
    throw new ForbiddenError(
      "La réservation sur Google Calendar ou Outlook nécessite le palier Small teams (pack intégrations) ou le statut early bird (attribué par un administrateur).",
    );
  }

  if (hasCalendarIntegration && !bookingTarget) {
    throw new ValidationError(
      "Configurez un calendrier par défaut pour la réservation (Mes agendas).",
    );
  }

  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  if (bookingTarget) {
    bookingCalendarId = bookingTarget.calendarId;
    bookingAccountId = bookingTarget.accountId;
    bookingProvider = bookingTarget.provider;

    let existingEventId = todo.scheduledSlot?.calendarEventId ?? null;
    let existingProvider = todo.scheduledSlot?.bookingProvider ?? "google";

    if (existingEventId && existingProvider !== bookingTarget.provider) {
      await deleteExternalBookingForTodo(todo);
      existingEventId = null;
    }

    if (bookingTarget.provider === "google") {
      const googleTarget = { accountId: bookingTarget.accountId, calendarId: bookingTarget.calendarId };
      if (existingEventId && existingProvider === "google") {
        const existingBookingCalendarId = todo.scheduledSlot?.bookingCalendarId ?? bookingCalendarId ?? "primary";
        const existingBookingAccountId = todo.scheduledSlot?.bookingAccountId ?? bookingAccountId;
        const patched = await patchGoogleCalendarEvent(
          uid,
          existingEventId,
          todo.title,
          start,
          end,
          tz,
          undefined,
          existingBookingCalendarId,
          existingBookingAccountId ?? undefined,
        );
        if (patched) {
          calendarEventId = existingEventId;
          bookingCalendarId = existingBookingCalendarId;
          bookingAccountId = existingBookingAccountId;
        } else {
          await deleteGoogleCalendarEvent(
            uid,
            existingEventId,
            existingBookingCalendarId,
            existingBookingAccountId ?? undefined,
          );
          calendarEventId = await createGoogleCalendarEvent(
            uid,
            todo.title,
            start,
            end,
            tz,
            undefined,
            googleTarget,
          );
        }
      } else {
        calendarEventId = await createGoogleCalendarEvent(
          uid,
          todo.title,
          start,
          end,
          tz,
          undefined,
          googleTarget,
        );
      }
      if (!calendarEventId) {
        throw new ValidationError(
          "Impossible de créer l'événement Google Calendar. Vérifiez la connexion et le calendrier par défaut.",
        );
      }
    } else {
      const msAccountId = bookingTarget.accountId;
      let msCalId =
        typeof bookingTarget.calendarId === "string" ? bookingTarget.calendarId.trim() : "";
      if (!msCalId) {
        const resolved = await getDefaultMicrosoftCalendarId(uid, msAccountId);
        if (!resolved) {
          throw new ValidationError(
            "Impossible de déterminer le calendrier Outlook par défaut. Ouvrez Mes agendas, sélectionnez un calendrier, puis réessayez.",
          );
        }
        msCalId = resolved;
      }
      if (existingEventId && existingProvider === "microsoft") {
        const patchAccountId = todo.scheduledSlot?.bookingAccountId ?? msAccountId;
        const patched = await patchMicrosoftCalendarEvent(
          uid,
          patchAccountId,
          existingEventId,
          todo.title,
          start,
          end,
        );
        if (patched) {
          calendarEventId = existingEventId;
          bookingAccountId = patchAccountId;
          bookingCalendarId = todo.scheduledSlot?.bookingCalendarId ?? msCalId;
        } else {
          await deleteMicrosoftCalendarEvent(uid, patchAccountId, existingEventId).catch(() => null);
          calendarEventId = await createMicrosoftCalendarEvent(
            uid,
            msAccountId,
            msCalId,
            todo.title,
            start,
            end,
          );
          bookingAccountId = msAccountId;
          bookingCalendarId = msCalId;
        }
      } else {
        calendarEventId = await createMicrosoftCalendarEvent(
          uid,
          msAccountId,
          msCalId,
          todo.title,
          start,
          end,
        );
      }
      if (!calendarEventId) {
        throw new ValidationError(
          "Impossible de créer l'événement Outlook. Vérifiez la connexion et le calendrier par défaut.",
        );
      }
      bookingAccountId = msAccountId;
      bookingCalendarId = msCalId;
    }
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: {
      start,
      end,
      calendarEventId,
      bookedByUid: uid,
      bookingCalendarId,
      bookingAccountId,
      ...(bookingProvider ? { bookingProvider } : {}),
    },
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
    await deleteExternalBookingForTodo(todo);
  }

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: null,
  });
  res.status(200).json(todoToClientJson(updated));
}

export async function googleAuthUrl(req: AuthenticatedRequest, res: Response) {
  assertCalendarIntegrations(req.user!.uid);
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

  if (!getEntitlementsForUid(uid).integrations) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=calendar_plan_required`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    const account = addGoogleAccount(uid, email, tokens);
    if (account.calendars.length === 0) {
      try {
        const list = await listGoogleCalendarListForAccount(uid, account.id);
        if (list.length > 0) {
          const pick =
            list.find((c) => c.primary && c.canWriteBooking !== false) ??
            list.find((c) => c.canWriteBooking !== false) ??
            list[0];
          const entries: GoogleCalendarEntry[] = list.map((cal) => ({
            calendarId: cal.id,
            label: cal.summary.length > 100 ? cal.summary.slice(0, 100) : cal.summary,
            color: cal.backgroundColor,
            enabled: cal.id === pick.id && cal.canWriteBooking !== false,
            defaultForBooking: cal.id === pick.id && cal.canWriteBooking !== false,
            canWriteBooking: cal.canWriteBooking,
            primary: !!cal.primary,
          }));
          setGoogleAccountCalendars(uid, account.id, entries);
        }
      } catch (seedErr) {
        console.error("[google-cal] post-connect calendar seed failed:", seedErr);
      }
    }
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

export async function microsoftCalendarAuthUrl(req: AuthenticatedRequest, res: Response) {
  if (!isMicrosoftCalendarOAuthConfigured()) {
    res.status(503).json({ message: "Microsoft Calendar OAuth non configuré sur ce serveur" });
    return;
  }
  assertCalendarIntegrations(req.user!.uid);
  const state = createOAuthState(req.user!.uid);
  const url = getMicrosoftCalendarAuthUrl(state);
  res.status(200).json({ url });
}

export async function microsoftCalendarCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (!code || !state) {
    res.redirect(`${frontendUrl}/settings?error=microsoft_cal_auth_failed`);
    return;
  }

  const uid = consumeOAuthState(state);
  if (!uid) {
    res.redirect(`${frontendUrl}/settings?error=microsoft_cal_auth_failed`);
    return;
  }

  if (!getEntitlementsForUid(uid).integrations) {
    res.redirect(`${frontendUrl}/settings?tab=integrations&error=calendar_plan_required`);
    return;
  }

  try {
    const tokens = await exchangeCalendarCodeForTokens(code);
    const email = await fetchMicrosoftAccountEmail(tokens.accessToken);
    const account = addMicrosoftAccount(uid, email, tokens);
    if (account.calendars.length === 0) {
      try {
        const list = await listMicrosoftCalendarListForAccount(uid, account.id);
        if (list.length > 0) {
          const pick =
            list.find((c) => c.primary && c.canWriteBooking !== false) ??
            list.find((c) => c.canWriteBooking !== false) ??
            list[0];
          const entries: GoogleCalendarEntry[] = list.map((cal) => ({
            calendarId: cal.id,
            label: cal.summary.length > 100 ? cal.summary.slice(0, 100) : cal.summary,
            color: cal.backgroundColor,
            enabled: cal.id === pick.id && cal.canWriteBooking !== false,
            defaultForBooking: cal.id === pick.id && cal.canWriteBooking !== false,
            canWriteBooking: cal.canWriteBooking,
            primary: !!cal.primary,
          }));
          setMicrosoftAccountCalendars(uid, account.id, entries);
        }
      } catch (seedErr) {
        console.error("[microsoft-cal] post-connect calendar seed failed:", seedErr);
      }
    }
    res.redirect(`${frontendUrl}/agenda/manage?microsoft=connected`);
  } catch (err) {
    console.error("[microsoft-cal] callback error:", err);
    res.redirect(`${frontendUrl}/settings?error=microsoft_cal_auth_failed`);
  }
}

export async function disconnectMicrosoft(req: AuthenticatedRequest, res: Response) {
  const accountId = req.params.accountId as string | undefined;
  if (accountId) {
    removeMicrosoftAccount(req.user!.uid, accountId);
  } else {
    removeAllMicrosoftAccounts(req.user!.uid);
  }
  res.status(200).json({ message: "Outlook disconnected" });
}

export async function listMicrosoftCalendars(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
  const accountId = String(req.params.accountId);

  const accounts = getMicrosoftAccounts(uid);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new NotFoundError("Compte Microsoft introuvable");

  const available = await listMicrosoftCalendarListForAccount(uid, accountId);
  const savedMap = new Map(account.calendars.map((c) => [c.calendarId, c]));
  const isPriorityAccount = accounts.length > 0 && accounts[0]?.id === accountId;

  const merged = available.map((cal) => ({
    calendarId: cal.id,
    label: cal.summary,
    color: cal.backgroundColor,
    enabled: savedMap.has(cal.id) ? savedMap.get(cal.id)!.enabled : (isPriorityAccount ? !!cal.primary : false),
    defaultForBooking: savedMap.has(cal.id) ? !!savedMap.get(cal.id)!.defaultForBooking : false,
    canWriteBooking: savedMap.has(cal.id) ? savedMap.get(cal.id)!.canWriteBooking !== false : !!cal.canWriteBooking,
    primary: cal.primary ?? false,
  }));

  res.status(200).json(merged);
}

export async function saveMicrosoftCalendarSelection(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
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

  setMicrosoftAccountCalendars(uid, accountId, entries);
  res.status(200).json({ message: "OK", calendars: entries });
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

  const extCal = getEntitlementsForUid(uid).integrations;

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
      meetingUrl: t.scheduledSlot.meetingUrl ?? null,
      meetingProvider: t.scheduledSlot.meetingProvider ?? null,
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
      meetingUrl: t.scheduledSlot.meetingUrl ?? null,
      meetingProvider: t.scheduledSlot.meetingProvider ?? null,
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

  if (extCal && accounts.length > 0) {
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

  type MEvent = { id: string; summary: string; start: string; end: string; allDay: boolean; source: "microsoft"; calendarId?: string; calendarColor?: string; accountEmail?: string };
  let allMicrosoftEvents: MEvent[] = [];

  const msAcc = getMicrosoftAccounts(uid);
  if (extCal && msAcc.length > 0) {
    const msFetches: Promise<MEvent[]>[] = [];
    for (const account of msAcc) {
      if (msFetches.length >= MAX_CALENDAR_FETCHES) break;
      const enabledCals = account.calendars.filter((c) => c.enabled);
      if (enabledCals.length > 0) {
        for (const cal of enabledCals) {
          if (msFetches.length >= MAX_CALENDAR_FETCHES) break;
          msFetches.push(
            listMicrosoftEventsForAccount(uid, account.id, cal.calendarId, start, end)
              .then((events) => events.map((e) => ({
                ...e,
                calendarId: cal.calendarId,
                calendarColor: cal.color,
                accountEmail: account.email,
              }))),
          );
        }
      } else {
        const calId =
          account.calendars[0]?.calendarId ?? await getDefaultMicrosoftCalendarId(uid, account.id);
        if (calId) {
          msFetches.push(
            listMicrosoftEventsForAccount(uid, account.id, calId, start, end)
              .then((events) => events.map((e) => ({
                ...e,
                calendarId: calId,
                calendarColor: account.calendars[0]?.color,
                accountEmail: account.email,
              }))),
          );
        }
      }
    }
    const msResults = await Promise.all(msFetches);
    allMicrosoftEvents = msResults.flat();
  }

  const filteredMicrosoftEvents = allMicrosoftEvents.filter((e) => !wroketGoogleIds.has(e.id));

  res.status(200).json({
    wroketEvents,
    googleEvents: filteredGoogleEvents,
    microsoftEvents: filteredMicrosoftEvents,
  });
}

/** List all calendars for a specific Google account */
export async function listCalendars(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
  const accountId = String(req.params.accountId);

  const accounts = getGoogleAccounts(uid);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new NotFoundError("Compte Google introuvable");

  const available = await listGoogleCalendarListForAccount(uid, accountId);
  const savedMap = new Map(account.calendars.map((c) => [c.calendarId, c]));
  const isPriorityAccount = accounts.length > 0 && accounts[0]?.id === accountId;

  const merged = available.map((cal) => ({
    calendarId: cal.id,
    label: cal.summary,
    color: cal.backgroundColor,
    enabled: savedMap.has(cal.id) ? savedMap.get(cal.id)!.enabled : (isPriorityAccount ? !!cal.primary : false),
    defaultForBooking: savedMap.has(cal.id) ? !!savedMap.get(cal.id)!.defaultForBooking : false,
    canWriteBooking: savedMap.has(cal.id) ? savedMap.get(cal.id)!.canWriteBooking !== false : !!cal.canWriteBooking,
    primary: cal.primary ?? false,
  }));

  res.status(200).json(merged);
}

/** Save calendar selection for a specific Google account */
export async function saveCalendarSelection(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
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
 * Creates a Google Meet or Microsoft Teams conference on the user's default booking calendar
 * (see resolveBookingTarget) and stores the join URL on the task's scheduledSlot.
 * If the task has no slot yet, a 1-hour window starting now is used as a placeholder.
 */
export async function createMeet(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);

  const bookingTarget = resolveBookingTarget(uid);
  if (!bookingTarget) {
    throw new ValidationError(
      "Connectez Google Calendar ou Outlook pour créer une réunion liée à la tâche.",
    );
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
  const lockKey = `${uid}:${todoId}`;

  const currentInFlight = meetCreationInFlight.get(lockKey);
  if (currentInFlight) {
    await currentInFlight.catch(() => null);
    const latest = findTodoForUser(uid, todoId);
    if (latest?.todo.scheduledSlot?.meetingUrl) {
      res.status(200).json(todoToClientJson(latest.todo));
      return;
    }
  }

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

  const runCreation = async (): Promise<Todo> => {
    // Delete any existing plain calendar event before replacing with Meet/Teams one.
    if (todo.scheduledSlot?.calendarEventId) {
      await deleteExternalBookingForTodo(todo).catch(() => null);
    }

    if (bookingTarget.provider === "google") {
      let result: { eventId: string; meetingUrl: string } | null = null;
      try {
        result = await createGoogleMeetEvent(
          uid,
          summary,
          slotStart,
          slotEnd,
          tz,
          description,
          attendees,
          { accountId: bookingTarget.accountId, calendarId: bookingTarget.calendarId },
        );
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Erreur inconnue Google Calendar";
        const mapped = mapGoogleMeetCreateError(raw);
        console.error("[meet_create_controller_error]", JSON.stringify({ uid, todoId, raw }));
        throw new ValidationError(`Impossible de créer la réunion Google Meet. ${mapped}`);
      }
      if (!result) {
        throw new ValidationError(
          "Impossible de créer la réunion Google Meet. Vérifiez les permissions d'écriture du calendrier par défaut.",
        );
      }

      const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
        scheduledSlot: {
          start: slotStart,
          end: slotEnd,
          calendarEventId: result.eventId,
          bookedByUid: uid,
          bookingCalendarId: bookingTarget.calendarId ?? "primary",
          bookingAccountId: bookingTarget.accountId ?? null,
          bookingProvider: "google",
          meetingUrl: result.meetingUrl,
          meetingInvitees: attendees,
          meetingProvider: "google-meet",
        },
      });
      console.info("[meet_create_controller_ok]", JSON.stringify({ uid, todoId, eventId: result.eventId, bookingTarget }));
      return updated;
    }

    const desc = description ?? WROKET_CALENDAR_BOOKING_NOTE;
    let msCalForTeams =
      typeof bookingTarget.calendarId === "string" ? bookingTarget.calendarId.trim() : "";
    if (!msCalForTeams) {
      const resolved = await getDefaultMicrosoftCalendarId(uid, bookingTarget.accountId);
      if (!resolved) {
        throw new ValidationError(
          "Impossible de déterminer le calendrier Outlook par défaut pour la réunion.",
        );
      }
      msCalForTeams = resolved;
    }
    let teamsResult: { eventId: string; joinUrl: string };
    try {
      teamsResult = await createMicrosoftTeamsCalendarEvent(
        uid,
        bookingTarget.accountId,
        msCalForTeams,
        summary,
        slotStart,
        slotEnd,
        desc,
        attendees,
      );
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erreur inconnue Microsoft Graph";
      const mapped = mapMicrosoftTeamsMeetCreateError(raw);
      console.error("[teams_meet_create_controller_error]", JSON.stringify({ uid, todoId, raw }));
      throw new ValidationError(`Impossible de créer la réunion Microsoft Teams. ${mapped}`);
    }

    const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
      scheduledSlot: {
        start: slotStart,
        end: slotEnd,
        calendarEventId: teamsResult.eventId,
        bookedByUid: uid,
        bookingCalendarId: msCalForTeams,
        bookingAccountId: bookingTarget.accountId,
        bookingProvider: "microsoft",
        meetingUrl: teamsResult.joinUrl,
        meetingInvitees: attendees,
        meetingProvider: "microsoft-teams",
      },
    });
    console.info("[teams_meet_create_controller_ok]", JSON.stringify({ uid, todoId, eventId: teamsResult.eventId, bookingTarget }));
    return updated;
  };

  const op = runCreation();
  meetCreationInFlight.set(lockKey, op);
  try {
    const updated = await op;
    res.status(200).json(todoToClientJson(updated));
  } finally {
    meetCreationInFlight.delete(lockKey);
  }
}

/**
 * PATCH /calendar/meet/:todoId
 * Updates an existing Google Meet or Microsoft Teams event linked to a task.
 */
export async function updateMeet(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;
  if (!todo.scheduledSlot?.calendarEventId || !todo.scheduledSlot?.meetingUrl) {
    throw new ValidationError("Aucune réunion existante à modifier.");
  }

  const isMicrosoftTeams =
    todo.scheduledSlot.meetingProvider === "microsoft-teams" ||
    (todo.scheduledSlot.bookingProvider === "microsoft" && !todo.scheduledSlot.meetingProvider);

  const body = (req.body ?? {}) as {
    start?: string;
    end?: string;
    attendees?: string[];
    summary?: string;
    description?: string;
  };
  const requestStart = typeof body.start === "string" ? body.start : todo.scheduledSlot.start;
  const requestEnd = typeof body.end === "string" ? body.end : todo.scheduledSlot.end;
  if (!requestStart || !requestEnd) throw new ValidationError("Plage horaire invalide");
  const s = new Date(requestStart);
  const e = new Date(requestEnd);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s >= e) {
    throw new ValidationError("Plage horaire invalide");
  }
  const attendees = Array.isArray(body.attendees)
    ? body.attendees
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0)
        .slice(0, 50)
    : (todo.scheduledSlot.meetingInvitees ?? []);
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
    : WROKET_CALENDAR_BOOKING_NOTE;
  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  if (isMicrosoftTeams) {
    const bookingAccountId =
      todo.scheduledSlot.bookingAccountId ?? getMicrosoftBookingTarget(uid)?.accountId;
    if (!bookingAccountId) {
      throw new ValidationError("Compte Outlook introuvable pour mettre à jour la réunion Teams.");
    }
    const ok = await patchMicrosoftCalendarEvent(
      uid,
      bookingAccountId,
      todo.scheduledSlot.calendarEventId,
      summary,
      requestStart,
      requestEnd,
      description,
      attendees,
    );
    if (!ok) throw new ValidationError("Impossible de modifier la réunion Microsoft Teams.");

    const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
      scheduledSlot: {
        ...todo.scheduledSlot,
        start: requestStart,
        end: requestEnd,
        meetingInvitees: attendees,
        meetingProvider: "microsoft-teams",
        bookingProvider: "microsoft",
      },
    });
    res.status(200).json(todoToClientJson(updated));
    return;
  }

  const bookingCalendarId = todo.scheduledSlot.bookingCalendarId ?? getGoogleBookingTarget(uid)?.calendarId ?? "primary";
  const bookingAccountId = todo.scheduledSlot.bookingAccountId ?? getGoogleBookingTarget(uid)?.accountId;
  const ok = await patchGoogleCalendarEvent(
    uid,
    todo.scheduledSlot.calendarEventId,
    summary,
    requestStart,
    requestEnd,
    tz,
    description,
    bookingCalendarId,
    bookingAccountId ?? undefined,
    attendees,
  );
  if (!ok) throw new ValidationError("Impossible de modifier la réunion Google Meet.");

  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: {
      ...todo.scheduledSlot,
      start: requestStart,
      end: requestEnd,
      meetingInvitees: attendees,
    },
  });
  res.status(200).json(todoToClientJson(updated));
}

/**
 * DELETE /calendar/meet/:todoId
 * Removes the meeting URL from the task slot and deletes the linked calendar event
 * (Google or Outlook). The slot times are preserved when they already existed.
 */
export async function clearMeet(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const found = findTodoForUser(uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  const { todo } = found;

  if (todo.scheduledSlot?.calendarEventId) {
    await deleteExternalBookingForTodo(todo).catch(() => null);
  }

  const slot = todo.scheduledSlot;
  const updated = await updateTodo(uid, req.user!.email ?? "", todoId, {
    scheduledSlot: slot
      ? (() => {
          const { bookingProvider: _bp, ...rest } = slot;
          void _bp;
          return {
            ...rest,
            calendarEventId: null,
            bookingCalendarId: null,
            bookingAccountId: null,
            meetingUrl: null,
            meetingInvitees: null,
            meetingProvider: null,
          };
        })()
      : null,
  });

  res.status(200).json(todoToClientJson(updated));
}

const MAX_IN_APP_SLOT_SYNC = 100;

function isInAppOnlyScheduledSlot(todo: Todo): boolean {
  const s = todo.scheduledSlot;
  if (!s?.start || !s.end) return false;
  if (s.calendarEventId) return false;
  if (todo.status !== "active" || isArchived(todo)) return false;
  return true;
}

type InAppPushResult =
  | { outcome: "synced"; calendarEventId: string }
  | { outcome: "skipped"; message?: string }
  | { outcome: "failed"; message: string };

async function pushScheduledSlotToCalendar(
  uid: string,
  email: string,
  todo: Todo,
  bookingTarget: ResolvedBookingTarget,
  options: { skipIfConflict: boolean; tz: string },
): Promise<InAppPushResult> {
  const slot = todo.scheduledSlot!;
  const start = slot.start;
  const end = slot.end;
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (options.skipIfConflict) {
      const conflicts = await findConflicts(uid, todo.id, startDate, endDate);
      if (conflicts.length > 0) {
        console.warn("[in-app-sync] todoId=%s skipped (conflict)", todo.id);
        return { outcome: "skipped", message: "Chevauchement avec l'agenda ou une autre tâche." };
      }
    }

    let calendarEventId: string | null = null;
    let bookingCalendarId: string | null = bookingTarget.calendarId;
    let bookingAccountId: string | null = bookingTarget.accountId;
    const bookingProvider = bookingTarget.provider;

    if (bookingTarget.provider === "google") {
      const googleTarget = { accountId: bookingTarget.accountId, calendarId: bookingTarget.calendarId };
      calendarEventId = await createGoogleCalendarEvent(
        uid,
        todo.title,
        start,
        end,
        options.tz,
        undefined,
        googleTarget,
      );
      if (!calendarEventId) {
        const msg = "Google Calendar: impossible de créer l'événement";
        console.warn("[in-app-sync] todoId=%s failed: %s", todo.id, msg);
        return { outcome: "failed", message: msg };
      }
    } else {
      let msCalId = typeof bookingTarget.calendarId === "string" ? bookingTarget.calendarId.trim() : "";
      if (!msCalId) {
        const resolved = await getDefaultMicrosoftCalendarId(uid, bookingTarget.accountId);
        if (!resolved) {
          const msg = "Outlook: calendrier par défaut introuvable";
          console.warn("[in-app-sync] todoId=%s failed: %s", todo.id, msg);
          return { outcome: "failed", message: msg };
        }
        msCalId = resolved;
      }
      calendarEventId = await createMicrosoftCalendarEvent(
        uid,
        bookingTarget.accountId,
        msCalId,
        todo.title,
        start,
        end,
      );
      bookingCalendarId = msCalId;
      if (!calendarEventId) {
        const msg = "Outlook: impossible de créer l'événement";
        console.warn("[in-app-sync] todoId=%s failed: %s", todo.id, msg);
        return { outcome: "failed", message: msg };
      }
    }

    await updateTodo(uid, email, todo.id, {
      scheduledSlot: {
        ...slot,
        start,
        end,
        calendarEventId,
        bookedByUid: uid,
        bookingCalendarId,
        bookingAccountId,
        bookingProvider,
      },
    });
    return { outcome: "synced", calendarEventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    console.warn("[in-app-sync] todoId=%s failed: %s", todo.id, msg);
    return { outcome: "failed", message: msg };
  }
}

/**
 * GET /calendar/in-app-slots/pending-count
 * How many owned tasks have a Wroket-only scheduled slot (no external calendar event yet).
 */
export async function getInAppScheduledSlotsCount(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  assertCalendarIntegrations(uid);
  const count = listAllTodos(uid).filter(isInAppOnlyScheduledSlot).length;
  res.status(200).json({ count });
}

/**
 * POST /calendar/in-app-slots/:todoId/sync
 * Push a single in-app slot to the user's default external calendar.
 * Body: { skipIfConflict?: boolean } (default false: deliberate single-task push).
 */
export async function syncSingleInAppScheduledSlot(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  assertCalendarIntegrations(uid);
  const todoId = (req.params.todoId as string | undefined)?.trim() ?? "";
  if (!todoId) {
    throw new ValidationError("Identifiant de tâche requis.");
  }

  const found = findTodoForUser(uid, todoId);
  if (!found?.isOwner) {
    throw new NotFoundError("Tâche introuvable.");
  }

  if (!isInAppOnlyScheduledSlot(found.todo)) {
    throw new ValidationError(
      "Cette tâche n'a pas de créneau Wroket à synchroniser (déjà liée à un agenda externe, ou tâche inactive / archivée).",
    );
  }

  const bookingTarget = resolveBookingTarget(uid);
  if (!bookingTarget) {
    throw new ValidationError(
      "Configurez un calendrier par défaut pour la réservation (Mes agendas).",
    );
  }

  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;
  const skipIfConflict = (req.body as { skipIfConflict?: boolean } | null)?.skipIfConflict === true;

  const result = await pushScheduledSlotToCalendar(uid, email, found.todo, bookingTarget, { skipIfConflict, tz });

  if (result.outcome === "synced") {
    res.status(200).json({
      outcome: "synced" as const,
      calendarEventId: result.calendarEventId,
    });
    return;
  }
  if (result.outcome === "skipped") {
    res.status(200).json({
      outcome: "skipped" as const,
      message: result.message,
    });
    return;
  }
  res.status(200).json({
    outcome: "failed" as const,
    message: result.message,
  });
}

/**
 * POST /calendar/in-app-slots/sync
 * Creates external calendar events for in-app slots and links calendarEventId on each todo.
 * Body: { skipIfConflict?: boolean } (default true: skip slots that overlap busy calendar or other tasks).
 */
export async function syncInAppScheduledSlots(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  assertCalendarIntegrations(uid);
  const bookingTarget = resolveBookingTarget(uid);
  if (!bookingTarget) {
    throw new ValidationError(
      "Configurez un calendrier par défaut pour la réservation (Mes agendas).",
    );
  }
  const skipIfConflict = (req.body as { skipIfConflict?: boolean }).skipIfConflict !== false;

  const user = findUserByUid(uid);
  const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;

  const candidates = listAllTodos(uid).filter(isInAppOnlyScheduledSlot).slice(0, MAX_IN_APP_SLOT_SYNC);

  let synced = 0;
  let skippedConflicts = 0;
  const failed: { todoId: string; message: string }[] = [];

  for (const todo of candidates) {
    const result = await pushScheduledSlotToCalendar(uid, email, todo, bookingTarget, { skipIfConflict, tz });
    if (result.outcome === "synced") {
      synced++;
    } else if (result.outcome === "skipped") {
      skippedConflicts++;
    } else {
      failed.push({ todoId: todo.id, message: result.message });
    }
  }

  res.status(200).json({ synced, skippedConflicts, failed });
}
