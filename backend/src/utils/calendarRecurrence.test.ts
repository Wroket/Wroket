import { describe, expect, it } from "vitest";

import {
  recurrenceChanged,
  recurrenceEquals,
  wroketRecurrenceToGoogleRrule,
  wroketRecurrenceToMicrosoftRecurrence,
} from "./calendarRecurrence";
import type { Recurrence } from "../services/todoService";

const SLOT = "2026-06-15T10:00:00.000Z";
const TZ = "Europe/Paris";

describe("wroketRecurrenceToGoogleRrule", () => {
  it("builds daily RRULE with interval and UNTIL", () => {
    const rec: Recurrence = { frequency: "daily", interval: 2, endDate: "2026-12-31" };
    expect(wroketRecurrenceToGoogleRrule(rec, SLOT, TZ)).toEqual([
      "RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261231T235959Z",
    ]);
  });

  it("builds weekly RRULE with BYDAY from slot start", () => {
    const rec: Recurrence = { frequency: "weekly", interval: 1 };
    const rules = wroketRecurrenceToGoogleRrule(rec, SLOT, TZ);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatch(/^RRULE:FREQ=WEEKLY/);
    expect(rules[0]).toContain("BYDAY=MO");
  });

  it("builds monthly RRULE with BYMONTHDAY", () => {
    const rec: Recurrence = { frequency: "monthly", interval: 1 };
    const rules = wroketRecurrenceToGoogleRrule(rec, SLOT, TZ);
    expect(rules[0]).toContain("FREQ=MONTHLY");
    expect(rules[0]).toContain("BYMONTHDAY=15");
  });

  it("omits INTERVAL when 1", () => {
    const rec: Recurrence = { frequency: "daily", interval: 1 };
    const rules = wroketRecurrenceToGoogleRrule(rec, SLOT, TZ);
    expect(rules[0]).not.toContain("INTERVAL");
  });
});

describe("wroketRecurrenceToMicrosoftRecurrence", () => {
  it("builds daily pattern with noEnd range", () => {
    const rec: Recurrence = { frequency: "daily", interval: 1 };
    const ms = wroketRecurrenceToMicrosoftRecurrence(rec, SLOT, TZ);
    expect(ms.pattern).toEqual({ type: "daily", interval: 1 });
    expect(ms.range.type).toBe("noEnd");
    expect(ms.range.startDate).toBe("2026-06-15");
  });

  it("builds weekly pattern with daysOfWeek", () => {
    const rec: Recurrence = { frequency: "weekly", interval: 2 };
    const ms = wroketRecurrenceToMicrosoftRecurrence(rec, SLOT, TZ);
    expect(ms.pattern.type).toBe("weekly");
    expect(ms.pattern.interval).toBe(2);
    expect(ms.pattern.daysOfWeek).toEqual(["monday"]);
  });

  it("builds monthly absoluteMonthly with endDate range", () => {
    const rec: Recurrence = { frequency: "monthly", interval: 1, endDate: "2026-09-30" };
    const ms = wroketRecurrenceToMicrosoftRecurrence(rec, SLOT, TZ);
    expect(ms.pattern.type).toBe("absoluteMonthly");
    expect(ms.pattern.dayOfMonth).toBe(15);
    expect(ms.range).toEqual({
      type: "endDate",
      startDate: "2026-06-15",
      endDate: "2026-09-30",
    });
  });
});

describe("recurrenceEquals / recurrenceChanged", () => {
  const base: Recurrence = { frequency: "weekly", interval: 1, endDate: "2026-12-31" };

  it("treats null as equal", () => {
    expect(recurrenceEquals(null, null)).toBe(true);
    expect(recurrenceChanged(null, null)).toBe(false);
  });

  it("ignores nextDueDate for equality", () => {
    const a = { ...base, nextDueDate: "2026-06-22" };
    const b = { ...base, nextDueDate: "2026-06-29" };
    expect(recurrenceEquals(a, b)).toBe(true);
  });

  it("detects frequency change", () => {
    const other = { ...base, frequency: "daily" as const };
    expect(recurrenceChanged(base, other)).toBe(true);
  });

  it("detects removal", () => {
    expect(recurrenceChanged(base, null)).toBe(true);
    expect(recurrenceChanged(null, base)).toBe(true);
  });
});
