import { describe, expect, it } from "vitest";

import { mapGoogleMeetCreateError, toGoogleCalendarDateTime } from "./googleCalendarService";

describe("toGoogleCalendarDateTime", () => {
  it("converts UTC instant to Paris wall time (summer)", () => {
    // 2026-06-15 10:00 UTC → 12:00 CEST
    expect(toGoogleCalendarDateTime("2026-06-15T10:00:00.000Z", "Europe/Paris")).toBe("2026-06-15T12:00:00");
  });

  it("converts UTC instant to Paris wall time (winter)", () => {
    // 2026-01-15 10:00 UTC → 11:00 CET
    expect(toGoogleCalendarDateTime("2026-01-15T10:00:00.000Z", "Europe/Paris")).toBe("2026-01-15T11:00:00");
  });

  it("returns input unchanged for invalid ISO", () => {
    expect(toGoogleCalendarDateTime("not-a-date", "Europe/Paris")).toBe("not-a-date");
  });
});

describe("googleCalendarService — meet error mapping", () => {
  it("maps external invite policy errors", () => {
    const raw = 'Google Meet create failed (403): {"error":{"status":"PERMISSION_DENIED","message":"forbiddenForNonOrganizer"}}';
    expect(mapGoogleMeetCreateError(raw)).toMatch(/invités externes/i);
  });

  it("maps generic permission denied errors", () => {
    const raw = 'Google Meet create failed (403): {"error":{"code":403,"message":"Insufficient Permission"}}';
    expect(mapGoogleMeetCreateError(raw)).toMatch(/permissions/i);
  });

  it("maps invalid invitee errors", () => {
    const raw = 'Google Meet create failed (400): {"error":{"message":"Invalid attendees"}}';
    expect(mapGoogleMeetCreateError(raw)).toMatch(/invités/i);
  });

  it("maps calendar not found errors", () => {
    const raw = 'Google Meet create failed (404): {"error":{"message":"Not Found"}}';
    expect(mapGoogleMeetCreateError(raw)).toMatch(/calendrier/i);
  });

  it("falls back to generic user-safe message", () => {
    const raw = "Google Meet create failed (500): random unknown failure";
    expect(mapGoogleMeetCreateError(raw)).toMatch(/erreur google calendar/i);
  });
});
