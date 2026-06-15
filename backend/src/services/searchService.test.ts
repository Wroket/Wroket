import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import { createContact } from "./contactService";
import { createUserDatabase } from "./userDatabaseService";
import { search } from "./searchService";

const UID = "user-search-test";

beforeEach(() => {
  const store = getStore();
  store.contacts = {};
  store.userDatabases = {};
  store.userDatabaseRows = {};
  store.todos = {};
  store.projects = {};
  store.notes = {};
});

describe("searchService", () => {
  it("finds contacts and databases by query", () => {
    createContact(UID, { firstName: "Paul", lastName: "Martin", email: "paul@test.com", company: "Beta" });
    createUserDatabase(UID, { name: "Inventaire Q1" });

    const results = search(UID, "paul", "user@test.com");
    expect(results.some((r) => r.type === "contact" && r.title.includes("Paul"))).toBe(true);

    const dbResults = search(UID, "inventaire", "user@test.com");
    expect(dbResults.some((r) => r.type === "database" && r.title === "Inventaire Q1")).toBe(true);
  });
});
