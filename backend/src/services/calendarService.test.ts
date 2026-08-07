import { describe, expect, it } from "vitest";

import {
  analyzeTodayAvailability,
  calendarDaysUntil,
  civilDayKey,
  collectFreeCandidates,
  computeSchedulingWindow,
  pickDiversifiedTop,
  scoreSlotCandidate,
  type SlotCandidate,
} from "./calendarService";
import type { WorkingHours } from "./authService";

const WH: WorkingHours = {
  start: "09:00",
  end: "17:00",
  daysOfWeek: [1, 2, 3, 4, 5],
  timezone: "Europe/Paris",
};

/** Fixed "now": Wednesday 2026-07-01 10:00 Paris (CEST = UTC+2). */
const NOW = new Date("2026-07-01T08:00:00.000Z");

function isoDateOffset(days: number): string {
  const d = new Date(Date.UTC(2026, 6, 1 + days)); // July is month 6
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("computeSchedulingWindow", () => {
  it("uses ASAP for deadline within 7 days even with medium priority", () => {
    const deadline = isoDateOffset(3);
    const win = computeSchedulingWindow(NOW, 30, {
      priority: "medium",
      deadline,
      effort: "medium",
    }, WH.timezone);
    expect(win.asap).toBe(true);
    expect(win.allowSoonerOption).toBe(false);
    expect(win.windowStart.getTime()).toBe(NOW.getTime());
    expect(win.deadlineCap).not.toBeNull();
  });

  it("defers medium priority with deadline in ~30 days away from tomorrow", () => {
    const deadline = isoDateOffset(30);
    const win = computeSchedulingWindow(NOW, 30, {
      priority: "medium",
      deadline,
      effort: "medium",
    }, WH.timezone);
    expect(win.asap).toBe(false);
    expect(win.allowSoonerOption).toBe(false);
    const daysOut = (win.windowStart.getTime() - NOW.getTime()) / 86_400_000;
    expect(daysOut).toBeGreaterThan(10);
    expect(daysOut).toBeLessThan(22);
  });

  it("allows sooner option for high priority with distant deadline", () => {
    const deadline = isoDateOffset(30);
    const win = computeSchedulingWindow(NOW, 30, {
      priority: "high",
      deadline,
      effort: "medium",
    }, WH.timezone);
    expect(win.asap).toBe(false);
    expect(win.allowSoonerOption).toBe(true);
  });

  it("clamps window when deadline is tomorrow (duration + 2h guard)", () => {
    const deadline = isoDateOffset(1);
    const win = computeSchedulingWindow(NOW, 60, {
      priority: "low",
      deadline,
      effort: "heavy",
    }, WH.timezone);
    expect(win.asap).toBe(true);
    expect(win.windowStart.getTime()).toBeLessThanOrEqual(NOW.getTime() + 60_000);
  });

  it("ASAP when high and deadline within 14 days", () => {
    const deadline = isoDateOffset(10);
    const win = computeSchedulingWindow(NOW, 30, {
      priority: "high",
      deadline,
    }, WH.timezone);
    expect(win.asap).toBe(true);
    expect(win.allowSoonerOption).toBe(false);
  });

  it("ASAP when no deadline", () => {
    const win = computeSchedulingWindow(NOW, 30, { priority: "low" }, WH.timezone);
    expect(win.asap).toBe(true);
    expect(win.deadlineCap).toBeNull();
  });
});

describe("calendarDaysUntil", () => {
  it("counts civil days in Europe/Paris", () => {
    expect(calendarDaysUntil(NOW, isoDateOffset(30), WH.timezone)).toBe(30);
    expect(calendarDaysUntil(NOW, isoDateOffset(0), WH.timezone)).toBe(0);
  });
});

describe("pickDiversifiedTop", () => {
  it("returns at most one candidate per civil day", () => {
    const mk = (iso: string, score: number): SlotCandidate => ({
      start: new Date(iso),
      end: new Date(new Date(iso).getTime() + 30 * 60_000),
      score,
      reasonCode: "ideal_window",
    });
    const candidates = [
      mk("2026-07-15T07:00:00.000Z", 100),
      mk("2026-07-15T12:00:00.000Z", 90),
      mk("2026-07-16T07:00:00.000Z", 80),
      mk("2026-07-17T07:00:00.000Z", 70),
    ];
    const picked = pickDiversifiedTop(candidates, 3, WH.timezone);
    expect(picked).toHaveLength(3);
    const days = picked.map((p) => civilDayKey(p.start, WH.timezone));
    expect(new Set(days).size).toBe(3);
    expect(picked[0].start.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("ASAP chronological mode prefers Friday over Monday even if Monday scores higher within-day", () => {
    const fri = scoreSlotCandidate(
      new Date("2026-08-07T13:00:00.000Z"), // Fri 15:00 Paris
      new Date("2026-08-07T13:30:00.000Z"),
      {
        windowStart: new Date("2026-08-07T12:50:00.000Z"),
        deadlineCap: new Date("2026-08-11T21:59:00.000Z"),
        workingHours: WH,
        effort: "medium",
        asap: true,
        soonerReference: new Date("2026-08-07T12:50:00.000Z"),
      },
    );
    const mon = scoreSlotCandidate(
      new Date("2026-08-10T10:00:00.000Z"), // Mon 12:00 Paris
      new Date("2026-08-10T10:30:00.000Z"),
      {
        windowStart: new Date("2026-08-07T12:50:00.000Z"),
        deadlineCap: new Date("2026-08-11T21:59:00.000Z"),
        workingHours: WH,
        effort: "medium",
        asap: true,
        soonerReference: new Date("2026-08-07T12:50:00.000Z"),
      },
    );
    // Regression: within-day "nice hour" must NOT outrank an earlier ASAP day.
    const picked = pickDiversifiedTop([mon, fri], 2, WH.timezone, true);
    expect(picked[0].start.toISOString()).toBe(fri.start.toISOString());
  });
});

describe("scoreSlotCandidate", () => {
  it("prefers morning for heavy effort", () => {
    const morning = scoreSlotCandidate(
      new Date("2026-07-15T07:00:00.000Z"),
      new Date("2026-07-15T08:00:00.000Z"),
      {
        windowStart: new Date("2026-07-15T07:00:00.000Z"),
        deadlineCap: new Date("2026-08-01T21:59:00.000Z"),
        workingHours: WH,
        effort: "heavy",
        asap: false,
      },
    );
    const late = scoreSlotCandidate(
      new Date("2026-07-15T14:00:00.000Z"),
      new Date("2026-07-15T15:00:00.000Z"),
      {
        windowStart: new Date("2026-07-15T07:00:00.000Z"),
        deadlineCap: new Date("2026-08-01T21:59:00.000Z"),
        workingHours: WH,
        effort: "heavy",
        asap: false,
      },
    );
    expect(morning.score).toBeGreaterThan(late.score);
    expect(morning.reasonCode).toBe("morning_focus");
  });

  it("does not label midday light slots as light_gap / end of day", () => {
    const midday = scoreSlotCandidate(
      new Date("2026-07-15T11:15:00.000Z"),
      new Date("2026-07-15T11:25:00.000Z"),
      {
        windowStart: new Date("2026-07-15T07:00:00.000Z"),
        deadlineCap: new Date("2026-08-01T21:59:00.000Z"),
        workingHours: WH,
        effort: "light",
        asap: false,
      },
    );
    expect(midday.reasonCode).toBe("ideal_window");

    const late = scoreSlotCandidate(
      new Date("2026-07-15T14:00:00.000Z"),
      new Date("2026-07-15T14:10:00.000Z"),
      {
        windowStart: new Date("2026-07-15T07:00:00.000Z"),
        deadlineCap: new Date("2026-08-01T21:59:00.000Z"),
        workingHours: WH,
        effort: "light",
        asap: false,
      },
    );
    expect(late.reasonCode).toBe("light_gap");
  });
});

describe("collectFreeCandidates", () => {
  it("skips occupied slots including an assigned-style busy block", () => {
    const occupied = [
      {
        start: new Date("2026-07-01T07:00:00.000Z"),
        end: new Date("2026-07-01T08:00:00.000Z"),
      },
    ];
    const found = collectFreeCandidates({
      durationMinutes: 30,
      workingHours: WH,
      occupiedSlots: occupied,
      searchFrom: NOW,
      deadlineCap: null,
      maxCandidates: 5,
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].start.getTime()).toBeGreaterThanOrEqual(new Date("2026-07-01T08:00:00.000Z").getTime());
  });

  it("ASAP near deadline includes today when morning is still free", () => {
    const now = new Date("2026-08-06T22:50:00.000Z"); // Fri Aug 7 00:50 Paris
    const deadline = "2026-08-11";
    const win = computeSchedulingWindow(now, 30, {
      priority: "medium",
      deadline,
      effort: "medium",
    }, WH.timezone);
    expect(win.asap).toBe(true);

    const found = collectFreeCandidates({
      durationMinutes: 30,
      workingHours: WH,
      occupiedSlots: [],
      searchFrom: now,
      deadlineCap: win.deadlineCap,
      maxCandidates: 10,
    });
    expect(found.length).toBeGreaterThan(0);
    expect(civilDayKey(found[0].start, WH.timezone)).toBe("2026-7-7");
  });

  it("finds Friday afternoon when now is Fri 14:50 and calendar is empty", () => {
    const now = new Date("2026-08-07T12:50:00.000Z"); // Fri 14:50 Paris
    const found = collectFreeCandidates({
      durationMinutes: 30,
      workingHours: WH,
      occupiedSlots: [],
      searchFrom: now,
      deadlineCap: new Date("2026-08-11T21:59:00.000Z"),
      maxCandidates: 10,
    });
    expect(found.length).toBeGreaterThan(0);
    expect(civilDayKey(found[0].start, WH.timezone)).toBe("2026-7-7");
  });
});

describe("analyzeTodayAvailability", () => {
  it("reports before_start_date when task start is in the future", () => {
    const now = new Date("2026-08-07T12:50:00.000Z");
    expect(analyzeTodayAvailability(now, 30, WH, [], "2026-08-09")).toBe("before_start_date");
  });

  it("reports available when Friday afternoon still has a 30min gap", () => {
    const now = new Date("2026-08-07T12:50:00.000Z");
    expect(analyzeTodayAvailability(now, 30, WH, [])).toBe("available");
  });

  it("reports no_remaining_fit when duration no longer fits today", () => {
    const now = new Date("2026-08-07T14:40:00.000Z"); // Fri 16:40 Paris — 20 min left before 17:00
    expect(analyzeTodayAvailability(now, 30, WH, [])).toBe("no_remaining_fit");
  });

  it("reports not_working_day on Saturday", () => {
    const now = new Date("2026-08-08T10:00:00.000Z"); // Sat
    expect(analyzeTodayAvailability(now, 30, WH, [])).toBe("not_working_day");
  });

  it("reports busy when the rest of today is occupied", () => {
    const now = new Date("2026-08-07T12:50:00.000Z");
    const occupied = [
      {
        start: new Date("2026-08-07T12:00:00.000Z"),
        end: new Date("2026-08-07T15:00:00.000Z"), // until 17:00 Paris
      },
    ];
    expect(analyzeTodayAvailability(now, 30, WH, occupied)).toBe("busy");
  });
});
