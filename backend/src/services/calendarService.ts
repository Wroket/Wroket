import { listTodos, type Priority } from "./todoService";
import { WorkingHours } from "./authService";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface SlotProposal {
  start: string; // ISO
  end: string;   // ISO
  label: string;
}

/* ── Timezone helpers (works on node:20-alpine with small-icu) ── */

const TZ_FMT: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric",
  hour12: true,
};

/**
 * Extract a UTC-comparable timestamp from formatToParts output.
 * Handles both 12h (with dayPeriod AM/PM) and 24h formats robustly.
 */
function partsToUtcMs(parts: Intl.DateTimeFormatPart[]): number {
  const v = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  let h = v("hour");
  const period = parts.find((p) => p.type === "dayPeriod")?.value?.toLowerCase();
  if (period) {
    if (period.startsWith("p") && h < 12) h += 12;
    if (period.startsWith("a") && h === 12) h = 0;
  } else if (h === 24) {
    h = 0;
  }

  return Date.UTC(v("year"), v("month") - 1, v("day"), h, v("minute"), 0);
}

/**
 * Compute UTC offset (in ms) for a timezone at a given instant.
 * Positive = timezone is ahead of UTC (e.g. +7200000 for CEST).
 */
function getUtcOffsetMs(date: Date, tz: string): number {
  const tzParts  = new Intl.DateTimeFormat("en", { ...TZ_FMT, timeZone: tz }).formatToParts(date);
  const utcParts = new Intl.DateTimeFormat("en", { ...TZ_FMT, timeZone: "UTC" }).formatToParts(date);
  return partsToUtcMs(tzParts) - partsToUtcMs(utcParts);
}

/**
 * Extract date/time components as seen in a given IANA timezone.
 */
function getPartsInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en", { ...TZ_FMT, timeZone: tz }).formatToParts(date);

  let h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const period = parts.find((p) => p.type === "dayPeriod")?.value?.toLowerCase();
  if (period) {
    if (period.startsWith("p") && h < 12) h += 12;
    if (period.startsWith("a") && h === 12) h = 0;
  } else if (h === 24) {
    h = 0;
  }

  const v = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const wdFmt = new Intl.DateTimeFormat("en", { timeZone: tz, weekday: "short" });
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: v("year"),
    month: v("month") - 1,
    day: v("day"),
    hour: h,
    minute: v("minute"),
    dayOfWeek: wdMap[wdFmt.format(date)] ?? 0,
  };
}

/**
 * Convert a "local wall-clock" time in a given timezone to a UTC Date.
 * e.g. 09:00 Europe/Paris → 07:00 UTC (during CEST).
 */
function tzLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const asUtc = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const offsetMs = getUtcOffsetMs(asUtc, tz);
  return new Date(asUtc.getTime() - offsetMs);
}

/* ── Scheduling context ── */

export interface SchedulingContext {
  priority?: Priority;
  deadline?: string | null;
  startDate?: string | null;
}

const DEFER_RATIO: Record<Priority, number> = {
  high: 0,
  medium: 0.3,
  low: 0.5,
};

/**
 * Compute the ideal search window [windowStart, deadlineCap] based on
 * priority and deadline. High-priority or no-deadline tasks start ASAP;
 * lower-priority tasks with distant deadlines are deferred to keep
 * early slots free for urgent work.
 */
function computeSchedulingWindow(
  now: Date,
  durationMinutes: number,
  ctx?: SchedulingContext,
): { windowStart: Date; deadlineCap: Date | null } {
  if (!ctx?.deadline) {
    const start = ctx?.startDate ? new Date(ctx.startDate) : now;
    return { windowStart: start > now ? start : now, deadlineCap: null };
  }

  const deadline = new Date(ctx.deadline);
  if (isNaN(deadline.getTime()) || deadline <= now) {
    return { windowStart: now, deadlineCap: null };
  }

  const isDateOnly = typeof ctx.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ctx.deadline);
  const cap = isDateOnly
    ? new Date(deadline.getTime() + 23 * 3600_000 + 59 * 60_000)
    : deadline;

  const startDate = ctx.startDate ? new Date(ctx.startDate) : null;
  const effectiveStart = startDate && startDate > now ? startDate : now;

  if (cap <= effectiveStart) {
    return { windowStart: effectiveStart, deadlineCap: null };
  }

  const msLeft = cap.getTime() - effectiveStart.getTime();
  const ratio = DEFER_RATIO[ctx.priority ?? "medium"];
  const deferMs = msLeft * ratio;

  let windowStart = new Date(effectiveStart.getTime() + deferMs);

  const minBufferMs = durationMinutes * 60_000 + 2 * 3600_000;
  const latestPossibleStart = new Date(cap.getTime() - minBufferMs);
  if (windowStart > latestPossibleStart) {
    windowStart = latestPossibleStart > effectiveStart ? latestPossibleStart : effectiveStart;
  }

  return { windowStart, deadlineCap: cap };
}

/* ── Slot finder ── */

export function findAvailableSlots(
  userId: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  busySlots: TimeSlot[],
  maxResults: number = 3,
  startFrom?: Date,
  schedulingCtx?: SchedulingContext,
): SlotProposal[] {
  const now = startFrom ?? new Date();
  const tz = workingHours.timezone;
  const allTodos = listTodos(userId);

  const { windowStart, deadlineCap } = computeSchedulingWindow(now, durationMinutes, schedulingCtx);
  const effectiveStart = windowStart > now ? windowStart : now;

  const occupiedSlots: TimeSlot[] = [
    ...busySlots,
    ...allTodos
      .filter((t) => t.scheduledSlot)
      .map((t) => ({
        start: new Date(t.scheduledSlot!.start),
        end: new Date(t.scheduledSlot!.end),
      })),
  ];

  const proposals: SlotProposal[] = [];
  const searchDays = 30;
  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM]     = workingHours.end.split(":").map(Number);

  const startInTz = getPartsInTz(effectiveStart, tz);

  for (let dayOffset = 0; dayOffset < searchDays && proposals.length < maxResults; dayOffset++) {
    const refPoint = tzLocalToUtc(startInTz.year, startInTz.month, startInTz.day + dayOffset, 12, 0, tz);
    const dayParts = getPartsInTz(refPoint, tz);

    if (!workingHours.daysOfWeek.includes(dayParts.dayOfWeek)) continue;

    const dayStart = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, startH, startM, tz);
    const dayEnd   = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, endH, endM, tz);

    if (deadlineCap && dayStart >= deadlineCap) break;

    let slotStart: Date;
    if (effectiveStart > dayStart) {
      slotStart = new Date(Math.ceil(effectiveStart.getTime() / 900_000) * 900_000);
    } else {
      slotStart = new Date(dayStart);
    }

    while (slotStart < dayEnd && proposals.length < maxResults) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

      if (slotEnd > dayEnd) break;
      if (deadlineCap && slotEnd > deadlineCap) break;

      const overlaps = occupiedSlots.some(
        (occ) => slotStart < occ.end && slotEnd > occ.start,
      );

      if (!overlaps) {
        proposals.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: formatSlotLabel(slotStart, slotEnd, tz),
        });
        slotStart = new Date(slotEnd.getTime() + 60 * 60_000);
      } else {
        slotStart = new Date(slotStart.getTime() + 15 * 60_000);
      }
    }
  }

  return proposals;
}

function formatSlotLabel(start: Date, end: Date, tz: string, locale = "en"): string {
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz, weekday: "short", day: "numeric", month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}
