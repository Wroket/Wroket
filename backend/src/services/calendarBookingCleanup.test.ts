import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import * as google from "./googleCalendarService";
import * as ms from "./microsoftCalendarService";
import type { Todo } from "./todoService";

describe("scheduleExternalCleanupForFutureSlots", () => {
  const futureStart = new Date(Date.now() + 3_600_000).toISOString();
  const pastStart = new Date(Date.now() - 3_600_000).toISOString();

  beforeEach(() => {
    vi.spyOn(google, "deleteGoogleCalendarEvent").mockResolvedValue(true);
    vi.spyOn(ms, "deleteMicrosoftCalendarEvent").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Google delete for future slots with calendarEventId", async () => {
    const { scheduleExternalCleanupForFutureSlots } = await import("./calendarBookingCleanup");
    const todo: Todo = {
      id: "t1",
      userId: "u1",
      title: "x",
      status: "active",
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scheduledSlot: {
        start: futureStart,
        end: futureStart,
        calendarEventId: "ev1",
        bookingCalendarId: "primary",
        bookingAccountId: "acc1",
        bookingProvider: "google",
      },
    } as Todo;

    scheduleExternalCleanupForFutureSlots([todo]);
    await vi.waitFor(() => {
      expect(google.deleteGoogleCalendarEvent).toHaveBeenCalled();
    });
    expect(ms.deleteMicrosoftCalendarEvent).not.toHaveBeenCalled();
  });

  it("skips past slots and todos without linked event", async () => {
    const { scheduleExternalCleanupForFutureSlots } = await import("./calendarBookingCleanup");
    const past: Todo = {
      id: "t-past",
      userId: "u1",
      title: "p",
      status: "active",
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scheduledSlot: {
        start: pastStart,
        end: pastStart,
        calendarEventId: "ev-old",
        bookingProvider: "google",
      },
    } as Todo;
    const noEvent: Todo = {
      id: "t-none",
      userId: "u1",
      title: "n",
      status: "active",
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scheduledSlot: { start: futureStart, end: futureStart, calendarEventId: null },
    } as Todo;

    scheduleExternalCleanupForFutureSlots([past, noEvent]);
    await new Promise((r) => setTimeout(r, 50));
    expect(google.deleteGoogleCalendarEvent).not.toHaveBeenCalled();
  });

  it("calls Microsoft delete for future Outlook-linked slots", async () => {
    const { scheduleExternalCleanupForFutureSlots } = await import("./calendarBookingCleanup");
    const todo: Todo = {
      id: "t-ms",
      userId: "u1",
      title: "m",
      status: "active",
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scheduledSlot: {
        start: futureStart,
        end: futureStart,
        calendarEventId: "ev-ms",
        bookingCalendarId: "cal1",
        bookingAccountId: "ms-acc",
        bookingProvider: "microsoft",
      },
    } as Todo;

    scheduleExternalCleanupForFutureSlots([todo]);
    await vi.waitFor(() => {
      expect(ms.deleteMicrosoftCalendarEvent).toHaveBeenCalled();
    });
  });
});
