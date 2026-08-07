/**
 * Teams interact helpers tests.
 */

import { describe, expect, it } from "vitest";

import { parseTeamsTaskSubmit, teamsSlashHelp } from "./teamsInteractService";

describe("teamsInteractService", () => {
  it("parses Adaptive Card submit payloads", () => {
    expect(
      parseTeamsTaskSubmit({ action: "wroket_accept", todoId: "t1", targetUid: "u1" }),
    ).toEqual({ action: "accept", todoId: "t1", targetUid: "u1" });
    expect(parseTeamsTaskSubmit({ action: "accept", value: "t2|u2" })).toEqual({
      action: "accept",
      todoId: "t2",
      targetUid: "u2",
    });
    expect(parseTeamsTaskSubmit({})).toBeNull();
  });

  it("help lists PMO commands", () => {
    const h = teamsSlashHelp();
    expect(h).toContain("my-week");
    expect(h).toContain("team-risk");
  });
});
