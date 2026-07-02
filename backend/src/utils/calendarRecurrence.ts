import type { Recurrence, RecurrenceFrequency } from "../services/todoService";

const GOOGLE_BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const MS_DAYS_OF_WEEK = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const GOOGLE_FREQ: Record<RecurrenceFrequency, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
};

export interface MicrosoftGraphRecurrence {
  pattern: {
    type: "daily" | "weekly" | "absoluteMonthly";
    interval: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
  };
  range: {
    type: "endDate" | "noEnd";
    startDate: string;
    endDate?: string;
  };
}

/** Local calendar date YYYY-MM-DD for an instant in a timezone. */
export function localDateInTimezone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Day-of-week index 0=Sun … 6=Sat in a timezone. */
export function dayOfWeekInTimezone(iso: string, tz: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "UTC",
    weekday: "short",
  }).format(new Date(iso));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? new Date(iso).getUTCDay();
}

/** Day-of-month (1–31) in a timezone. */
export function dayOfMonthInTimezone(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "UTC",
    day: "numeric",
  }).formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === "day")?.value;
  const n = day ? parseInt(day, 10) : new Date(iso).getUTCDate();
  return Number.isFinite(n) ? n : 1;
}

/** RRULE UNTIL value (UTC) from a Wroket endDate (date or ISO). */
export function wroketEndDateToGoogleUntil(endDate: string): string {
  const dateOnly = endDate.slice(0, 10).replace(/-/g, "");
  return `${dateOnly}T235959Z`;
}

/**
 * Convert Wroket recurrence to Google Calendar RRULE strings.
 */
export function wroketRecurrenceToGoogleRrule(
  recurrence: Recurrence,
  slotStartIso: string,
  tz = "UTC",
): string[] {
  const parts = [`FREQ=${GOOGLE_FREQ[recurrence.frequency]}`];
  if (recurrence.interval > 1) {
    parts.push(`INTERVAL=${recurrence.interval}`);
  }
  if (recurrence.frequency === "weekly") {
    const dow = dayOfWeekInTimezone(slotStartIso, tz);
    parts.push(`BYDAY=${GOOGLE_BYDAY[dow]}`);
  }
  if (recurrence.frequency === "monthly") {
    parts.push(`BYMONTHDAY=${dayOfMonthInTimezone(slotStartIso, tz)}`);
  }
  if (recurrence.endDate) {
    parts.push(`UNTIL=${wroketEndDateToGoogleUntil(recurrence.endDate)}`);
  }
  return [`RRULE:${parts.join(";")}`];
}

/**
 * Convert Wroket recurrence to Microsoft Graph recurrence object.
 */
export function wroketRecurrenceToMicrosoftRecurrence(
  recurrence: Recurrence,
  slotStartIso: string,
  tz = "UTC",
): MicrosoftGraphRecurrence {
  const startDate = localDateInTimezone(slotStartIso, tz);
  const pattern: MicrosoftGraphRecurrence["pattern"] = {
    type:
      recurrence.frequency === "daily"
        ? "daily"
        : recurrence.frequency === "weekly"
          ? "weekly"
          : "absoluteMonthly",
    interval: recurrence.interval,
  };

  if (recurrence.frequency === "weekly") {
    const dow = dayOfWeekInTimezone(slotStartIso, tz);
    pattern.daysOfWeek = [MS_DAYS_OF_WEEK[dow]];
  }
  if (recurrence.frequency === "monthly") {
    pattern.dayOfMonth = dayOfMonthInTimezone(slotStartIso, tz);
  }

  const range: MicrosoftGraphRecurrence["range"] = recurrence.endDate
    ? {
        type: "endDate",
        startDate,
        endDate: recurrence.endDate.slice(0, 10),
      }
    : {
        type: "noEnd",
        startDate,
      };

  return { pattern, range };
}

/** Deep equality for Wroket recurrence (ignores nextDueDate). */
export function recurrenceEquals(
  a: Recurrence | null | undefined,
  b: Recurrence | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.frequency === b.frequency &&
    a.interval === b.interval &&
    (a.endDate ?? null) === (b.endDate ?? null)
  );
}

/** True when recurrence field meaningfully changed between two states. */
export function recurrenceChanged(
  previous: Recurrence | null | undefined,
  current: Recurrence | null | undefined,
): boolean {
  return !recurrenceEquals(previous, current);
}
