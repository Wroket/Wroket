/**
 * Effective-due semantics: combine `deadline` (calendar day) and
 * `scheduledSlot.start` (ISO instant) so that filters, urgency scores, and
 * the dashboard overdue counter treat calendar bookings as first-class
 * commitments — consistent with the dashboard upcoming panel sort key.
 *
 * Rules:
 *   - If both exist, the **earlier** commitment wins (stricter).
 *   - If only one exists, it drives the result.
 *   - If neither exists, helpers return null / false.
 *
 * "Effective day" is compared at local calendar-day granularity (midnight).
 * "Effective instant" is the raw milliseconds of the soonest commitment,
 * used for fractional-days calculations in urgency scoring.
 */

import type { ScheduledSlot } from "./api/core";
import { parseDeadlineToLocalDay } from "./deadlineUtils";

interface HasEffectiveDue {
  deadline?: string | null;
  scheduledSlot?: ScheduledSlot | null;
}

/** Midnight local-time of a slot's start ISO instant. */
function slotToLocalDay(slotStart: string): Date {
  const d = new Date(slotStart);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  const local = new Date(d);
  local.setHours(0, 0, 0, 0);
  return local;
}

/**
 * Earliest local-midnight of deadline day and/or slot day.
 * Returns `null` when the task has neither.
 */
export function getEffectiveDueDay(todo: HasEffectiveDue): Date | null {
  const candidates: Date[] = [];

  if (todo.deadline?.trim()) {
    const d = parseDeadlineToLocalDay(todo.deadline.trim());
    if (!Number.isNaN(d.getTime())) candidates.push(d);
  }

  if (todo.scheduledSlot?.start) {
    const d = slotToLocalDay(todo.scheduledSlot.start);
    if (!Number.isNaN(d.getTime())) candidates.push(d);
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

/**
 * Earliest raw millisecond timestamp of deadline-day-start or slot-start.
 * Used for continuous urgency (fractional days).
 * Deadline is treated as start-of-that-local-day; slot uses its exact ISO instant.
 */
export function getEffectiveDueMs(todo: HasEffectiveDue, nowMs: number = Date.now()): number | null {
  const candidates: number[] = [];

  if (todo.deadline?.trim()) {
    const d = parseDeadlineToLocalDay(todo.deadline.trim());
    if (!Number.isNaN(d.getTime())) candidates.push(d.getTime());
  }

  if (todo.scheduledSlot?.start) {
    const ms = new Date(todo.scheduledSlot.start).getTime();
    if (!Number.isNaN(ms)) candidates.push(ms);
  }

  if (candidates.length === 0) return null;
  void nowMs; // nowMs reserved for future clamp logic; unused here intentionally
  return Math.min(...candidates);
}

/**
 * Effective fractional days left from nowMs to the soonest commitment.
 * Returns null when no deadline or slot exists.
 * Negative means overdue / past-slot.
 */
export function getEffectiveDaysLeft(todo: HasEffectiveDue, nowMs: number = Date.now()): number | null {
  const ms = getEffectiveDueMs(todo, nowMs);
  if (ms === null) return null;
  return (ms - nowMs) / (1000 * 60 * 60 * 24);
}

/**
 * Whether the task's effective due day is today (local) or in the past.
 * Used by `overdueCount` on the dashboard (any commitment that has passed
 * or is due today and the task is still active).
 */
export function isEffectivelyOverdue(todo: HasEffectiveDue, now: Date = new Date()): boolean {
  const due = getEffectiveDueDay(todo);
  if (!due) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

/**
 * Whether the task has NO effective due commitment (neither deadline nor slot).
 * Used by `filterDeadline === "none"`.
 */
export function hasNoEffectiveDue(todo: HasEffectiveDue): boolean {
  return getEffectiveDueDay(todo) === null;
}
