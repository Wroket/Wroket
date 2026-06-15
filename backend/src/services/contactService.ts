import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { assertValidEmailFormat } from "../utils/emailValidation";
import { NotFoundError, ValidationError } from "../utils/errors";
import { normalizeExternalRef, type ExternalRef, type ExternalProvider } from "./externalRef";

export interface Contact {
  id: string;
  ownerUid: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  /** Local notes — never overwritten by Notion sync. */
  notes: string | null;
  externalRef: ExternalRef | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  /** Set when the contact is in `archivedContacts`. */
  archivedAt?: string;
}

export interface CreateContactInput {
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string | null;
}

const MAX_CONTACTS_PER_OWNER = 2000;
const MAX_LIST_RESULTS = 200;
const MAX_TAG_COUNT = 10;
const MAX_TAG_LEN = 40;
const MAX_NAME_LEN = 80;
const MAX_COMPANY_LEN = 120;
const MAX_CONTACT_NOTES_LEN = 5000;

function getContactStore(): Record<string, Contact[]> {
  const store = getStore();
  if (!store.contacts) store.contacts = {};
  return store.contacts as Record<string, Contact[]>;
}

function getArchivedContactStore(): Record<string, Contact[]> {
  const store = getStore();
  if (!store.archivedContacts) store.archivedContacts = {};
  return store.archivedContacts as Record<string, Contact[]>;
}

function persist(): void {
  scheduleSave("contacts");
}

function persistArchived(): void {
  scheduleSave("archivedContacts");
}

function normalizeOptionalEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  assertValidEmailFormat(trimmed, "Email invalide");
  return trimmed.toLowerCase();
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LEN);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAG_COUNT) break;
  }
  return out;
}

function normalizeName(value: string | undefined, fieldLabel: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > MAX_NAME_LEN) {
    throw new ValidationError(`${fieldLabel} trop long (max ${MAX_NAME_LEN} caractères).`);
  }
  return trimmed;
}

function normalizeNotes(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CONTACT_NOTES_LEN) {
    throw new ValidationError(`Commentaires trop longs (max ${MAX_CONTACT_NOTES_LEN} caractères).`);
  }
  return trimmed;
}

function normalizeCompany(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_COMPANY_LEN) {
    throw new ValidationError(`Entreprise trop longue (max ${MAX_COMPANY_LEN} caractères).`);
  }
  return trimmed;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function assertHasIdentity(firstName: string, lastName: string, email: string | null, phone: string | null): void {
  const hasName = Boolean(firstName || lastName);
  if (hasName || email || phone) return;
  throw new ValidationError(
    "Renseignez au moins un nom, un email ou un téléphone.",
    "CONTACT_IDENTITY_REQUIRED",
  );
}

function contactDisplayName(c: Contact): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.email || c.phone || c.company || c.id;
}

function matchesQuery(c: Contact, q: string): boolean {
  const needle = q.toLowerCase();
  const hay = [
    c.firstName,
    c.lastName,
    c.company ?? "",
    c.email ?? "",
    c.phone ?? "",
    ...c.tags,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function listContacts(ownerUid: string, query?: string): Contact[] {
  const store = getContactStore();
  let list = (store[ownerUid] ?? []).slice();
  const q = query?.trim();
  if (q) {
    list = list.filter((c) => matchesQuery(c, q));
  }
  list.sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), undefined, { sensitivity: "base" }));
  return list.slice(0, MAX_LIST_RESULTS);
}

export interface ContactSuggestion {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  displayName: string;
}

/** Autocomplete contacts (répertoire) — min 2 caractères, email requis. */
export function suggestContacts(ownerUid: string, query: string, limit = 15): ContactSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return listContacts(ownerUid, q)
    .filter((c) => c.email?.trim())
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      displayName: contactDisplayName(c),
    }));
}

/** All contacts for owner (sync internal — no list cap). */
export function listAllContacts(ownerUid: string): Contact[] {
  return (getContactStore()[ownerUid] ?? []).slice();
}

export function findContactByExternalId(
  ownerUid: string,
  provider: ExternalProvider,
  externalId: string,
): Contact | undefined {
  return (getContactStore()[ownerUid] ?? []).find(
    (c) => c.externalRef?.provider === provider && c.externalRef.externalId === externalId,
  );
}

