/**
 * Unit tests for shared chat-channel socle.
 */

import { describe, expect, it } from "vitest";

import {
  actionIdToTaskAction,
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

  it("maps action ids including short verbs", () => {
    expect(actionIdToTaskAction("wroket_accept")).toBe("accept");
    expect(actionIdToTaskAction("accept")).toBe("accept");
    expect(actionIdToTaskAction("complete")).toBe("complete");
    expect(actionIdToTaskAction("other")).toBeNull();
  });
});

describe("chatChannel slash help", () => {
  it("includes PMO verbs", () => {
    const help = slashHelpTextForPrefix("/wroket");
    expect(help).toContain("my-week");
    expect(help).toContain("overdue");
    expect(help).toContain("team-risk");
  });
});
