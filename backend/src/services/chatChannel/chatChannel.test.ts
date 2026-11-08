/**
 * Unit tests for shared chat-channel socle.
 */

import { describe, expect, it } from "vitest";

import {
  actionIdToTaskAction,
  normalizeChatTodoId,
  parseButtonValue,
  resolveUserFromChatEmail,
  slashHelpTextForPrefix,
} from "./index";

describe("chatChannel resolveUserFromChatEmail", () => {
  it("rejects missing email", () => {
    const r = resolveUserFromChatEmail(null);
    expect("error" in r).toBe(true);
  });

  it("rejects email without account", () => {
    const r = resolveUserFromChatEmail("nobody-does-not-exist@example.invalid");
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/Aucun compte Wroket/);
  });
});

describe("chatChannel task action helpers", () => {
  it("parses button values", () => {
    expect(parseButtonValue("todo1|uid1")).toEqual({ todoId: "todo1", targetUid: "uid1" });
    expect(parseButtonValue("bad")).toBeNull();
  });

  it("normalizes pasted todo ids from Slack mrkdwn", () => {
    expect(normalizeChatTodoId("`a8f31ed5-f6d4-41f2-a55a-8af43803913a`")).toBe(
      "a8f31ed5-f6d4-41f2-a55a-8af43803913a",
    );
    expect(normalizeChatTodoId("\u200ba8f31ed5-f6d4-41f2-a55a-8af43803913a\u200b")).toBe(
      "a8f31ed5-f6d4-41f2-a55a-8af43803913a",
    );
    expect(normalizeChatTodoId("a8f31ed5\u2013f6d4\u201341f2\u2013a55a\u20138af43803913a")).toBe(
      "a8f31ed5-f6d4-41f2-a55a-8af43803913a",
    );
  });

  it("maps action ids including short verbs", () => {
    expect(actionIdToTaskAction("wroket_accept")).toBe("accept");
    expect(actionIdToTaskAction("accept")).toBe("accept");
    expect(actionIdToTaskAction("complete")).toBe("complete");
    expect(actionIdToTaskAction("other")).toBeNull();
  });
});

describe("chatChannel slash help", () => {
  it("includes PMO, add, plan, and timer verbs", () => {
    const help = slashHelpTextForPrefix("/wroket");
    expect(help).toContain("my-week");
    expect(help).toContain("overdue");
    expect(help).toContain("team-risk");
    expect(help).toContain("add <titre>");
    expect(help).toContain("plan <todoId>");
    expect(help).toContain("timer");
  });
});
