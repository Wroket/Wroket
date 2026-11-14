/**
 * Unit tests for shared chat-channel socle.
 */

import { describe, expect, it } from "vitest";

import { register, setBillingPlanForUid } from "../authService";
import { createTodo } from "../todoService";
import {
  actionIdToTaskAction,
  handleSlashText,
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
  it("includes PMO, add, plan, timer, and assist Phase 2 verbs", () => {
    const help = slashHelpTextForPrefix("/wroket");
    expect(help).toContain("my-week");
    expect(help).toContain("overdue");
    expect(help).toContain("team-risk");
    expect(help).toContain("add <titre>");
    expect(help).toContain("plan <todoId>");
    expect(help).toContain("timer");
    expect(help).toContain("committee");
    expect(help).toContain("plan-week");
    expect(help).toContain("risks");
  });
});

describe("chatChannel slash timer verbs", () => {
  it("start → timer → stop → log on Small plan", async () => {
    const user = register({
      email: `slash-timer-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "small");
    const todo = await createTodo(user.uid, user.email, {
      title: "Slash timer task",
      priority: "medium",
    });

    const started = await handleSlashText({ actorUid: user.uid, text: `start ${todo.id}` });
    expect(started).toMatch(/Chrono démarré/);
    expect(started).toContain(todo.id);

    const status = await handleSlashText({ actorUid: user.uid, text: "timer" });
    expect(status).toMatch(/Chrono actif/);
    expect(status).toContain(todo.id);

    const stopped = await handleSlashText({ actorUid: user.uid, text: "stop" });
    expect(stopped).toMatch(/Chrono arrêté/);
    expect(stopped).toMatch(/min/);

    const logged = await handleSlashText({
      actorUid: user.uid,
      text: `log ${todo.id} 15 review`,
    });
    expect(logged).toMatch(/15 min/);
    expect(logged).toContain(todo.id);
  });

  it("start SoftLocks Free users with pricing CTA", async () => {
    const user = register({
      email: `slash-timer-free-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "free");
    const todo = await createTodo(user.uid, user.email, {
      title: "Free timer",
      priority: "low",
    });

    const msg = await handleSlashText({ actorUid: user.uid, text: `start ${todo.id}` });
    expect(msg).toMatch(/Impossible de démarrer/);
    expect(msg).toMatch(/Small teams|Early Bird|pricing/i);
  });
});
