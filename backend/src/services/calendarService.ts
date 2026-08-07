import { listTodos, listAssignedToMe, type Priority, type Effort } from "./todoService";
import { WorkingHours } from "./authService";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export type SlotReasonCode =
  | "ideal_window"
  | "deadline_soon"
  | "morning_focus"
  | "light_gap"
  | "sooner_option"
  | "next_available";

export type TodayAvailability =
  | "available"
  | "not_working_day"
  | "outside_hours"
  | "no_remaining_fit"
  | "busy"
  | "before_start_date";

export interface SlotProposal {
  start: string; // ISO
  end: string;   // ISO
  label: string;
  reasonCode?: SlotReasonCode;
}

export interface FindSlotsResult {
  slots: SlotProposal[];
  todayAvailability: TodayAvailability;
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
  const wdRaw = wdFmt.format(date).replace(/\./g, "");
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: v("year"),
    month: v("month") - 1,
    day: v("day"),
    hour: h,
    minute: v("minute"),
    dayOfWeek: wdMap[wdRaw] ?? 0,
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

/** Civil day key in a timezone (`YYYY-M-D`). */
export function civilDayKey(date: Date, tz: string): string {
  const p = getPartsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Calendar days from `from` to `to` in `tz` (date-only deadline uses the calendar date).
 */
export function calendarDaysUntil(from: Date, deadline: string, tz: string): number {
  const fromP = getPartsInTz(from, tz);
  let toY: number;
  let toM: number;
  let toD: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    const [y, m, d] = deadline.split("-").map(Number);
    toY = y;
    toM = m - 1;
    toD = d;
  } else {
    const toP = getPartsInTz(new Date(deadline), tz);
    toY = toP.year;
    toM = toP.month;
    toD = toP.day;
  }
  const a = Date.UTC(fromP.year, fromP.month, fromP.day);
  const b = Date.UTC(toY, toM, toD);
  return Math.round((b - a) / 86_400_000);
}

/* ── Scheduling context ── */

export interface SchedulingContext {
  priority?: Priority;
  deadline?: string | null;
  startDate?: string | null;
  effort?: Effort;
}

/** Defer ratios for distant deadlines (near deadlines collapse via clamp / ASAP rules). */
const DEFER_RATIO_DISTANT: Record<Priority, number> = {
  high: 0.35,
  medium: 0.55,
  low: 0.7,
};

const ASAP_DAYS = 7;
const HIGH_ASAP_DAYS = 14;
const MAX_CANDIDATES = 40;
const SEARCH_WORKING_DAYS = 30;

export interface SchedulingWindow {
  windowStart: Date;
  deadlineCap: Date | null;
  /** True when the task should be scheduled ASAP (near / overdue / no deadline). */
  asap: boolean;
  /** True when high priority + distant deadline may offer one sooner_option. */
  allowSoonerOption: boolean;
}

/**
 * Compute the ideal search window [windowStart, deadlineCap] based on
 * priority, deadline distance, and effort. Near deadlines stay ASAP via
 * explicit day thresholds and the duration+2h clamp.
 */
export function computeSchedulingWindow(
  now: Date,
  durationMinutes: number,
  ctx?: SchedulingContext,
  tz = "UTC",
): SchedulingWindow {
  if (!ctx?.deadline) {
    const start = ctx?.startDate ? new Date(ctx.startDate) : now;
    return {
      windowStart: start > now ? start : now,
      deadlineCap: null,
      asap: true,
      allowSoonerOption: false,
    };
  }

  const deadline = new Date(ctx.deadline);
  if (isNaN(deadline.getTime()) || deadline <= now) {
    return {
      windowStart: now,
      deadlineCap: null,
      asap: true,
      allowSoonerOption: false,
    };
  }

  const isDateOnly = typeof ctx.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ctx.deadline);
  const cap = isDateOnly
    ? new Date(deadline.getTime() + 23 * 3600_000 + 59 * 60_000)
    : deadline;

