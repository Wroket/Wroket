import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const f = require("node:fs") as typeof import("node:fs");
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = join(tmpdir(), `wroket-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  f.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
});

import { applySyncDiff, computeSyncDiff, type SyncSnapshot } from "./externalSyncService";
import * as authService from "./authService";
import { getProjectById } from "./projectService";
import { listProjectTodos, updateTodo, _resetTodosForTests, type Todo } from "./todoService";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Builds a fresh snapshot with a unique external identity per test. */
function makeSnapshot(overrides?: Partial<SyncSnapshot>): SyncSnapshot {
  const extId = `notion-test:${Math.random().toString(36).slice(2, 12)}`;
  return {
    provider: "notion",
    projectExternalId: extId,
    projectName: "Roadmap",
    phases: [
      { externalId: "todo", name: "À faire", order: 0 },
      { externalId: "doing", name: "En cours", order: 1 },
    ],
    tasks: [
      {
        externalId: `${extId}:t1`,
        phaseExternalId: "todo",
        title: "Cadrer le besoin",
        priority: "medium",
        effort: "medium",
        status: "active",
        startDate: null,
        deadline: null,
        tags: ["specs"],
      },
      {
        externalId: `${extId}:t2`,
        phaseExternalId: "doing",
        title: "Maquetter",
        priority: "high",
        effort: "heavy",
        status: "active",
        startDate: null,
        deadline: null,
        tags: [],
      },
    ],
    ...overrides,
  };
}

async function taskByTitle(projectId: string, title: string): Promise<Todo | undefined> {
  return (await listProjectTodos(projectId)).find((t) => t.title === title);
}

describe("externalSyncService", () => {
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

  it("creates project, phases and tasks on first sync", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();

    const preview = await computeSyncDiff(owner, "owner@test.com", snap);
    expect(preview.project.action).toBe("create");
    expect(preview.phases.create).toHaveLength(2);
    expect(preview.tasks.create).toHaveLength(2);

    const res = await applySyncDiff(owner, "owner@test.com", snap);
    expect(res.projectCreated).toBe(true);
    expect(res.phasesCreated).toBe(2);
    expect(res.tasksCreated).toBe(2);

    const project = getProjectById(res.projectId)!;
    expect(project.name).toBe("Roadmap");
    expect(project.externalRef?.externalId).toBe(snap.projectExternalId);
    expect((await listProjectTodos(project.id))).toHaveLength(2);
  });

  it("is idempotent: re-syncing the same snapshot creates no duplicates", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();

    const first = await applySyncDiff(owner, "owner@test.com", snap);
    const second = await applySyncDiff(owner, "owner@test.com", snap);

    expect(second.projectCreated).toBe(false);
    expect(second.projectId).toBe(first.projectId);
    expect(second.tasksCreated).toBe(0);
    expect(second.phasesCreated).toBe(0);
    expect((await listProjectTodos(first.projectId))).toHaveLength(2);
    expect(getProjectById(first.projectId)!.phases).toHaveLength(2);
  });

  it("bounded mirror: updates source fields but preserves local-only fields", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();
    const res = await applySyncDiff(owner, "owner@test.com", snap);

    // User locally tweaks a non-mirror field (sortOrder) on the mirrored task.
    const t1 = (await taskByTitle(res.projectId, "Cadrer le besoin"))!;
    await updateTodo(owner, "owner@test.com", t1.id, { sortOrder: 42 });

    // Source changes the title + priority (mirror-owned fields).
    const snap2 = makeSnapshot({
      projectExternalId: snap.projectExternalId,
      projectName: snap.projectName,
      phases: snap.phases,
      tasks: [
        { ...snap.tasks[0], title: "Cadrer le besoin (révisé)", priority: "high" },
        snap.tasks[1],
      ],
    });

    const preview = await computeSyncDiff(owner, "owner@test.com", snap2);
    const t1Update = preview.tasks.update.find((u) => u.internalId === t1.id);
    expect(t1Update?.changedFields).toEqual(expect.arrayContaining(["title", "priority"]));

    await applySyncDiff(owner, "owner@test.com", snap2);

    const updated = (await listProjectTodos(res.projectId)).find((t) => t.id === t1.id)!;
    expect(updated.title).toBe("Cadrer le besoin (révisé)");
    expect(updated.priority).toBe("high");
    // Local-only field untouched by the bounded mirror.
    expect(updated.sortOrder).toBe(42);
  });

  it("orphans are preserved (never deleted) when removed from the source", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();
    const res = await applySyncDiff(owner, "owner@test.com", snap);

    // Source drops the second task.
    const snap2 = makeSnapshot({
      projectExternalId: snap.projectExternalId,
      projectName: snap.projectName,
      phases: snap.phases,
      tasks: [snap.tasks[0]],
    });

    const preview = await computeSyncDiff(owner, "owner@test.com", snap2);
    expect(preview.tasks.orphans).toHaveLength(1);
    expect(preview.tasks.orphans[0].label).toBe("Maquetter");

    const res2 = await applySyncDiff(owner, "owner@test.com", snap2);
    expect(res2.orphanTasks).toBe(1);
    // The orphaned task still exists in Wroket.
    expect(await taskByTitle(res.projectId, "Maquetter")).toBeTruthy();
  });

  it("phase rename produces a new phase and orphans the old one", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();
    const res = await applySyncDiff(owner, "owner@test.com", snap);
    expect(getProjectById(res.projectId)!.phases).toHaveLength(2);

    // "doing" status renamed in the source -> new normalized key.
    const snap2 = makeSnapshot({
      projectExternalId: snap.projectExternalId,
      projectName: snap.projectName,
      phases: [
        { externalId: "todo", name: "À faire", order: 0 },
        { externalId: "in-review", name: "En revue", order: 1 },
      ],
      tasks: [
        snap.tasks[0],
        { ...snap.tasks[1], phaseExternalId: "in-review" },
      ],
    });

    const preview = await computeSyncDiff(owner, "owner@test.com", snap2);
    expect(preview.phases.create.map((c) => c.externalId)).toContain("in-review");
    expect(preview.phases.orphans.map((o) => o.label)).toContain("En cours");

    const res2 = await applySyncDiff(owner, "owner@test.com", snap2);
    expect(res2.phasesCreated).toBe(1);
    expect(res2.orphanPhases).toBe(1);
    // Old phase kept, new phase added.
    expect(getProjectById(res.projectId)!.phases).toHaveLength(3);
  });

  it("does not duplicate when targeting by external ref across runs with edits", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();
    await applySyncDiff(owner, "owner@test.com", snap);

    // Add a brand-new task in the source.
    const snap2 = makeSnapshot({
      projectExternalId: snap.projectExternalId,
      projectName: "Roadmap renommée",
      phases: snap.phases,
      tasks: [
        ...snap.tasks,
        {
          externalId: `${snap.projectExternalId}:t3`,
          phaseExternalId: "todo",
          title: "Nouvelle tâche",
          priority: "low",
          effort: "light",
          status: "active",
          startDate: null,
          deadline: null,
          tags: [],
        },
      ],
    });

    const res2 = await applySyncDiff(owner, "owner@test.com", snap2);
    expect(res2.tasksCreated).toBe(1);
    expect((await listProjectTodos(res2.projectId))).toHaveLength(3);
    // Project name mirrored.
    expect(getProjectById(res2.projectId)!.name).toBe("Roadmap renommée");
  });

  it("create_new mode always creates a separate project even when external ref exists", async () => {
    const owner = uid("owner");
    const snap = makeSnapshot();
    const first = await applySyncDiff(owner, "owner@test.com", snap, { importMode: "merge" });

    const second = await applySyncDiff(owner, "owner@test.com", snap, { importMode: "create_new" });

    expect(second.projectId).not.toBe(first.projectId);
    expect(second.projectCreated).toBe(true);
    expect(second.tasksCreated).toBe(2);
    expect((await listProjectTodos(first.projectId))).toHaveLength(2);
    expect((await listProjectTodos(second.projectId))).toHaveLength(2);
  });

  it("extends existing select custom field options on re-sync", async () => {
    const entSpy = vi.spyOn(authService, "getEntitlementsForUid").mockReturnValue({
      integrations: true,
      teamReporting: false,
    });

    const owner = uid("owner");
    const extId = `notion-select:${Math.random().toString(36).slice(2, 12)}`;
    const snap1: SyncSnapshot = {
      provider: "notion",
      projectExternalId: extId,
      projectName: "Select test",
      phases: [{ externalId: "todo", name: "Todo", order: 0 }],
      tasks: [
        {
          externalId: `${extId}:t1`,
          phaseExternalId: "todo",
          title: "One",
          priority: "medium",
          effort: "medium",
          status: "active",
          startDate: null,
          deadline: null,
          tags: [],
          customFieldValues: { "notion-prop:dept": "Sales" },
        },
      ],
      customFieldDefs: [
        { externalKey: "notion-prop:dept", name: "Department", type: "select", options: ["Sales"] },
      ],
    };

    const res1 = await applySyncDiff(owner, "owner@test.com", snap1);
    const project = getProjectById(res1.projectId)!;
    const fieldId = project.customFieldDefs?.[0]?.id;
    expect(fieldId).toBeTruthy();
    expect(project.customFieldDefs?.[0]?.options).toEqual(["Sales"]);

    const snap2: SyncSnapshot = {
      ...snap1,
      tasks: [
        {
          ...snap1.tasks[0],
          customFieldValues: { "notion-prop:dept": "Engineering" },
        },
        {
          externalId: `${extId}:t2`,
          phaseExternalId: "todo",
          title: "Two",
          priority: "medium",
          effort: "medium",
          status: "active",
          startDate: null,
          deadline: null,
          tags: [],
          customFieldValues: { "notion-prop:dept": "Engineering" },
        },
      ],
      customFieldDefs: [
        { externalKey: "notion-prop:dept", name: "Department", type: "select", options: ["Sales", "Engineering"] },
      ],
    };

    await applySyncDiff(owner, "owner@test.com", snap2);
    const updated = getProjectById(res1.projectId)!;
    expect(updated.customFieldDefs?.[0]?.options).toEqual(["Sales", "Engineering"]);
    expect((await listProjectTodos(res1.projectId))).toHaveLength(2);
    entSpy.mockRestore();
  });

  it("mirrors Notion description as a task comment on sync", async () => {
    const owner = uid("owner");
    const extId = `notion-desc:${Math.random().toString(36).slice(2, 12)}`;
    const snap: SyncSnapshot = {
      provider: "notion",
      projectExternalId: extId,
      projectName: "Desc test",
      phases: [{ externalId: "todo", name: "Todo", order: 0 }],
      tasks: [
        {
          externalId: `${extId}:t1`,
          phaseExternalId: "todo",
          title: "With description",
          priority: "medium",
          effort: "medium",
          status: "active",
          startDate: null,
          deadline: "2026-07-01",
          tags: [],
          description: "Hello from Notion",
        },
      ],
    };

    const res = await applySyncDiff(owner, "owner@test.com", snap);
    const { listComments } = await import("./commentService");
    const comments = listComments((await listProjectTodos(res.projectId))[0]!.id);
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe("Hello from Notion");
    expect(comments[0].mirroredFrom).toBe("notion-description");
  });
});
