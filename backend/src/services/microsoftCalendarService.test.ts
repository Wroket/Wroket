import { describe, expect, it } from "vitest";

import {
  buildMicrosoftTeamsEventBody,
  mapMicrosoftTeamsMeetCreateError,
} from "./microsoftCalendarService";

describe("buildMicrosoftTeamsEventBody", () => {
  it("includes a clickable join link when joinUrl is provided", () => {
    const body = buildMicrosoftTeamsEventBody("Réunion client", "https://teams.microsoft.com/l/meetup-join/abc");
    expect(body.contentType).toBe("HTML");
    expect(body.content).toContain("https://teams.microsoft.com/l/meetup-join/abc");
    expect(body.content).toContain("<a href=");
    expect(body.content).toContain("Réunion client");
  });

  it("escapes HTML in the description", () => {
    const body = buildMicrosoftTeamsEventBody("<script>alert(1)</script>", undefined);
    expect(body.content).not.toContain("<script>");
    expect(body.content).toContain("&lt;script&gt;");
  });
});

describe("mapMicrosoftTeamsMeetCreateError", () => {
  it("maps external guest policy errors", () => {
    expect(mapMicrosoftTeamsMeetCreateError("External guests are not allowed")).toMatch(/invités externes/i);
  });

  it("maps attendee rejection errors", () => {
    expect(mapMicrosoftTeamsMeetCreateError('{"error":{"message":"Invalid attendee"}}')).toMatch(/rejetés/i);
  });

  it("maps invitation send failures", () => {
    expect(mapMicrosoftTeamsMeetCreateError("Failed to send Teams meeting invitations to attendees")).toMatch(/invitation/i);
  });
});