  // Also use civil-day start for date-only startDate (avoid UTC midnight shift).
  let effectiveStart = now;
  if (ctx?.startDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ctx.startDate)) {
      const [y, m, d] = ctx.startDate.split("-").map(Number);
      const localStart = tzLocalToUtc(y, m - 1, d, 0, 0, tz);
      if (localStart > effectiveStart) effectiveStart = localStart;
    } else {
      const startDate = new Date(ctx.startDate);
      if (!isNaN(startDate.getTime()) && startDate > effectiveStart) effectiveStart = startDate;
    }
  }

  if (cap <= effectiveStart) {
    return {
      windowStart: effectiveStart,
      deadlineCap: null,
      asap: true,
      allowSoonerOption: false,
    };
  }

  const priority = ctx.priority ?? "medium";
  const daysLeft = calendarDaysUntil(effectiveStart, ctx.deadline, tz);
  const nearDeadline = daysLeft <= ASAP_DAYS;
  const highNear = priority === "high" && daysLeft <= HIGH_ASAP_DAYS;
  const distant = daysLeft > HIGH_ASAP_DAYS;
  const allowSoonerOption = priority === "high" && distant;

  if (nearDeadline || highNear) {
    return {
      windowStart: effectiveStart,
      deadlineCap: cap,
      asap: true,
      allowSoonerOption: false,
    };
  }

  let ratio = DEFER_RATIO_DISTANT[priority];
  if (ctx.effort === "heavy") ratio += 0.05;

  const msLeft = cap.getTime() - effectiveStart.getTime();
  let windowStart = new Date(effectiveStart.getTime() + msLeft * ratio);

  const minBufferMs = durationMinutes * 60_000 + 2 * 3600_000;
  const latestPossibleStart = new Date(cap.getTime() - minBufferMs);
  if (windowStart > latestPossibleStart) {
    windowStart = latestPossibleStart > effectiveStart ? latestPossibleStart : effectiveStart;
  }

  const clampedToNow = windowStart <= effectiveStart;
  return {
    windowStart,
    deadlineCap: cap,
    asap: clampedToNow,
    allowSoonerOption: allowSoonerOption && !clampedToNow,
  };
}

/* ── Scoring ── */

export interface SlotCandidate {
  start: Date;
  end: Date;
  score: number;
  reasonCode: SlotReasonCode;
}

function effortHourBonus(effort: Effort, fraction: number): number {
  if (effort === "heavy") {
    if (fraction <= 1 / 3) return 25;
    if (fraction <= 0.55) return 10;
    return -20;
  }
  if (effort === "medium") {
    if (fraction >= 0.25 && fraction <= 0.7) return 18;
    if (fraction < 0.25) return 12;
    return 5;
  }
  // light
  if (fraction >= 2 / 3) return 22;
  if (fraction >= 0.45) return 14;
  return 8;
}

/**
 * Score a free slot.
 * ASAP / sooner: earliest day wins (effort is only a within-day tie-breaker).
 * Ideal window: prefer window start + effort×hour.
 */
