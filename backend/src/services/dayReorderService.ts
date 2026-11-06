/**
 * Load today's booked tasks and external appointments, then propose a reorder.
 * Apply writes only the slots the caller just saw. Nothing moves on read.
 */
import { findUserByUid, DEFAULT_WORKING_HOURS, type WorkingHours } from "./authService";
import { collectEnabledExternalCalendars } from "./calendarEnabledCalendars";
import { getPartsInTz, tzLocalToUtc } from "./calendarService";
import { bookTodoSlot } from "./calendarSlotService";
import { listEventsForAccount } from "./googleCalendarService";
import { listMicrosoftEventsForAccount } from "./microsoftCalendarService";
import { getEffectiveEntitlementsForUid } from "./teamService";
import { findTodoForUser, listTodos } from "./todoService";
import {
  planDayReorder,
  type DayReorderEvent,
  type DayReorderPlan,
  type DayReorderTask,
} from "./dayReorder";
import { logger } from "../utils/logger";

export interface DayReorderApplyResult {
  stale: boolean;
  plan: DayReorderPlan;
  applied: { todoId: string; title: string; start: string; end: string }[];
  failed: { todoId: string; title: string; message: string }[];
}

function parseDeadlineCap(value: string | null, tz: string): Date | null {
  if (!value) return null;
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    return tzLocalToUtc(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1, 0, 0, tz);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNotBefore(value: string | null, tz: string): Date | null {
  if (!value) return null;
  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) return tzLocalToUtc(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 0, 0, tz);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function externalEvents(uid: string, email: string, timeMin: string, timeMax: string): Promise<DayReorderEvent[]> {
  if (!getEffectiveEntitlementsForUid(uid, email).integrations) return [];
  const enabled = collectEnabledExternalCalendars(uid);
  const googleFetches = enabled
    .filter((calendar) => calendar.provider === "google")
    .map((calendar) => listEventsForAccount(uid, calendar.accountId, calendar.calendarId, timeMin, timeMax).catch(() => []));
  const microsoftFetches = enabled
    .filter((calendar) => calendar.provider === "microsoft")
    .map((calendar) => listMicrosoftEventsForAccount(uid, calendar.accountId, calendar.calendarId, timeMin, timeMax).catch(() => []));
  const [google, microsoft] = await Promise.all([Promise.all(googleFetches), Promise.all(microsoftFetches)]);
  const events: DayReorderEvent[] = [];
  for (const batch of google) {
    for (const event of batch) {
      events.push({
        id: event.id,
        title: event.summary,
        start: new Date(event.start),
        end: new Date(event.end),
        allDay: event.allDay,
      });
    }
  }
  for (const batch of microsoft) {
    for (const event of batch) {
      events.push({
        id: event.id,
        title: event.summary,
        start: new Date(event.start),
        end: new Date(event.end),
        allDay: event.allDay,
      });
    }
  }
  return events.filter((event) => !Number.isNaN(event.start.getTime()) && !Number.isNaN(event.end.getTime()));
}

/** Proposal for the current civil day. Empty moves means nothing to show. */
export async function buildDayReorder(uid: string, email: string, now = new Date()): Promise<DayReorderPlan> {
  const user = findUserByUid(uid);
  const workingHours: WorkingHours = user?.workingHours ?? DEFAULT_WORKING_HOURS;
  const tz = workingHours.timezone;
  const parts = getPartsInTz(now, tz);
  const dayStart = tzLocalToUtc(parts.year, parts.month, parts.day, 0, 0, tz);
  const nextDay = tzLocalToUtc(parts.year, parts.month, parts.day + 1, 0, 0, tz);
  const todos = await listTodos(uid);
  const tasks: DayReorderTask[] = [];
  for (const todo of todos) {
    if (todo.status !== "active" || !todo.scheduledSlot) continue;
    const start = new Date(todo.scheduledSlot.start);
    const end = new Date(todo.scheduledSlot.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) continue;
    tasks.push({
      id: todo.id,
      title: todo.title,
      priority: todo.priority,
      start,
      end,
      deadlineCap: parseDeadlineCap(todo.deadline, tz),
      notBefore: parseNotBefore(todo.startDate, tz),
      meeting: !!todo.scheduledSlot.meetingUrl,
      calendarEventId: todo.scheduledSlot.calendarEventId,
    });
  }
  const external = await externalEvents(uid, email, dayStart.toISOString(), nextDay.toISOString());
  const plan = planDayReorder({ now, workingHours, tasks, external });
  logger.info("day_reorder.proposed", { uid, moves: plan.moves.length, placed: plan.moves.filter((move) => move.to).length });
  return plan;
}

/**
 * Book the slots of the proposal the user confirmed.
 * A changed agenda returns the fresh plan and writes nothing.
 */
export async function applyDayReorder(uid: string, email: string, signature: string): Promise<DayReorderApplyResult> {
  const plan = await buildDayReorder(uid, email);
  if (!signature || plan.signature !== signature) {
    return { stale: true, plan, applied: [], failed: [] };
  }
  const applied: DayReorderApplyResult["applied"] = [];
  const failed: DayReorderApplyResult["failed"] = [];
  for (const move of plan.moves) {
    if (!move.to) continue;
    try {
      const found = await findTodoForUser(uid, move.todoId);
      const slot = found?.todo.scheduledSlot;
      const target = slot?.bookingProvider && slot.bookingAccountId && slot.bookingCalendarId
        ? { provider: slot.bookingProvider, accountId: slot.bookingAccountId, calendarId: slot.bookingCalendarId }
        : undefined;
      const result = await bookTodoSlot(uid, email, move.todoId, { start: move.to.start, end: move.to.end, target });
      if (!result.ok) {
        failed.push({ todoId: move.todoId, title: move.title, message: result.conflicts[0]?.title ?? result.code });
        continue;
      }
      applied.push({ todoId: move.todoId, title: move.title, start: move.to.start, end: move.to.end });
    } catch (err) {
      failed.push({
        todoId: move.todoId,
        title: move.title,
        message: err instanceof Error ? err.message : "Déplacement impossible",
      });
    }
  }
  logger.info("day_reorder.applied", { uid, applied: applied.length, failed: failed.length });
  return { stale: false, plan, applied, failed };
}
