import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import { createContact, type Contact } from "./contactService";
import {
  applyContactSyncDiff,
  computeContactSyncDiff,
} from "./contactSyncService";
import type { ContactSyncSnapshot } from "./notionApiService";
import { mapNotionPageToContactRow, discoverContactPropertyKeys } from "./notionApiService";

const UID = "user-contact-sync-test";

function makeSnapshot(contacts: ContactSyncSnapshot["contacts"], databaseId = "db-people-1"): ContactSyncSnapshot {
  return {
    provider: "notion",
    connectionId: "conn-1",
    sourceDatabaseId: databaseId,
    sourceLabel: "People",
    contacts,
  };
}

beforeEach(() => {
  const store = getStore();
  store.contacts = {};
});

describe("contactSyncService", () => {
  it("creates contacts on first apply", () => {
    const snapshot = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "Jean",
        lastName: "Dupont",
        company: "Acme",
        email: "jean@acme.com",
        phone: null,
        tags: ["client"],
      },
    ]);
    const result = applyContactSyncDiff(UID, snapshot);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].externalRef?.externalId).toBe("page-1");
  });

  it("is idempotent on re-sync", () => {
    const snapshot = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "Jean",
        lastName: "Dupont",
        company: null,
        email: "jean@acme.com",
        phone: null,
        tags: [],
      },
    ]);
    applyContactSyncDiff(UID, snapshot);
    const second = applyContactSyncDiff(UID, snapshot);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    const diff = computeContactSyncDiff(UID, snapshot);
    expect(diff.summary.creates).toBe(0);
    expect(diff.summary.updates).toBe(0);
    expect(diff.contacts.unchanged).toBe(1);
  });

  it("updates changed fields on re-sync", () => {
    const snapshot = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "Jean",
        lastName: "Dupont",
        company: null,
        email: "jean@acme.com",
        phone: null,
        tags: [],
      },
    ]);
    applyContactSyncDiff(UID, snapshot);
    const updatedSnapshot = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "Jean",
        lastName: "Martin",
        company: "Beta",
        email: "jean@acme.com",
        phone: "+33 1 00 00 00 00",
        tags: ["vip"],
      },
    ]);
    const result = applyContactSyncDiff(UID, updatedSnapshot);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.contacts[0].lastName).toBe("Martin");
    expect(result.contacts[0].company).toBe("Beta");
  });

  it("matches existing manual contact by email", () => {
    createContact(UID, { firstName: "Alice", email: "alice@test.com" });
    const snapshot = makeSnapshot([
      {
        externalId: "page-alice",
        firstName: "Alice",
        lastName: "Smith",
        company: "Corp",
        email: "alice@test.com",
        phone: null,
        tags: [],
      },
    ]);
    const diff = computeContactSyncDiff(UID, snapshot);
    expect(diff.summary.creates).toBe(0);
    expect(diff.contacts.update).toHaveLength(1);
    applyContactSyncDiff(UID, snapshot);
    const list = (getStore().contacts?.[UID] ?? []) as Contact[];
    expect(list).toHaveLength(1);
    expect(list[0].externalRef?.externalId).toBe("page-alice");
    expect(list[0].lastName).toBe("Smith");
  });

  it("reports orphans not present in snapshot", () => {
    const snapshot = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "A",
        lastName: "",
        company: null,
        email: "a@test.com",
        phone: null,
        tags: [],
      },
      {
        externalId: "page-2",
        firstName: "B",
        lastName: "",
        company: null,
        email: "b@test.com",
        phone: null,
        tags: [],
      },
    ]);
    applyContactSyncDiff(UID, snapshot);
    const resync = makeSnapshot([
      {
        externalId: "page-1",
        firstName: "A",
        lastName: "",
        company: null,
        email: "a@test.com",
        phone: null,
        tags: [],
      },
    ]);
    const diff = computeContactSyncDiff(UID, resync);
    expect(diff.summary.orphans).toBe(1);
    expect(diff.contacts.orphans[0].label).toMatch(/b@test.com|B/i);
  });
});

describe("mapNotionPageToContactRow", () => {
  it("splits a single Name title column into first and last name", () => {
    const props = {
      Name: { type: "title", title: [{ plain_text: "Jean Dupont" }] },
      Email: { type: "email", email: "jean@example.com" },
    };
    const keys = discoverContactPropertyKeys(props);
    const row = mapNotionPageToContactRow("p1", props, keys);
    expect(row?.firstName).toBe("Jean");
    expect(row?.lastName).toBe("Dupont");
    expect(row?.email).toBe("jean@example.com");
  });

  it("maps separate first/last name columns", () => {
    const props = {
      Name: { type: "title", title: [{ plain_text: "Ignored" }] },
      "First name": { type: "rich_text", rich_text: [{ plain_text: "Marie" }] },
      "Last name": { type: "rich_text", rich_text: [{ plain_text: "Curie" }] },
      Phone: { type: "phone_number", phone_number: "+33 6 00 00 00 00" },
    };
    const keys = discoverContactPropertyKeys(props);
    const row = mapNotionPageToContactRow("p2", props, keys);
    expect(row?.firstName).toBe("Marie");
    expect(row?.lastName).toBe("Curie");
    expect(row?.phone).toBe("+33 6 00 00 00 00");
  });
});
