import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import * as google from "./googleCalendarService";
import * as ms from "./microsoftCalendarService";
import type { Todo } from "./todoService";

function baseTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "todo-1",
    userId: "u1",
    parentId: null,
    projectId: null,
    phaseId: null,
    assignedTo: null,
    assignmentStatus: null,
    title: "Recurring task",
    priority: "medium",
    effort: "medium",
    estimatedMinutes: null,
    startDate: null,
    deadline: null,
    tags: [],
    status: "active",
    scheduledSlot: {
      start: "2026-06-15T10:00:00.000Z",
      end: "2026-06-15T11:00:00.000Z",
      calendarEventId: "ev-google",
      bookedByUid: "u1",
      bookingCalendarId: "primary",
      bookingAccountId: "acc1",
      bookingProvider: "google",
    },
    suggestedSlot: null,
    recurrence: { frequency: "weekly", interval: 1 },
    sortOrder: null,
    statusChangedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("syncTodoRecurrenceToExternalCalendar", () => {
  beforeEach(() => {
    vi.spyOn(google, "patchGoogleCalendarEvent").mockResolvedValue(true);
    vi.spyOn(ms, "patchMicrosoftCalendarEvent").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("patches Google when recurrence is present and no previous todo", async () => {
    const { syncTodoRecurrenceToExternalCalendar } = await import("./calendarRecurrenceSync");
    const todo = baseTodo();
    await syncTodoRecurrenceToExternalCalendar("u1", "u@example.com", todo, undefined, "Europe/Paris");

    expect(google.patchGoogleCalendarEvent).toHaveBeenCalledTimes(1);
    const args = vi.mocked(google.patchGoogleCalendarEvent).mock.calls[0];
    expect(args[1]).toBe("ev-google");
    expect(args[args.length - 1]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^RRULE:FREQ=WEEKLY/)]),
    );
    expect(ms.patchMicrosoftCalendarEvent).not.toHaveBeenCalled();
  });

  it("no-ops when recurrence unchanged and previous todo provided", async () => {
    const { syncTodoRecurrenceToExternalCalendar } = await import("./calendarRecurrenceSync");
    const todo = baseTodo();
    const previous = baseTodo();
    await syncTodoRecurrenceToExternalCalendar("u1", "u@example.com", todo, previous);

    expect(google.patchGoogleCalendarEvent).not.toHaveBeenCalled();
  });

  it("patches Google with null recurrence when recurrence removed", async () => {
    const { syncTodoRecurrenceToExternalCalendar } = await import("./calendarRecurrenceSync");
    const previous = baseTodo();
    const todo = baseTodo({ recurrence: null });
    await syncTodoRecurrenceToExternalCalendar("u1", "u@example.com", todo, previous);

    expect(google.patchGoogleCalendarEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(google.patchGoogleCalendarEvent).mock.calls[0].at(-1)).toBeNull();
  });

  it("patches Microsoft for Outlook-linked slots", async () => {
    const { syncTodoRecurrenceToExternalCalendar } = await import("./calendarRecurrenceSync");
    const todo = baseTodo({
      scheduledSlot: {
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-15T11:00:00.000Z",
        calendarEventId: "ev-ms",
        bookedByUid: "u1",
        bookingCalendarId: "cal1",
        bookingAccountId: "ms-acc",
        bookingProvider: "microsoft",
      },
    });
    await syncTodoRecurrenceToExternalCalendar("u1", "u@example.com", todo);

    expect(ms.patchMicrosoftCalendarEvent).toHaveBeenCalledTimes(1);
    expect(google.patchGoogleCalendarEvent).not.toHaveBeenCalled();
    const recurrenceArg = vi.mocked(ms.patchMicrosoftCalendarEvent).mock.calls[0].at(-1);
    expect(recurrenceArg).toMatchObject({
      pattern: { type: "weekly", interval: 1 },
    });
  });

  it("skips when no calendarEventId", async () => {
    const { syncTodoRecurrenceToExternalCalendar } = await import("./calendarRecurrenceSync");
    const todo = baseTodo({
      scheduledSlot: {
        start: "2026-06-15T10:00:00.000Z",
        end: "2026-06-15T11:00:00.000Z",
        calendarEventId: null,
      },
    });
    await syncTodoRecurrenceToExternalCalendar("u1", "u@example.com", todo);

    expect(google.patchGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(ms.patchMicrosoftCalendarEvent).not.toHaveBeenCalled();
  });
});