export function scoreSlotCandidate(
  start: Date,
  end: Date,
  opts: {
    windowStart: Date;
    deadlineCap: Date | null;
    workingHours: WorkingHours;
    effort: Effort;
    asap: boolean;
    sooner?: boolean;
    /** For sooner_option / ASAP day ranking: usually `now`. */
    soonerReference?: Date;
  },
): SlotCandidate {
  const { windowStart, deadlineCap, workingHours, effort, asap, sooner, soonerReference } = opts;
  const tz = workingHours.timezone;
  const parts = getPartsInTz(start, tz);
  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);
  const dayStartMin = startH * 60 + startM;
  const dayEndMin = endH * 60 + endM;
  const span = Math.max(1, dayEndMin - dayStartMin);
  const slotMin = parts.hour * 60 + parts.minute;
  const fraction = (slotMin - dayStartMin) / span;
  const hourBonus = effortHourBonus(effort, fraction);

  let score = 0;

  if (sooner || asap) {
    // Earliest civil day must beat later "nicer hours" (e.g. Fri 15:00 > Mon 12:00).
    const ref = soonerReference ?? windowStart;
    const daysAfterRef = Math.max(0, (start.getTime() - ref.getTime()) / 86_400_000);
    score += 500 - daysAfterRef * 80;
    score += hourBonus * 0.25;
  } else {
    const msFromWindow = start.getTime() - windowStart.getTime();
    const daysFromWindow = msFromWindow / 86_400_000;
    score += Math.max(0, 80 - Math.abs(daysFromWindow) * 10);
    score += hourBonus;
  }

  if (deadlineCap) {
    const hoursToCap = (deadlineCap.getTime() - end.getTime()) / 3_600_000;
    if (hoursToCap >= 24) score += 4;
    else if (hoursToCap >= 4) score += 1;
    else score -= 3;
  }

  let reasonCode: SlotReasonCode = "next_available";
  if (sooner) {
    reasonCode = "sooner_option";
  } else if (asap) {
    reasonCode = effort === "heavy" && fraction <= 1 / 3 ? "morning_focus" : "deadline_soon";
  } else if (effort === "heavy" && fraction <= 1 / 3) {
    reasonCode = "morning_focus";
  } else if (effort === "light" && fraction >= 2 / 3) {
    reasonCode = "light_gap";
  } else {
    reasonCode = "ideal_window";
  }

  return { start, end, score, reasonCode };
}

/**
 * Greedy pick of top candidates with at most one slot per civil day.
 * When `chronologicalDays` is true (ASAP), earlier days are taken first;
 * score only chooses the best time within each day.
 */
export function pickDiversifiedTop(
  candidates: SlotCandidate[],
  maxResults: number,
  tz: string,
  chronologicalDays = false,
): SlotCandidate[] {
  if (!chronologicalDays) {
    const sorted = [...candidates].sort((a, b) => b.score - a.score || a.start.getTime() - b.start.getTime());
    const picked: SlotCandidate[] = [];
    const usedDays = new Set<string>();
    for (const c of sorted) {
      const key = civilDayKey(c.start, tz);
      if (usedDays.has(key)) continue;
      usedDays.add(key);
      picked.push(c);
      if (picked.length >= maxResults) break;
    }
    return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // ASAP: group by day (earliest first), best score within day.
  const byDay = new Map<string, SlotCandidate[]>();
  for (const c of candidates) {
    const key = civilDayKey(c.start, tz);
    const list = byDay.get(key);
    if (list) list.push(c);
    else byDay.set(key, [c]);
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => {
    const aStart = byDay.get(a)![0].start.getTime();
    const bStart = byDay.get(b)![0].start.getTime();
    return aStart - bStart;
  });

  const picked: SlotCandidate[] = [];
  for (const key of dayKeys) {
    const daySlots = byDay.get(key)!;
    daySlots.sort((a, b) => b.score - a.score || a.start.getTime() - b.start.getTime());
    picked.push(daySlots[0]);
    if (picked.length >= maxResults) break;
  }
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}

interface CollectOpts {
  durationMinutes: number;
  workingHours: WorkingHours;
  occupiedSlots: TimeSlot[];
  searchFrom: Date;
  searchUntilExclusive?: Date;
  deadlineCap: Date | null;
  maxCandidates: number;
}

/**
 * Collect free working-hour slots on a 15-min grid (skip +1h after each hit).
 */
export function collectFreeCandidates(opts: CollectOpts): { start: Date; end: Date }[] {
  const {
    durationMinutes,
    workingHours,
    occupiedSlots,
    searchFrom,
    searchUntilExclusive,
    deadlineCap,
    maxCandidates,
  } = opts;
  const tz = workingHours.timezone;
  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);
  const startInTz = getPartsInTz(searchFrom, tz);
  const found: { start: Date; end: Date }[] = [];

  for (let dayOffset = 0; dayOffset < SEARCH_WORKING_DAYS && found.length < maxCandidates; dayOffset++) {
    const refPoint = tzLocalToUtc(startInTz.year, startInTz.month, startInTz.day + dayOffset, 12, 0, tz);
    const dayParts = getPartsInTz(refPoint, tz);

    if (!workingHours.daysOfWeek.includes(dayParts.dayOfWeek)) continue;

    const dayStart = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, startH, startM, tz);
    const dayEnd = tzLocalToUtc(dayParts.year, dayParts.month, dayParts.day, endH, endM, tz);

    if (searchUntilExclusive && dayStart >= searchUntilExclusive) break;
    if (deadlineCap && dayStart >= deadlineCap) break;

    let slotStart: Date;
    if (searchFrom > dayStart) {
      slotStart = new Date(Math.ceil(searchFrom.getTime() / 900_000) * 900_000);
    } else {
      slotStart = new Date(dayStart);
    }

    while (slotStart < dayEnd && found.length < maxCandidates) {
      if (searchUntilExclusive && slotStart >= searchUntilExclusive) break;

      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

      if (slotEnd > dayEnd) break;
      if (deadlineCap && slotEnd > deadlineCap) break;
      if (searchUntilExclusive && slotEnd > searchUntilExclusive) break;

      const overlaps = occupiedSlots.some(
        (occ) => slotStart < occ.end && slotEnd > occ.start,
      );

      if (!overlaps) {
        found.push({ start: new Date(slotStart), end: slotEnd });
        slotStart = new Date(slotEnd.getTime() + 60 * 60_000);
      } else {
        slotStart = new Date(slotStart.getTime() + 15 * 60_000);
      }
    }
  }

  return found;
}

