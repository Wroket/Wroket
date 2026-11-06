/**
 * Propose a new plan for today's tasks when an external appointment overlaps
 * a booked slot. Pure: it does not read or write tasks.
 * Same free-gap rules as the slot finder (working hours, 15-min grid, duration, deadline).
 * Only displaced tasks move. Everything else stays where it is.
 */
import type { WorkingHours } from "./authService";
import { collectFreeCandidates, getPartsInTz, tzLocalToUtc, type TimeSlot } from "./calendarService";

export interface DayReorderTask {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  start: Date;
  end: Date;
  /** Slot must end by this instant. Null means no deadline pressure today. */
  deadlineCap: Date | null;
  /** Do not start the new slot before this instant. */
  notBefore: Date | null;
  meeting: boolean;
  calendarEventId: string | null;
}

export interface DayReorderEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
}

export interface DayReorderMove {
  todoId: string;
  title: string;
  from: { start: string; end: string };
  to: { start: string; end: string } | null;
}

export interface DayReorderPlan {
  date: string;
  triggers: { id: string; title: string; start: string; end: string }[];
  moves: DayReorderMove[];
  signature: string;
}

const PRIORITY_RANK: Record<DayReorderTask["priority"], number> = { high: 0, medium: 1, low: 2 };

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Stable id of the proposal the user is looking at. */
export function dayReorderSignature(moves: DayReorderMove[]): string {
  return moves.map((move) => `${move.todoId}:${move.to?.start ?? ""}`).join("|");
}

/**
 * Build today's proposal.
 * External events that are the task's own calendar mirror are ignored.
 * Slots that already ended are left alone.
 */
export function planDayReorder(input: {
  now: Date;
  workingHours: WorkingHours;
  tasks: DayReorderTask[];
  external: DayReorderEvent[];
}): DayReorderPlan {
  const { now, workingHours, tasks } = input;
  const tz = workingHours.timezone;
  const parts = getPartsInTz(now, tz);
  const date = `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
  const dayStart = tzLocalToUtc(parts.year, parts.month, parts.day, 0, 0, tz);
  const nextDay = tzLocalToUtc(parts.year, parts.month, parts.day + 1, 0, 0, tz);
  const empty: DayReorderPlan = { date, triggers: [], moves: [], signature: "" };

  const ownEventIds = new Set(
    tasks.map((task) => task.calendarEventId).filter((id): id is string => !!id),
  );
  const external = input.external.filter((event) => {
    if (event.allDay) return false;
    if (ownEventIds.has(event.id)) return false;
    return overlaps(event.start, event.end, dayStart, nextDay);
  });
  if (external.length === 0) return empty;

  const displaced = tasks.filter((task) => {
    if (task.meeting) return false;
    if (task.end <= now) return false;
    if (!overlaps(task.start, task.end, dayStart, nextDay)) return false;
    return external.some((event) => overlaps(task.start, task.end, event.start, event.end));
  });
  if (displaced.length === 0) return empty;

  const triggerIds = new Set<string>();
  const triggers = external.filter((event) => {
    const hits = displaced.some((task) => overlaps(task.start, task.end, event.start, event.end));
    if (!hits || triggerIds.has(event.id)) return false;
    triggerIds.add(event.id);
    return true;
  });

  const displacedIds = new Set(displaced.map((task) => task.id));
  const occupied: TimeSlot[] = [
    ...external.map((event) => ({ start: event.start, end: event.end })),
    ...tasks
      .filter((task) => !displacedIds.has(task.id))
      .map((task) => ({ start: task.start, end: task.end })),
  ];

  const ordered = [...displaced].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    const aDeadline = a.deadlineCap?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDeadline = b.deadlineCap?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aDeadline !== bDeadline) return aDeadline - bDeadline;
    return a.start.getTime() - b.start.getTime();
  });

  const moves: DayReorderMove[] = [];
  for (const task of ordered) {
    const durationMinutes = Math.max(15, Math.round((task.end.getTime() - task.start.getTime()) / 60_000));
    const searchFrom = task.notBefore && task.notBefore > now ? task.notBefore : now;
    const found = collectFreeCandidates({
      durationMinutes,
      workingHours,
      occupiedSlots: occupied,
      searchFrom,
      searchUntilExclusive: nextDay,
      deadlineCap: task.deadlineCap,
      maxCandidates: 1,
    });
    const slot = found[0];
    if (slot) occupied.push({ start: slot.start, end: slot.end });
    moves.push({
      todoId: task.id,
      title: task.title,
      from: { start: task.start.toISOString(), end: task.end.toISOString() },
      to: slot ? { start: slot.start.toISOString(), end: slot.end.toISOString() } : null,
    });
  }

  return {
    date,
    triggers: triggers.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
    })),
    moves,
    signature: dayReorderSignature(moves),
  };
}
