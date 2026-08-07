import { describe, expect, it } from "vitest";

import {
  googleChatSlashHelp,
  parseGoogleChatCardAction,
} from "./googleChatInteractService";

describe("googleChatInteractService", () => {
  it("parses card action parameters", () => {
    expect(
      parseGoogleChatCardAction({
        action: "complete",
        todoId: "t1",
        targetUid: "u1",
      }),
    ).toEqual({ action: "complete", todoId: "t1", targetUid: "u1" });
    expect(parseGoogleChatCardAction({ action: "accept", value: "a|b" })).toEqual({
      action: "accept",
      todoId: "a",
      targetUid: "b",
    });
  });

  it("help includes PMO", () => {
    expect(googleChatSlashHelp()).toContain("overdue");
  });
});