/**
 * Explain why today may be missing from suggestions (truthful UX copy).
 */
export function analyzeTodayAvailability(
  now: Date,
  durationMinutes: number,
  workingHours: WorkingHours,
  occupiedSlots: TimeSlot[],
  startDate?: string | null,
): TodayAvailability {
  const tz = workingHours.timezone;

  if (startDate) {
    const parts = getPartsInTz(now, tz);
    let startY: number | null = null;
    let startM = 0;
    let startD = 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      const [y, m, d] = startDate.split("-").map(Number);
      startY = y;
      startM = m - 1;
      startD = d;
    } else {
      const parsed = new Date(startDate);
      if (!isNaN(parsed.getTime())) {
        const sp = getPartsInTz(parsed, tz);
        startY = sp.year;
        startM = sp.month;
        startD = sp.day;
      }
    }
    if (startY !== null) {
      const nowUtc = Date.UTC(parts.year, parts.month, parts.day);
      const startUtc = Date.UTC(startY, startM, startD);
      if (nowUtc < startUtc) return "before_start_date";
    }
  }

  const parts = getPartsInTz(now, tz);
  if (!workingHours.daysOfWeek.includes(parts.dayOfWeek)) {
    return "not_working_day";
  }

  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);
  const dayStart = tzLocalToUtc(parts.year, parts.month, parts.day, startH, startM, tz);
  const dayEnd = tzLocalToUtc(parts.year, parts.month, parts.day, endH, endM, tz);
  const tomorrowStart = tzLocalToUtc(parts.year, parts.month, parts.day + 1, 0, 0, tz);

  if (now >= dayEnd) return "outside_hours";

  const searchFrom = now > dayStart ? now : dayStart;
  const remainingMs = dayEnd.getTime() - searchFrom.getTime();
  if (remainingMs < durationMinutes * 60_000) return "no_remaining_fit";

  const found = collectFreeCandidates({
    durationMinutes,
    workingHours,
    occupiedSlots,
    searchFrom,
    searchUntilExclusive: tomorrowStart,
    deadlineCap: null,
    maxCandidates: 1,
  });

  return found.length > 0 ? "available" : "busy";
}

