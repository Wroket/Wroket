import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import crypto from "crypto";

import { createTodo, deleteTodo, _resetTodosForTests } from "./todoService";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

describe("createTodo idempotent client id", () => {
  beforeAll(async () => {
    const { initStore } = await import("../persistence");
    await initStore();
  });

  beforeEach(() => {
    _resetTodosForTests();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("returns the same todo on duplicate POST with the same client id", async () => {
    const userId = uid("owner");
    const clientId = crypto.randomUUID();

    const first = await createTodo(userId, "owner@test.com", {
      id: clientId,
      title: "Envoyer CR visite",
      priority: "medium",
    });
    const second = await createTodo(userId, "owner@test.com", {
      id: clientId,
      title: "Different title ignored on replay",
      priority: "high",
    });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("Envoyer CR visite");
    expect(second.priority).toBe("medium");
  });

  it("creates distinct todos when client ids differ", async () => {
    const userId = uid("owner");

    const a = await createTodo(userId, "owner@test.com", {
      id: crypto.randomUUID(),
      title: "Same title",
      priority: "medium",
    });
    const b = await createTodo(userId, "owner@test.com", {
      id: crypto.randomUUID(),
      title: "Same title",
      priority: "medium",
    });

    expect(b.id).not.toBe(a.id);
  });

  it("ignores invalid client id and generates a server id", async () => {
    const userId = uid("owner");

    const todo = await createTodo(userId, "owner@test.com", {
      id: "not-a-uuid",
      title: "Task",
      priority: "medium",
    });

    expect(todo.id).not.toBe("not-a-uuid");
    expect(todo.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("allows recreate after soft-delete with the same client id", async () => {
    const userId = uid("owner");
    const clientId = crypto.randomUUID();

    const created = await createTodo(userId, "owner@test.com", {
      id: clientId,
      title: "To delete",
      priority: "medium",
    });
    await deleteTodo(userId, created.id);

    const recreated = await createTodo(userId, "owner@test.com", {
      id: clientId,
      title: "Recreated",
      priority: "low",
    });

    expect(recreated.id).toBe(clientId);
    expect(recreated.title).toBe("Recreated");
    expect(recreated.status).toBe("active");
  });
});
