/**
 * Notion (and future providers) contact sync — diff preview and apply.
 * Mirrors externalSyncService patterns for projects but scoped to Contact entities.
 */

import type { ExternalProvider } from "./externalRef";
import type { ContactSyncSnapshot, ContactSyncSnapshotRow } from "./notionApiService";
import {
  listAllContacts,
  listContacts,
  findContactByExternalId,
  findContactByEmail,
  upsertContactFromSync,
  type Contact,
} from "./contactService";

export type ContactSyncAction = "create" | "update" | "unchanged";

export interface ContactSyncEntityChange {
  externalId: string;
  label: string;
  action: ContactSyncAction;
  internalId?: string;
  changedFields?: string[];
}

export interface ContactSyncOrphan {
  internalId: string;
  label: string;
}

export interface ContactSyncDiff {
  provider: ExternalProvider;
  contacts: {
    create: ContactSyncEntityChange[];
    update: ContactSyncEntityChange[];
    unchanged: number;
    orphans: ContactSyncOrphan[];
  };
  summary: { creates: number; updates: number; orphans: number };
}

export interface ApplyContactSyncResult {
  created: number;
  updated: number;
  orphans: number;
  contacts: Contact[];
}

function contactRowLabel(row: ContactSyncSnapshotRow): string {
  const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return full || row.email || row.phone || row.externalId;
}

function contactLabel(c: Contact): string {
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.email || c.phone || c.company || c.id;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function mirrorFieldsChanged(existing: Contact, row: ContactSyncSnapshotRow): string[] {
  const changed: string[] = [];
  if (existing.firstName !== row.firstName) changed.push("firstName");
  if (existing.lastName !== row.lastName) changed.push("lastName");
  if ((existing.company ?? null) !== (row.company ?? null)) changed.push("company");
  if ((existing.email ?? null) !== (row.email ?? null)) changed.push("email");
  if ((existing.phone ?? null) !== (row.phone ?? null)) changed.push("phone");
  if (!tagsEqual(existing.tags, row.tags)) changed.push("tags");
  return changed;
}

function resolveExistingContact(ownerUid: string, row: ContactSyncSnapshotRow): Contact | undefined {
  const byRef = findContactByExternalId(ownerUid, "notion", row.externalId);
  if (byRef) return byRef;
  if (row.email) return findContactByEmail(ownerUid, row.email);
  return undefined;
}

/** Computes create/update/unchanged/orphan diff for a contact sync snapshot. */
export function computeContactSyncDiff(ownerUid: string, snapshot: ContactSyncSnapshot): ContactSyncDiff {
  const diff: ContactSyncDiff = {
    provider: snapshot.provider,
    contacts: { create: [], update: [], unchanged: 0, orphans: [] },
    summary: { creates: 0, updates: 0, orphans: 0 },
  };

  const snapshotIds = new Set(snapshot.contacts.map((c) => c.externalId));

  for (const row of snapshot.contacts) {
    const existing = resolveExistingContact(ownerUid, row);
    const label = contactRowLabel(row);
    if (!existing) {
      diff.contacts.create.push({ externalId: row.externalId, label, action: "create" });
      continue;
    }
    const changedFields = mirrorFieldsChanged(existing, row);
    if (changedFields.length === 0) {
      diff.contacts.unchanged += 1;
    } else {
      diff.contacts.update.push({
        externalId: row.externalId,
        label,
        action: "update",
        internalId: existing.id,
        changedFields,
      });
    }
  }

  for (const contact of listAllContacts(ownerUid)) {
    const ref = contact.externalRef;
    if (!ref) continue;
    if (ref.provider !== snapshot.provider) continue;
    if (ref.externalParentId !== snapshot.sourceDatabaseId) continue;
    if (snapshotIds.has(ref.externalId)) continue;
    diff.contacts.orphans.push({ internalId: contact.id, label: contactLabel(contact) });
  }

  diff.summary = {
    creates: diff.contacts.create.length,
    updates: diff.contacts.update.length,
    orphans: diff.contacts.orphans.length,
  };

  return diff;
}

/** Applies a contact sync snapshot (upsert rows, report orphans — never auto-deletes). */
export function applyContactSyncDiff(ownerUid: string, snapshot: ContactSyncSnapshot): ApplyContactSyncResult {
  let created = 0;
  let updated = 0;

  for (const row of snapshot.contacts) {
    const result = upsertContactFromSync(ownerUid, row, {
      connectionId: snapshot.connectionId,
      databaseId: snapshot.sourceDatabaseId,
    });
    if (result.created) created += 1;
    else if (result.updated) updated += 1;
  }

  const diff = computeContactSyncDiff(ownerUid, snapshot);

  return {
    created,
    updated,
    orphans: diff.summary.orphans,
    contacts: listContacts(ownerUid),
  };
}
