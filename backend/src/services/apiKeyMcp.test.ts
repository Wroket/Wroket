import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  process.env.USE_LOCAL_STORE = "true";
  // Must be set before persistence is imported (STORE_PATH is captured at load time).
  process.env.LOCAL_STORE_PATH = path.join(
    os.tmpdir(),
    `wroket-mcp-test-hoisted-${process.pid}.json`,
  );
});

const resolvedTestStore =
  process.env.LOCAL_STORE_PATH ||
  path.join(os.tmpdir(), `wroket-mcp-test-fallback-${process.pid}.json`);

import { initStore } from "../persistence";
import {
  apiKeyHasScope,
  authenticateApiKey,
  createApiKeyForUser,
  listApiKeysForUser,
  register,
  revokeApiKeyForUser,
  type ApiKeyScope,
} from "./authService";
import { createProject, addPhase } from "./projectService";
import { executeMcpTool, MCP_TOOL_DEFS } from "./mcp";
import { createTodo } from "./todoService";

describe("API keys + MCP tools v1.1", () => {
  beforeAll(async () => {
    fs.writeFileSync(resolvedTestStore, "{}", "utf-8");
    await initStore();
  });

  it("exposes the v1.1 tool surface", () => {
    const names = MCP_TOOL_DEFS.map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_todos",
        "move_todo",
        "get_project",
        "list_project_phases",
        "list_notes",
        "create_note",
        "list_comments",
        "add_comment",
        "propose_slots",
        "book_task_slot",
        "clear_task_slot",
      ]),
    );
    expect(names.length).toBeGreaterThanOrEqual(16);
  });

  it("hashes secrets and authenticates with timing-safe compare", () => {
    const { uid } = register({
      email: `mcp-key-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createApiKeyForUser(uid, "Cursor");
    expect(created.key.startsWith("wrk_live_")).toBe(true);
    expect(created.prefix).toBe(created.key.slice(0, 16));

    const listed = listApiKeysForUser(uid);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("key");
    expect(listed[0]).not.toHaveProperty("keyHash");

    const ok = authenticateApiKey(`Bearer ${created.key}`);
    expect(ok?.user.uid).toBe(uid);
    expect(ok?.keyId).toBe(created.id);
    expect(ok?.scopes).toContain("todos:read");
    expect(ok?.scopes).toContain("notes:write");

    expect(authenticateApiKey(`Bearer ${created.key}x`)).toBeNull();
    expect(authenticateApiKey("Bearer wrk_live_nope")).toBeNull();
  });

  it("revocation invalidates the key immediately", () => {
    const { uid } = register({
      email: `mcp-rev-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createApiKeyForUser(uid, "Temp");
    revokeApiKeyForUser(uid, created.id);
    expect(listApiKeysForUser(uid)).toHaveLength(0);
    expect(authenticateApiKey(`Bearer ${created.key}`)).toBeNull();
  });

  it("authorize scope helper", () => {
    const scopes: ApiKeyScope[] = ["todos:read"];
    expect(apiKeyHasScope(scopes, "todos:read")).toBe(true);
    expect(apiKeyHasScope(scopes, "todos:write")).toBe(false);
    expect(apiKeyHasScope(scopes, "notes:read")).toBe(false);
  });

  it("executeMcpTool todos / projects / notes / comments happy path", async () => {
    const user = register({
      email: `mcp-tool-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createApiKeyForUser(user.uid, "Agent");
    const auth = authenticateApiKey(`Bearer ${created.key}`);
    expect(auth).not.toBeNull();

    const result = await executeMcpTool(auth!.user, auth!.scopes, "list_todos", { limit: 10 });
    expect(result).toMatchObject({ todos: expect.any(Array), total: expect.any(Number) });

    await expect(
      executeMcpTool(auth!.user, ["todos:read"], "create_todo", { title: "Nope" }),
    ).rejects.toMatchObject({ code: "API_KEY_SCOPE" });

    const project = createProject(user.uid, user.email, { name: "MCP Project" });
    const phase = addPhase(project.id, { name: "Doing" });

    const projects = (await executeMcpTool(auth!.user, auth!.scopes, "list_projects", {})) as {
      projects: Array<{ id: string }>;
    };
    expect(projects.projects.some((p) => p.id === project.id)).toBe(true);

    const phases = (await executeMcpTool(auth!.user, auth!.scopes, "list_project_phases", {
      projectId: project.id,
    })) as { phases: Array<{ id: string; name: string }> };
    expect(phases.phases.map((p) => p.id)).toContain(phase.id);

    const createdTodo = (await executeMcpTool(auth!.user, auth!.scopes, "create_todo", {
      title: "MCP smoke task",
      priority: "low",
      projectId: project.id,
      phaseId: phase.id,
      tags: ["mcp"],
    })) as { id: string; title: string; phaseId: string | null; tags: string[] };
    expect(createdTodo.title).toBe("MCP smoke task");
    expect(createdTodo.phaseId).toBe(phase.id);
    expect(createdTodo.tags).toContain("mcp");

    const moved = (await executeMcpTool(auth!.user, auth!.scopes, "move_todo", {
      id: createdTodo.id,
      phaseId: phase.id,
      strategy: "keepDates",
    })) as { id: string };
    expect(moved.id).toBe(createdTodo.id);

    const note = (await executeMcpTool(auth!.user, auth!.scopes, "create_note", {
      title: "Decision",
      content: "Ship MCP v1.1",
      todoId: createdTodo.id,
    })) as { id: string; todoId: string | null };
    expect(note.todoId).toBe(createdTodo.id);

    await expect(
      executeMcpTool(auth!.user, ["notes:read"], "create_note", { title: "Nope" }),
    ).rejects.toMatchObject({ code: "API_KEY_SCOPE" });

    const comment = (await executeMcpTool(auth!.user, auth!.scopes, "add_comment", {
      todoId: createdTodo.id,
      text: "Looks good",
    })) as { text: string };
    expect(comment.text).toBe("Looks good");

    const comments = (await executeMcpTool(auth!.user, auth!.scopes, "list_comments", {
      todoId: createdTodo.id,
    })) as { comments: unknown[] };
    expect(comments.comments.length).toBeGreaterThanOrEqual(1);
  });

  it("propose_slots / book_task_slot / clear_task_slot happy path (in-app)", async () => {
    const user = register({
      email: `mcp-cal-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createApiKeyForUser(user.uid, "Cal");
    const auth = authenticateApiKey(`Bearer ${created.key}`);
    expect(auth).not.toBeNull();

    const todo = await createTodo(user.uid, user.email, {
      title: "Slot me",
      priority: "medium",
      effort: "light",
    });

    const proposed = (await executeMcpTool(auth!.user, auth!.scopes, "propose_slots", {
      todoId: todo.id,
    })) as { slots: Array<{ start: string; end: string }> };
    expect(Array.isArray(proposed.slots)).toBe(true);

    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);

    const booked = (await executeMcpTool(auth!.user, auth!.scopes, "book_task_slot", {
      todoId: todo.id,
      start: start.toISOString(),
      end: end.toISOString(),
    })) as { booked?: boolean; conflict?: boolean; todo?: { scheduledSlot: { start: string } | null } };
    expect(booked.conflict).not.toBe(true);
    expect(booked.booked).toBe(true);
    expect(booked.todo?.scheduledSlot?.start).toBe(start.toISOString());

    const cleared = (await executeMcpTool(auth!.user, auth!.scopes, "clear_task_slot", {
      todoId: todo.id,
    })) as { cleared: boolean; todo: { scheduledSlot: unknown } };
    expect(cleared.cleared).toBe(true);
    expect(cleared.todo.scheduledSlot).toBeNull();

    await expect(
      executeMcpTool(auth!.user, ["todos:read"], "book_task_slot", {
        todoId: todo.id,
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "API_KEY_SCOPE" });
  });
});