/* ── Slot finder ── */

export async function findAvailableSlots(
  userId: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  busySlots: TimeSlot[],
  maxResults: number = 3,
  startFrom?: Date,
  schedulingCtx?: SchedulingContext,
): Promise<FindSlotsResult> {
  const now = startFrom ?? new Date();
  const tz = workingHours.timezone;
  const effort = schedulingCtx?.effort ?? "medium";

  const [ownedTodos, assignedTodos] = await Promise.all([
    listTodos(userId),
    listAssignedToMe(userId),
  ]);

  const { windowStart, deadlineCap, asap, allowSoonerOption } = computeSchedulingWindow(
    now,
    durationMinutes,
    schedulingCtx,
    tz,
  );
  const effectiveStart = windowStart > now ? windowStart : now;

  const occupiedSlots: TimeSlot[] = [
    ...busySlots,
    ...[...ownedTodos, ...assignedTodos]
      .filter((t) => t.scheduledSlot)
      .map((t) => ({
        start: new Date(t.scheduledSlot!.start),
        end: new Date(t.scheduledSlot!.end),
      })),
  ];

  const todayAvailability = analyzeTodayAvailability(
    now,
    durationMinutes,
    workingHours,
    occupiedSlots,
    schedulingCtx?.startDate,
  );

  const scoreOptsBase = {
    windowStart: effectiveStart,
    deadlineCap,
    workingHours,
    effort,
    asap,
    soonerReference: now,
  };

  const idealRaw = collectFreeCandidates({
    durationMinutes,
    workingHours,
    occupiedSlots,
    searchFrom: effectiveStart,
    deadlineCap,
    maxCandidates: MAX_CANDIDATES,
  });

  const idealScored = idealRaw.map((s) =>
    scoreSlotCandidate(s.start, s.end, scoreOptsBase),
  );

  const picked: SlotCandidate[] = [];

  if (allowSoonerOption) {
    const soonerRaw = collectFreeCandidates({
      durationMinutes,
      workingHours,
      occupiedSlots,
      searchFrom: now,
      searchUntilExclusive: effectiveStart,
      deadlineCap,
      maxCandidates: 15,
    });
    const soonerScored = soonerRaw.map((s) =>
      scoreSlotCandidate(s.start, s.end, {
        ...scoreOptsBase,
        asap: false,
        sooner: true,
        soonerReference: now,
      }),
    );
    const bestSooner = pickDiversifiedTop(soonerScored, 1, tz, true);
    if (bestSooner[0]) {
      picked.push(bestSooner[0]);
    }
  }

  const remaining = maxResults - picked.length;
  const usedDays = new Set(picked.map((p) => civilDayKey(p.start, tz)));
  const idealPicked = pickDiversifiedTop(
    idealScored.filter((c) => !usedDays.has(civilDayKey(c.start, tz))),
    remaining,
    tz,
    asap,
  );
  picked.push(...idealPicked);

  if (picked.length < maxResults) {
    const more = pickDiversifiedTop(
      idealScored.filter((c) => !picked.some((p) => p.start.getTime() === c.start.getTime())),
      maxResults - picked.length,
      tz,
      asap,
    );
    for (const m of more) {
      const key = civilDayKey(m.start, tz);
      if (usedDays.has(key) || picked.some((p) => civilDayKey(p.start, tz) === key)) continue;
      picked.push(m);
      usedDays.add(key);
      if (picked.length >= maxResults) break;
    }
  }

  const slots = picked
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, maxResults)
    .map((c) => ({
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      label: formatSlotLabel(c.start, c.end, tz),
      reasonCode: c.reasonCode,
    }));

  return { slots, todayAvailability };
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
