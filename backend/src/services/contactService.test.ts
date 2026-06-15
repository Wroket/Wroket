import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import {
  createContact,
  deleteContact,
  listContacts,
  listArchivedContacts,
  restoreArchivedContact,
  permanentlyDeleteArchivedContact,
  updateContact,
  suggestContacts,
  upsertContactFromSync,
} from "./contactService";

const UID = "user-contacts-test";

beforeEach(() => {
  const store = getStore();
  store.contacts = {};
  store.archivedContacts = {};
});

describe("contactService", () => {
  it("creates a contact with name and email", () => {
    const c = createContact(UID, {
      firstName: "Jean",
      lastName: "Dupont",
      email: "Jean.Dupont@Example.com",
      company: "Acme",
      tags: ["Client", "VIP"],
    });
    expect(c.email).toBe("jean.dupont@example.com");
    expect(c.tags).toEqual(["client", "vip"]);
    expect(listContacts(UID)).toHaveLength(1);
  });

  it("rejects contact without identity fields", () => {
    expect(() => createContact(UID, {})).toThrow(/nom|email|téléphone/i);
  });

  it("rejects duplicate email on create", () => {
    createContact(UID, { email: "a@test.com" });
    expect(() => createContact(UID, { firstName: "Other", email: "a@test.com" })).toThrow(/email existe déjà/i);
  });

  it("searches contacts by query", () => {
    createContact(UID, { firstName: "Alice", company: "Beta Corp" });
    createContact(UID, { firstName: "Bob", lastName: "Martin" });
    expect(listContacts(UID, "beta")).toHaveLength(1);
    expect(listContacts(UID, "martin")).toHaveLength(1);
  });

  it("updates and archives a contact", () => {
    const created = createContact(UID, { firstName: "A", phone: "+33 1 23 45 67 89" });
    const updated = updateContact(UID, created.id, { lastName: "Test", company: "Wroket" });
    expect(updated.lastName).toBe("Test");
    deleteContact(UID, created.id);
    expect(listContacts(UID)).toHaveLength(0);
    expect(listArchivedContacts(UID)).toHaveLength(1);
    const restored = restoreArchivedContact(UID, created.id);
    expect(restored.lastName).toBe("Test");
    expect(listContacts(UID)).toHaveLength(1);
    deleteContact(UID, created.id);
    permanentlyDeleteArchivedContact(UID, created.id);
    expect(listArchivedContacts(UID)).toHaveLength(0);
  });

  it("suggestContacts returns contacts with email and display name", () => {
    createContact(UID, { firstName: "Marie", lastName: "Curie", email: "marie@lab.fr", company: "Lab" });
    const suggestions = suggestContacts(UID, "marie");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.email).toBe("marie@lab.fr");
    expect(suggestions[0]?.displayName).toContain("Marie");
  });

  it("preserves local notes on notion re-sync", () => {
    createContact(UID, {
      firstName: "Jean",
      lastName: "Dupont",
      email: "jean@test.com",
      notes: "Commentaire local",
    });
    const existing = listContacts(UID)[0]!;
    upsertContactFromSync(
      UID,
      {
        externalId: "page-1",
        firstName: "Jean",
        lastName: "Martin",
        company: "Acme",
        email: "jean@test.com",
        phone: null,
        tags: [],
      },
      { connectionId: "c1", databaseId: "db1" },
    );
    const after = listContacts(UID)[0]!;
    expect(after.lastName).toBe("Martin");
    expect(after.notes).toBe("Commentaire local");
    expect(existing.id).toBe(after.id);
  });
});
