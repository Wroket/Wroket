import { describe, expect, it } from "vitest";

import {
  collectWroketCalendarEventIds,
  shouldSkipExternalConflictEvent,
} from "./calendarConflictUtils";

describe("calendarConflictUtils", () => {
  it("collectWroketCalendarEventIds gathers non-null calendarEventId values", () => {
    const ids = collectWroketCalendarEventIds([
      { scheduledSlot: { calendarEventId: "evt-a" } },
      { scheduledSlot: { calendarEventId: null } },
      { scheduledSlot: null },
      { scheduledSlot: { calendarEventId: "evt-b" } },
    ]);
    expect(ids.size).toBe(2);
    expect(ids.has("evt-a")).toBe(true);
    expect(ids.has("evt-b")).toBe(true);
  });

  it("shouldSkipExternalConflictEvent skips ids already on a Wroket task", () => {
    const wroketIds = new Set(["evt-a", "evt-b"]);
    expect(shouldSkipExternalConflictEvent("evt-a", wroketIds)).toBe(true);
    expect(shouldSkipExternalConflictEvent("evt-other", wroketIds)).toBe(false);
  });
});
