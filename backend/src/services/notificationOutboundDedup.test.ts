import { afterEach, describe, expect, it } from "vitest";

import { shouldSkipProfileChatDelivery } from "./notificationService";
import {
  _resetWebhooksForTests,
  upsertWebhook,
} from "./webhookService";
import {
  deleteSlackConnectionForUser,
  upsertSlackConnection,
} from "./slackConnectionService";

describe("shouldSkipProfileChatDelivery", () => {
  afterEach(() => {
    _resetWebhooksForTests();
    deleteSlackConnectionForUser("uid-dup");
  });

  it("skips profile Slack when OAuth + matching Slack webhook would already post", async () => {
    upsertSlackConnection({
      ownerUid: "uid-dup",
      ownerEmail: "a@test.local",
      accessToken: "xoxb-test",
      teamId: "T1",
      teamName: "Team",
      channelId: "C1",
      channelName: "general",
    });
    await upsertWebhook("uid-dup", {
      label: "Slack WH",
      url: "https://hooks.slack.com/services/T/B/X",
      platform: "slack",
      events: ["task_assigned"],
      enabled: true,
    });

    expect(
      shouldSkipProfileChatDelivery("uid-dup", "slack", "task_assigned", { todoId: "t1" }, null),
    ).toBe(true);
  });

  it("does not skip when no matching webhook", () => {
    upsertSlackConnection({
      ownerUid: "uid-dup",
      ownerEmail: "a@test.local",
      accessToken: "xoxb-test",
      teamId: "T1",
      teamName: "Team",
      channelId: "C1",
    });
    expect(
      shouldSkipProfileChatDelivery("uid-dup", "slack", "task_assigned", undefined, null),
    ).toBe(false);
  });

  it("skips when profile URL matches a webhook URL without OAuth", async () => {
    const url = "https://hooks.slack.com/services/T/B/Same";
    await upsertWebhook("uid-dup", {
      label: "Slack WH",
      url,
      platform: "slack",
      events: ["task_assigned"],
      enabled: true,
    });
    expect(
      shouldSkipProfileChatDelivery("uid-dup", "slack", "task_assigned", undefined, url),
    ).toBe(true);
  });

  it("does not skip different profile URL without OAuth", async () => {
    await upsertWebhook("uid-dup", {
      label: "Slack WH",
      url: "https://hooks.slack.com/services/T/B/A",
      platform: "slack",
      events: ["task_assigned"],
      enabled: true,
    });
    expect(
      shouldSkipProfileChatDelivery(
        "uid-dup",
        "slack",
        "task_assigned",
        undefined,
        "https://hooks.slack.com/services/T/B/B",
      ),
    ).toBe(false);
  });
});
