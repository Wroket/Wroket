import { describe, expect, it } from "vitest";

import { discordSlashHelp, parseDiscordCustomId } from "./discordInteractService";

describe("discordInteractService", () => {
  it("parses custom_id formats", () => {
    expect(parseDiscordCustomId("wroket_accept:t1|u1")).toEqual({
      action: "accept",
      todoId: "t1",
      targetUid: "u1",
    });
    expect(parseDiscordCustomId("wroket_complete|t2|u2")).toEqual({
      action: "complete",
      todoId: "t2",
      targetUid: "u2",
    });
    expect(parseDiscordCustomId("bad")).toBeNull();
  });

  it("help includes PMO", () => {
    expect(discordSlashHelp()).toContain("my-week");
  });
});
