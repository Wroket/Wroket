import { describe, expect, it } from "vitest";

import { mapGoogleMeetCreateError } from "./googleCalendarService";

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
