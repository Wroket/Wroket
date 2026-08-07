import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _resetSlackConnectionsForTests,
  deleteSlackConnectionForUser,
  getSlackConnectionForUser,
  getSlackConnectionSummary,
  upsertSlackConnection,
} from "./slackConnectionService";

describe("slackConnectionService", () => {
  afterEach(() => {
    _resetSlackConnectionsForTests();
  });

  it("upserts and summarizes without exposing the token", () => {
    upsertSlackConnection({
      ownerUid: "u1",
      ownerEmail: "a@b.c",
      accessToken: "xoxb-secret",
      teamId: "T1",
      teamName: "Wroket",
      channelId: "C1",
      channelName: "#notifications-wroket",
    });
    const conn = getSlackConnectionForUser("u1");
    expect(conn?.accessToken).toBe("xoxb-secret");
    const summary = getSlackConnectionSummary("u1");
    expect(summary.connected).toBe(true);
    expect(summary.teamName).toBe("Wroket");
    expect(summary.channelId).toBe("C1");
    expect(JSON.stringify(summary)).not.toContain("xoxb");
  });

  it("delete removes the connection (disconnect)", () => {
    upsertSlackConnection({
      ownerUid: "u1",
      ownerEmail: "a@b.c",
      accessToken: "xoxb-secret",
      teamId: "T1",
      teamName: "Wroket",
      channelId: "C1",
    });
    const removed = deleteSlackConnectionForUser("u1");
    expect(removed?.accessToken).toBe("xoxb-secret");
    expect(getSlackConnectionForUser("u1")).toBeNull();
    expect(getSlackConnectionSummary("u1").connected).toBe(false);
  });
});

describe("tryPostViaSlackOAuth", () => {
  afterEach(() => {
    _resetSlackConnectionsForTests();
    vi.unstubAllGlobals();
  });

  it("returns false when not connected", async () => {
    const { tryPostViaSlackOAuth } = await import("./slackApiService");
    expect(await tryPostViaSlackOAuth("nobody", { text: "hi" })).toBe(false);
  });

  it("posts chat.postMessage when connected", async () => {
    upsertSlackConnection({
      ownerUid: "u1",
      ownerEmail: "a@b.c",
      accessToken: "xoxb-test",
      teamId: "T1",
      teamName: "Wroket",
      channelId: "C99",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { tryPostViaSlackOAuth } = await import("./slackApiService");
    const ok = await tryPostViaSlackOAuth("u1", {
      text: "hello",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "hi" } }],
    });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer xoxb-test" }),
      }),
    );
  });
});
