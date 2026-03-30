import { listTodos } from "./todoService";
import { WorkingHours } from "./authService";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface SlotProposal {
  start: string; // ISO
  end: string;   // ISO
  label: string; // e.g. "Lun 24 mars, 09:00 – 09:30"
}

/* ── Timezone helpers (zero external deps) ── */

/**
 * Extract date/time components as seen in a given IANA timezone.
 */
function getPartsInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);

  const v = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: v("year"),
    month: v("month") - 1,
    day: v("day"),
    hour: v("hour") === 24 ? 0 : v("hour"),
    minute: v("minute"),
    dayOfWeek: wdMap[wdFmt.format(date)] ?? 0,
  };
}

/**
 * Convert a "local wall-clock" time in a given timezone to a UTC Date.
 * e.g. 09:00 Europe/Paris → 07:00 UTC (during CEST).
 */
function tzLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month, day, hour, minute, 0));

  const utcStr = guess.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr  = guess.toLocaleString("en-US", { timeZone: tz });
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();

  return new Date(guess.getTime() - offsetMs);
}

/* ── Slot finder ── */

/**
 * Finds available time slots for a task, respecting the user's timezone,
 * working hours, already scheduled tasks, and external busy slots.
 */
export function findAvailableSlots(
  userId: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  busySlots: TimeSlot[],
  maxResults: number = 3,
  startFrom?: Date,
): SlotProposal[] {
  const now = startFrom ?? new Date();
  const tz = workingHours.timezone;
  const allTodos = listTodos(userId);

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

  const todayInTz = getPartsInTz(now, tz);

  for (let dayOffset = 0; dayOffset < searchDays && proposals.length < maxResults; dayOffset++) {
    // Use noon as reference to avoid DST-boundary edge cases
    const refPoint = tzLocalToUtc(todayInTz.year, todayInTz.month, todayInTz.day + dayOffset, 12, 0, tz);
    const dayParts = getPartsInTz(refPoint, tz);

    if (!workingHours.daysOfWeek.includes(dayParts.dayOfWeek)) continue;

    const dayStart = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, startH, startM, tz);
    const dayEnd   = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, endH, endM, tz);

    let slotStart: Date;
    if (now > dayStart) {
      // Round up to next 15-min boundary (timezone-agnostic since we work in UTC ms)
      slotStart = new Date(Math.ceil(now.getTime() / 900_000) * 900_000);
    } else {
      slotStart = new Date(dayStart);
    }

    while (slotStart < dayEnd && proposals.length < maxResults) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

      if (slotEnd > dayEnd) break;

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

function formatSlotLabel(start: Date, end: Date, tz: string): string {
  const dayFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, weekday: "short", day: "numeric", month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}