export function findContactByEmail(ownerUid: string, email: string | null): Contact | undefined {
  return findByEmail(ownerUid, email);
}

export function getContactById(ownerUid: string, contactId: string): Contact {
  const store = getContactStore();
  const found = (store[ownerUid] ?? []).find((c) => c.id === contactId);
  if (!found) throw new NotFoundError("Contact introuvable");
  return found;
}

function findByEmail(ownerUid: string, email: string | null): Contact | undefined {
  if (!email) return undefined;
  return (getContactStore()[ownerUid] ?? []).find((c) => c.email === email);
}

export function createContact(ownerUid: string, input: CreateContactInput): Contact {
  const firstName = normalizeName(input.firstName, "Prénom");
  const lastName = normalizeName(input.lastName, "Nom");
  const email = normalizeOptionalEmail(input.email);
  const phone = normalizePhone(input.phone);
  const company = normalizeCompany(input.company);
  const tags = normalizeTags(input.tags);
  const notes = normalizeNotes(input.notes);
  assertHasIdentity(firstName, lastName, email, phone);

  const store = getContactStore();
  const userContacts = store[ownerUid] ?? [];
  if (userContacts.length >= MAX_CONTACTS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_CONTACTS_PER_OWNER} contacts atteinte.`, "CONTACT_QUOTA_EXCEEDED");
  }

  if (email) {
    const dup = findByEmail(ownerUid, email);
    if (dup) {
      throw new ValidationError("Un contact avec cet email existe déjà.", "CONTACT_EMAIL_DUPLICATE");
    }
  }

  const now = new Date().toISOString();
  const contact: Contact = {
    id: crypto.randomUUID(),
    ownerUid,
    firstName,
    lastName,
    company,
    email,
    phone,
    tags,
    notes,
    externalRef: null,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
  };

  store[ownerUid] = [contact, ...userContacts];
  persist();
  return contact;
}

export function updateContact(ownerUid: string, contactId: string, input: UpdateContactInput): Contact {
  const store = getContactStore();
  const userContacts = store[ownerUid] ?? [];
  const idx = userContacts.findIndex((c) => c.id === contactId);
  if (idx === -1) throw new NotFoundError("Contact introuvable");

  const existing = userContacts[idx];
  const firstName = input.firstName !== undefined ? normalizeName(input.firstName, "Prénom") : existing.firstName;
  const lastName = input.lastName !== undefined ? normalizeName(input.lastName, "Nom") : existing.lastName;
  const email = input.email !== undefined ? normalizeOptionalEmail(input.email) : existing.email;
  const phone = input.phone !== undefined ? normalizePhone(input.phone) : existing.phone;
  const company = input.company !== undefined ? normalizeCompany(input.company) : existing.company;
  const tags = input.tags !== undefined ? normalizeTags(input.tags) : existing.tags;
  const notes = input.notes !== undefined ? normalizeNotes(input.notes) : existing.notes;
  assertHasIdentity(firstName, lastName, email, phone);

  if (email && email !== existing.email) {
    const dup = findByEmail(ownerUid, email);
    if (dup && dup.id !== contactId) {
      throw new ValidationError("Un contact avec cet email existe déjà.", "CONTACT_EMAIL_DUPLICATE");
    }
  }

  existing.firstName = firstName;
  existing.lastName = lastName;
  existing.email = email;
  existing.phone = phone;
  existing.company = company;
  existing.tags = tags;
  existing.notes = notes;
  existing.updatedAt = new Date().toISOString();

  store[ownerUid] = userContacts;
  persist();
  return existing;
}

export interface ContactSyncRowInput {
  externalId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  localNotes?: string;
}

export interface UpsertContactFromSyncResult {
  contact: Contact;
  created: boolean;
  updated: boolean;
  changedFields: string[];
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function diffMirrorFields(existing: Contact, row: ContactSyncRowInput): string[] {
  const changed: string[] = [];
  if (existing.firstName !== row.firstName) changed.push("firstName");
  if (existing.lastName !== row.lastName) changed.push("lastName");
  if ((existing.company ?? null) !== (row.company ?? null)) changed.push("company");
  if ((existing.email ?? null) !== (row.email ?? null)) changed.push("email");
  if ((existing.phone ?? null) !== (row.phone ?? null)) changed.push("phone");
  if (!tagsEqual(existing.tags, row.tags)) changed.push("tags");
  return changed;
}

/** Upserts one contact from an external sync snapshot (Notion pull). */
export function upsertContactFromSync(
  ownerUid: string,
  row: ContactSyncRowInput,
  refs: { connectionId: string; databaseId: string },
): UpsertContactFromSyncResult {
  const firstName = normalizeName(row.firstName, "Prénom");
  const lastName = normalizeName(row.lastName, "Nom");
  const email = row.email ? normalizeOptionalEmail(row.email) : null;
  const phone = normalizePhone(row.phone);
  const company = normalizeCompany(row.company);
  const tags = normalizeTags(row.tags);
  assertHasIdentity(firstName, lastName, email, phone);

  const now = new Date().toISOString();
  const externalRef: ExternalRef = {
    provider: "notion",
    externalId: row.externalId,
    connectionId: refs.connectionId,
    externalParentId: refs.databaseId,
    lastSyncedAt: now,
  };

  let existing = findContactByExternalId(ownerUid, "notion", row.externalId);
  if (!existing && email) {
    existing = findByEmail(ownerUid, email);
  }
  if (!existing) {
    const archived =
      findArchivedContactByExternalId(ownerUid, "notion", row.externalId)
      ?? (email ? findArchivedByEmail(ownerUid, email) : undefined);
    if (archived) {
      restoreArchivedContact(ownerUid, archived.id);
      existing = findContactByExternalId(ownerUid, "notion", row.externalId)
        ?? (email ? findByEmail(ownerUid, email) : undefined);
    }
  }

  if (existing) {
    const changedFields = diffMirrorFields(existing, {
      ...row,
      firstName,
      lastName,
      email,
      phone,
      company,
      tags,
    });

    if (email && email !== existing.email) {
      const dup = findByEmail(ownerUid, email);
      if (dup && dup.id !== existing.id) {
        throw new ValidationError("Un contact avec cet email existe déjà.", "CONTACT_EMAIL_DUPLICATE");
      }
    }

    existing.firstName = firstName;
    existing.lastName = lastName;
    existing.email = email;
    existing.phone = phone;
    existing.company = company;
    existing.tags = tags;
    existing.externalRef = externalRef;
    existing.lastSyncedAt = now;
    existing.updatedAt = now;
    persist();
    return {
      contact: existing,
      created: false,
      updated: changedFields.length > 0,
      changedFields,
    };
  }

  const store = getContactStore();
  const userContacts = store[ownerUid] ?? [];
  if (userContacts.length >= MAX_CONTACTS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_CONTACTS_PER_OWNER} contacts atteinte.`, "CONTACT_QUOTA_EXCEEDED");
  }

  const contact: Contact = {
    id: crypto.randomUUID(),
    ownerUid,
    firstName,
    lastName,
    company,
    email,
    phone,
    tags,
    notes: row.localNotes ? normalizeNotes(row.localNotes) : null,
    externalRef,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  store[ownerUid] = [contact, ...userContacts];
  persist();
  return { contact, created: true, updated: false, changedFields: [] };
}

