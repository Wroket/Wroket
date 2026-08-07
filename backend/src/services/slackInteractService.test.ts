import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { verifySlackSignature } from "./slackSignature";
import {
  actionIdToTaskAction,
  parseButtonValue,
  stripActionBlocks,
} from "./slackInteractService";
import { buildSlackTaskActionBlocks } from "./webhookService";

describe("verifySlackSignature", () => {
  const secret = "test_signing_secret";

  function sign(ts: string, body: string): string {
    const base = `v0:${ts}:${body}`;
    const digest = crypto.createHmac("sha256", secret).update(base, "utf8").digest("hex");
    return `v0=${digest}`;
  }

  it("accepts a valid signature within the time window", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "payload=%7B%7D";
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestampHeader: ts,
        signatureHeader: sign(ts, body),
        rawBody: body,
        nowSec: Number(ts),
      }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestampHeader: ts,
        signatureHeader: "v0=deadbeef",
        rawBody: "x=1",
        nowSec: Number(ts),
      }),
    ).toBe(false);
  });

  it("rejects an expired timestamp", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 10);
    const body = "a=b";
    expect(
      verifySlackSignature({
        signingSecret: secret,
        timestampHeader: ts,
        signatureHeader: sign(ts, body),
        rawBody: body,
        nowSec: Math.floor(Date.now() / 1000),
      }),
    ).toBe(false);
  });
});

describe("slackInteract helpers", () => {
  it("parses button values", () => {
    expect(parseButtonValue("todo1|uid1")).toEqual({ todoId: "todo1", targetUid: "uid1" });
    expect(parseButtonValue("bad")).toBeNull();
    expect(parseButtonValue(undefined)).toBeNull();
  });

  it("maps action_ids", () => {
    expect(actionIdToTaskAction("wroket_accept")).toBe("accept");
    expect(actionIdToTaskAction("wroket_decline")).toBe("decline");
    expect(actionIdToTaskAction("wroket_complete")).toBe("complete");
    expect(actionIdToTaskAction("other")).toBeNull();
  });

  it("strips actions blocks", () => {
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: "hi" } },
      { type: "actions", elements: [] },
    ];
    expect(stripActionBlocks(blocks)).toEqual([{ type: "section", text: { type: "mrkdwn", text: "hi" } }]);
  });
});

describe("buildSlackTaskActionBlocks", () => {
  it("adds accept/decline/complete for task_assigned", () => {
    const blocks = buildSlackTaskActionBlocks(
      "task_assigned",
      { todoId: "t1", assignmentStatus: "pending" },
      "uid-a",
    );
    expect(blocks).toHaveLength(1);
    const elements = (blocks[0] as { elements: Array<{ action_id: string; value: string }> }).elements;
    expect(elements.map((e) => e.action_id)).toEqual(
      expect.arrayContaining(["wroket_accept", "wroket_decline", "wroket_complete"]),
    );
    expect(elements[0]?.value).toBe("t1|uid-a");
  });

  it("adds complete for deadline_today", () => {
    const blocks = buildSlackTaskActionBlocks("deadline_today", { todoId: "t2" }, "uid-b");
    const elements = (blocks[0] as { elements: Array<{ action_id: string }> }).elements;
    expect(elements.map((e) => e.action_id)).toEqual(["wroket_complete"]);
  });

  it("returns empty without todoId or actor", () => {
    expect(buildSlackTaskActionBlocks("task_assigned", {}, "uid")).toEqual([]);
    expect(buildSlackTaskActionBlocks("task_assigned", { todoId: "t" }, undefined)).toEqual([]);
  });
});
