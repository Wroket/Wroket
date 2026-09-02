import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import { createContact } from "./contactService";
import { createUserDatabase } from "./userDatabaseService";
import { createTodo, _resetTodosForTests } from "./todoService";
import { createNote } from "./noteService";
import { createProject } from "./projectService";
import { search } from "./searchService";

const UID = "user-search-test";
const EMAIL = "user-search-test@example.com";

beforeEach(() => {
  _resetTodosForTests();
  const store = getStore();
  store.contacts = {};
  store.userDatabases = {};
  store.userDatabaseRows = {};
  store.todos = {};
  store.users = {
    [UID]: { uid: UID, email: EMAIL, firstName: "Search", lastName: "Tester" },
  };
});

describe("searchService", () => {
  it("requires at least 3 characters", async () => {
    await createTodo(UID, EMAIL, { title: "Alpha task", priority: "medium" });
    expect(await search(UID, "al", EMAIL)).toEqual([]);
    expect(await search(UID, "  ab  ", EMAIL)).toEqual([]);
  });

  it("finds todos by title via todoService (not store.todos)", async () => {
    const todo = await createTodo(UID, EMAIL, { title: "Préparer le backlog", priority: "high" });
    const results = await search(UID, "backlog", EMAIL);
    expect(results.some((r) => r.type === "todo" && r.id === todo.id)).toBe(true);
  });

  it("finds todos and emits tag results", async () => {
    await createTodo(UID, EMAIL, {
      title: "Ship feature",
      priority: "medium",
      tags: ["Roadmap", "urgent"],
    });
    const results = await search(UID, "road", EMAIL);
    expect(results.some((r) => r.type === "todo" && r.title === "Ship feature")).toBe(true);
    // Tags are normalized to lowercase on create
    expect(results.some((r) => r.type === "tag" && r.id === "roadmap")).toBe(true);
  });

  it("finds projects and notes", async () => {
    const marker = `srch${Date.now().toString(36)}`;
    const project = createProject(UID, EMAIL, {
      name: `Site ${marker}`,
      description: "Landing",
    });
    const note = createNote(UID, {
      title: `Brief ${marker}`,
      content: `Contenu marketing ${marker}`,
    });

    const hits = await search(UID, marker, EMAIL);
    expect(hits.some((r) => r.type === "project" && r.id === project.id)).toBe(true);
    expect(hits.some((r) => r.type === "note" && r.id === note.id)).toBe(true);
  });

  it("finds contacts and databases by query", async () => {
    createContact(UID, { firstName: "Paul", lastName: "Martin", email: "paul@test.com", company: "Beta" });
    createUserDatabase(UID, { name: "Inventaire Q1" });

    const results = await search(UID, "paul", EMAIL);
    expect(results.some((r) => r.type === "contact" && r.title.includes("Paul"))).toBe(true);

    const dbResults = await search(UID, "inventaire", EMAIL);
    expect(dbResults.some((r) => r.type === "database" && r.title === "Inventaire Q1")).toBe(true);
  });
});
