/**
 * Tasks spawned from a note keep the note as a document (`todoId` untouched)
 * and do not duplicate the same node key.
 */
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  process.env.USE_LOCAL_STORE = "true";
  const persistence = await import("../persistence");
  await persistence.initStore();
});

function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("spawnTasksFromNote", () => {
  it("creates tasks with originNoteId and leaves note.todoId empty", async () => {
    const notes = await import("./noteService");
    const spawn = await import("./noteSpawnService");
    const todos = await import("./todoService");
    const uid = uniq("owner");
    const note = notes.createNote(uid, { title: "Compte rendu", content: "<p>TODO faire</p>" });

    const result = await spawn.spawnTasksFromNote(uid, `${uid}@test.com`, note.id, {
      items: [
        { clientKey: "l0", title: "Faire", deadline: "2099-01-15", priority: "high" },
        { clientKey: "l1", title: "Relire" },
      ],
    });

    expect(result.failed).toEqual([]);
    expect(result.created).toHaveLength(2);
    expect(result.dependenciesApplied).toBe(false);
    expect(notes.getNote(uid, note.id).todoId).toBeUndefined();

    const stored = await todos.listTodos(uid);
    expect(stored).toHaveLength(2);
    expect(stored.every((t) => t.originNoteId === note.id)).toBe(true);
    expect(stored.find((t) => t.originNodeId === "l0")?.priority).toBe("high");
    expect(stored.find((t) => t.originNodeId === "l0")?.deadline).toBe("2099-01-15T12:00:00");
  });

  it("returns the existing task when the same node is submitted again", async () => {
    const notes = await import("./noteService");
    const spawn = await import("./noteSpawnService");
    const uid = uniq("owner");
    const note = notes.createNote(uid, { title: "Suite", content: "" });
    const first = await spawn.spawnTasksFromNote(uid, `${uid}@test.com`, note.id, {
      items: [{ clientKey: "n1", title: "Étape" }],
    });
    const second = await spawn.spawnTasksFromNote(uid, `${uid}@test.com`, note.id, {
      items: [{ clientKey: "n1", title: "Étape renommée" }],
    });
    expect(second.created[0]?.alreadyExisted).toBe(true);
    expect(second.created[0]?.id).toBe(first.created[0]?.id);
    const listed = await spawn.listSpawnedTasks(uid, `${uid}@test.com`, note.id);
    expect(listed).toHaveLength(1);
  });

  it("skips dependencies when the account has no project entitlement", async () => {
    const notes = await import("./noteService");
    const spawn = await import("./noteSpawnService");
    const uid = uniq("owner");
    const note = notes.createNote(uid, { title: "Flux", content: "" });
    const result = await spawn.spawnTasksFromNote(uid, `${uid}@test.com`, note.id, {
      items: [
        { clientKey: "a", title: "A" },
        { clientKey: "b", title: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(result.created).toHaveLength(2);
    expect(result.dependenciesApplied).toBe(false);
    expect(result.dependencySkipped).toBe("DEPENDENCY_PROJECT_REQUIRED");
  });

  it("refuses a note the caller cannot edit", async () => {
    const notes = await import("./noteService");
    const spawn = await import("./noteSpawnService");
    const owner = uniq("owner");
    const note = notes.createNote(owner, { title: "Privée", content: "" });
    await expect(
      spawn.spawnTasksFromNote(uniq("other"), "other@test.com", note.id, {
        items: [{ clientKey: "a", title: "A" }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