/** Soft-delete: moves the contact to `archivedContacts`. */
export function deleteContact(ownerUid: string, contactId: string): void {
  const store = getContactStore();
  const userContacts = store[ownerUid] ?? [];
  const idx = userContacts.findIndex((c) => c.id === contactId);
  if (idx === -1) throw new NotFoundError("Contact introuvable");
  const [contact] = userContacts.splice(idx, 1);
  store[ownerUid] = userContacts;
  const now = new Date().toISOString();
  const archived: Contact = { ...contact, archivedAt: now, updatedAt: now };
  const archStore = getArchivedContactStore();
  archStore[ownerUid] = [archived, ...(archStore[ownerUid] ?? [])];
  persist();
  persistArchived();
}

export function listArchivedContacts(ownerUid: string): Contact[] {
  return (getArchivedContactStore()[ownerUid] ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.archivedAt ?? b.updatedAt).getTime() - new Date(a.archivedAt ?? a.updatedAt).getTime(),
    );
}

export function restoreArchivedContact(ownerUid: string, contactId: string): Contact {
  const archStore = getArchivedContactStore();
  const archived = archStore[ownerUid] ?? [];
  const idx = archived.findIndex((c) => c.id === contactId);
  if (idx === -1) throw new NotFoundError("Contact introuvable");
  const active = getContactStore()[ownerUid] ?? [];
  if (active.length >= MAX_CONTACTS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_CONTACTS_PER_OWNER} contacts atteinte.`, "CONTACT_QUOTA_EXCEEDED");
  }
  const [contact] = archived.splice(idx, 1);
  archStore[ownerUid] = archived;
  const email = contact.email;
  if (email && findByEmail(ownerUid, email)) {
    throw new ValidationError("Un contact actif utilise déjà cet email.", "CONTACT_EMAIL_DUPLICATE");
  }
  const now = new Date().toISOString();
  const restored: Contact = { ...contact, archivedAt: undefined, updatedAt: now };
  getContactStore()[ownerUid] = [restored, ...active];
  persist();
  persistArchived();
  return restored;
}

export function permanentlyDeleteArchivedContact(ownerUid: string, contactId: string): void {
  const archStore = getArchivedContactStore();
  const archived = archStore[ownerUid] ?? [];
  const idx = archived.findIndex((c) => c.id === contactId);
  if (idx === -1) throw new NotFoundError("Contact introuvable");
  archived.splice(idx, 1);
  archStore[ownerUid] = archived;
  persistArchived();
}

/** Removes all contacts for account deletion (RGPD). */
export function purgeContactsForOwner(ownerUid: string): void {
  const store = getContactStore();
  const archStore = getArchivedContactStore();
  let changed = false;
  if (store[ownerUid]?.length) {
    delete store[ownerUid];
    changed = true;
  }
  if (archStore[ownerUid]?.length) {
    delete archStore[ownerUid];
    changed = true;
  }
  if (changed) {
    persist();
    persistArchived();
  }
}

/** Returns owner contacts for data export (active + archived). */
export function exportContactsForOwner(ownerUid: string): Contact[] {
  return [
    ...(getContactStore()[ownerUid] ?? []),
    ...(getArchivedContactStore()[ownerUid] ?? []),
  ];
}

function findArchivedContactByExternalId(
  ownerUid: string,
  provider: ExternalProvider,
  externalId: string,
): Contact | undefined {
  return (getArchivedContactStore()[ownerUid] ?? []).find(
    (c) => c.externalRef?.provider === provider && c.externalRef.externalId === externalId,
  );
}

function findArchivedByEmail(ownerUid: string, email: string | null): Contact | undefined {
  if (!email) return undefined;
  return (getArchivedContactStore()[ownerUid] ?? []).find((c) => c.email === email);
}

/** Hydrates externalRef on persisted rows (for future Notion sync). */
export function sanitizeContactRow(row: Record<string, unknown>, ownerUid: string): Contact | null {
  if (typeof row.id !== "string" || !row.id) return null;
  const externalRef = normalizeExternalRef(row.externalRef);
  return {
    id: row.id,
    ownerUid,
    firstName: typeof row.firstName === "string" ? row.firstName : "",
    lastName: typeof row.lastName === "string" ? row.lastName : "",
    company: typeof row.company === "string" ? row.company : null,
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
    notes: typeof row.notes === "string" ? row.notes : null,
    externalRef,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    lastSyncedAt: typeof row.lastSyncedAt === "string" ? row.lastSyncedAt : null,
  };
}

(function hydrateContacts() {
  const store = getStore();
  let count = 0;
  let archivedCount = 0;
  for (const key of ["contacts", "archivedContacts"] as const) {
    if (!store[key]) continue;
    for (const [uid, list] of Object.entries(store[key])) {
      if (!Array.isArray(list)) continue;
      const sanitized = list
        .map((row) => sanitizeContactRow(row as Record<string, unknown>, uid))
        .filter((c): c is Contact => c !== null);
      (store[key] as Record<string, Contact[]>)[uid] = sanitized;
      if (key === "contacts") count += sanitized.length;
      else archivedCount += sanitized.length;
    }
  }
  if (count > 0) console.log("[contacts] %d contact(s) chargé(s)", count);
  if (archivedCount > 0) console.log("[contacts] %d contact(s) archivé(s) chargé(s)", archivedCount);
})();
