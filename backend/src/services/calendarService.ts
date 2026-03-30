import { listTodos } from "./todoService";
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

/* ── Timezone helpers ── */

/**
 * Get the UTC offset (in ms) for a timezone at a given instant.
 * Uses Intl longOffset ("GMT+02:00") — works on all Node 20+ builds including Alpine.
 */
function getUtcOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(date);

  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  if (raw === "GMT") return 0;

  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;

  return (m[1] === "+" ? 1 : -1) * (parseInt(m[2]) * 3_600_000 + parseInt(m[3]) * 60_000);
}

/**
 * Extract date/time components as seen in a given IANA timezone.
 */
function getPartsInTz(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const v = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: v("year"),
    month: v("month") - 1,
    day: v("day"),
    hour: v("hour"),
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

/* ── Slot finder ── */

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
    const refPoint = tzLocalToUtc(todayInTz.year, todayInTz.month, todayInTz.day + dayOffset, 12, 0, tz);
    const dayParts = getPartsInTz(refPoint, tz);

    if (!workingHours.daysOfWeek.includes(dayParts.dayOfWeek)) continue;

    const dayStart = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, startH, startM, tz);
    const dayEnd   = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, endH, endM, tz);

    let slotStart: Date;
    if (now > dayStart) {
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

  // ── Diagnostic log (à retirer plus tard) ──
  if (proposals.length > 0) {
    console.log("[calendar-tz-debug]", {
      timezone: tz,
      offsetMs: getUtcOffsetMs(new Date(), tz),
      serverTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      firstSlot: { iso: proposals[0].start, label: proposals[0].label },
    });
  }

  return proposals;
}

function formatSlotLabel(start: Date, end: Date, tz: string): string {
  const dayFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, weekday: "short", day: "numeric", month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}
