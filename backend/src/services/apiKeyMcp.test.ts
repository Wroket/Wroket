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

  it("exposes MCP v2.0 PMO, project write, time tracking, collaboration & OKR tools", async () => {
    const names = MCP_TOOL_DEFS.map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "create_project",
        "update_project",
        "create_project_phase",
        "update_project_phase",
        "get_my_week",
        "get_overdue_tasks",
        "get_team_risk",
        "get_project_steering",
        "list_teams_and_collaborators",
        "assign_todo",
        "respond_task_assignment",
        "set_todo_blockers",
        "get_active_timer",
        "start_timer",
        "stop_timer",
        "log_time",
        "list_okrs",
        "update_key_result",
        "create_todos_batch",
        "delete_todo",
        "delete_project",
        "delete_project_phase",
        "seed_project_structure",
        "list_project_milestones",
        "create_project_milestone",
        "update_project_milestone",
        "delete_project_milestone",
        "list_calendar_events",
        "schedule_task_meeting",
        "delete_note",
        "search_workspace",
        "list_task_templates",
        "create_task_template",
        "delete_task_template",
        "create_todo_from_template",
        "create_team",
        "manage_team_member",
        "get_team_capacity",
        "create_okr",
        "delete_okr",
        "manage_project_custom_fields",
        "list_user_databases",
        "get_user_database",
        "create_user_database",
        "update_user_database",
        "delete_user_database",
        "add_database_row",
        "update_database_row",
        "delete_database_row",
        "list_contacts",
        "create_contact",
        "update_contact",
        "delete_contact",
        "list_automation_rules",
        "create_automation_rule",
        "update_automation_rule",
        "delete_automation_rule",
        "manage_project_share_links",
        "list_client_portals",
        "manage_client_portal",
      ]),
    );
    expect(names.length).toBe(77);

    const user = register({
      email: `mcp-v2-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createApiKeyForUser(user.uid, "MCP v2 Agent");
    const auth = authenticateApiKey(`Bearer ${created.key}`)!;
    expect(auth.scopes).toContain("projects:write");

    const proj = (await executeMcpTool(auth.user, auth.scopes, "create_project", {
      name: "V2 Project",
      description: "Created via MCP v2",
    })) as { id: string; name: string };
    expect(proj.name).toBe("V2 Project");

    const phase = (await executeMcpTool(auth.user, auth.scopes, "create_project_phase", {
      projectId: proj.id,
      name: "Sprint 1",
    })) as { id: string; name: string };
    expect(phase.name).toBe("Sprint 1");

    const milestone = (await executeMcpTool(auth.user, auth.scopes, "create_project_milestone", {
      projectId: proj.id,
      title: "Go-Live",
      date: "2026-12-01",
      phaseId: phase.id,
    })) as { id: string; title: string };
    expect(milestone.title).toBe("Go-Live");

    const batch = (await executeMcpTool(auth.user, auth.scopes, "create_todos_batch", {
      projectId: proj.id,
      phaseId: phase.id,
      tasks: [
        { title: "Batch task 1", estimatedMinutes: 45, subtasks: ["Sub 1A", "Sub 1B"] },
        { title: "Batch task 2", priority: "high" },
      ],
    })) as { createdCount: number; tasks: Array<{ id: string; subtasks?: unknown[] }> };
    expect(batch.createdCount).toBe(2);
    expect(batch.tasks[0]?.subtasks).toHaveLength(2);

    const deletedTodo = (await executeMcpTool(auth.user, auth.scopes, "delete_todo", {
      id: batch.tasks[1]!.id,
    })) as { deleted: boolean };
    expect(deletedTodo.deleted).toBe(true);

    const seeded = (await executeMcpTool(auth.user, auth.scopes, "seed_project_structure", {
      projectName: "Seeded via MCP",
      phases: [
        {
          name: "Discovery",
          tasks: [{ title: "User interviews", subtasks: [{ title: "Draft script" }] }],
        },
      ],
    })) as { projectId: string; phasesCreated: number; todosCreated: number };
    expect(seeded.phasesCreated).toBe(1);
    expect(seeded.todosCreated).toBe(2);

    const calEvents = (await executeMcpTool(auth.user, auth.scopes, "list_calendar_events", {})) as {
      wroketSlots: unknown[];
      externalEvents: unknown[];
    };
    expect(Array.isArray(calEvents.wroketSlots)).toBe(true);

    const steering = (await executeMcpTool(auth.user, auth.scopes, "get_project_steering", {
      projectId: proj.id,
    })) as { projectId: string; totalTasks: number };
    expect(steering.projectId).toBe(proj.id);

    const myWeek = (await executeMcpTool(auth.user, auth.scopes, "get_my_week", {})) as {
      summary: string;
    };
    expect(typeof myWeek.summary).toBe("string");

    const activeTimer = (await executeMcpTool(auth.user, auth.scopes, "get_active_timer", {})) as {
      active: boolean;
    };
    expect(activeTimer.active).toBe(false);

    const okrs = (await executeMcpTool(auth.user, auth.scopes, "list_okrs", {})) as {
      okrs: unknown[];
    };
    expect(Array.isArray(okrs.okrs)).toBe(true);

    const tpl = (await executeMcpTool(auth.user, auth.scopes, "create_task_template", {
      name: "Weekly Review",
      subtasks: ["Check KPIs", "Clear inbox"],
    })) as { id: string; name: string };
    expect(tpl.name).toBe("Weekly Review");

    const fromTpl = (await executeMcpTool(auth.user, auth.scopes, "create_todo_from_template", {
      templateId: tpl.id,
      projectId: proj.id,
    })) as { id: string; subtasks: unknown[] };
    expect(fromTpl.subtasks).toHaveLength(2);

    const searchRes = (await executeMcpTool(auth.user, auth.scopes, "search_workspace", {
      query: "Weekly",
    })) as { count: number; results: Array<{ type: string }> };
    expect(searchRes.count).toBeGreaterThanOrEqual(1);

    const team = (await executeMcpTool(auth.user, auth.scopes, "create_team", {
      name: "Core Squad",
    })) as { id: string; name: string };
    expect(team.name).toBe("Core Squad");

    // Lot C: User Databases & Contacts
    const dbRes = (await executeMcpTool(auth.user, auth.scopes, "create_user_database", {
      name: "CRM Leads",
      columns: [
        { name: "Company", type: "text" },
        { name: "DealSize", type: "number" },
        { name: "Stage", type: "select", options: ["Lead", "Won"] },
      ],
    })) as { database: { id: string; columns: Array<{ id: string; name: string }> } };
    expect(dbRes.database.columns).toHaveLength(3);

    const rowRes = (await executeMcpTool(auth.user, auth.scopes, "add_database_row", {
      databaseId: dbRes.database.id,
      values: { Company: "Acme Corp", DealSize: 12000, Stage: "Lead" },
    })) as { row: { id: string; values: Record<string, unknown> } };
    expect(Object.values(rowRes.row.values)).toContain("Acme Corp");

    const contactRes = (await executeMcpTool(auth.user, auth.scopes, "create_contact", {
      firstName: "Jean",
      lastName: "Dupont",
      company: "Acme Corp",
      email: "jean.dupont@acme.invalid",
    })) as { contact: { id: string; firstName: string } };
    expect(contactRes.contact.firstName).toBe("Jean");

    // Lot D: Share Links & Automations
    const shareRes = (await executeMcpTool(auth.user, auth.scopes, "manage_project_share_links", {
      action: "create",
      projectId: proj.id,
      label: "Client Preview",
      expiryDays: 30,
    })) as { created: boolean; publicUrl: string };
    expect(shareRes.created).toBe(true);
    expect(shareRes.publicUrl).toContain("/share/project/");

    const delProj = (await executeMcpTool(auth.user, auth.scopes, "delete_project", {
      id: seeded.projectId,
    })) as { deleted: boolean };
    expect(delProj.deleted).toBe(true);
  });
});
