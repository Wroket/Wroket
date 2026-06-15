import { parseApiErrorResponse } from "@/lib/apiErrors";
import {
  API_BASE_URL,
  apiFetchDefaults,
  parseJsonOrThrow,
} from "./core";
import type { ExternalRef } from "./todos";

export interface Contact {
  id: string;
  ownerUid: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  /** Local comments — never overwritten by Notion sync. */
  notes: string | null;
  externalRef?: ExternalRef | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string | null;
  archivedAt?: string;
}

export interface CreateContactPayload {
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface UpdateContactPayload {
  firstName?: string;
  lastName?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string | null;
}

export async function getContacts(query?: string): Promise<Contact[]> {
  const params = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const res = await fetch(`${API_BASE_URL}/contacts${params}`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await parseJsonOrThrow(res)) as { contacts: Contact[] };
  return data.contacts;
}

export async function getContact(id: string): Promise<Contact> {
  const res = await fetch(`${API_BASE_URL}/contacts/${encodeURIComponent(id)}`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<Contact>;
}

export async function createContact(payload: CreateContactPayload): Promise<Contact> {
  const res = await fetch(`${API_BASE_URL}/contacts`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<Contact>;
}

export async function updateContact(id: string, payload: UpdateContactPayload): Promise<Contact> {
  const res = await fetch(`${API_BASE_URL}/contacts/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<Contact>;
}

export async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/contacts/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export async function getArchivedContacts(): Promise<Contact[]> {
  const res = await fetch(`${API_BASE_URL}/contacts/archived`, { ...apiFetchDefaults });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await parseJsonOrThrow(res)) as { contacts: Contact[] };
  return data.contacts;
}

export async function restoreArchivedContact(id: string): Promise<Contact> {
  const res = await fetch(`${API_BASE_URL}/contacts/archived/${encodeURIComponent(id)}/restore`, {
    ...apiFetchDefaults,
    method: "POST",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  return parseJsonOrThrow(res) as Promise<Contact>;
}

export async function purgeArchivedContact(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/contacts/archived/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
}

export interface ContactSuggestion {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  displayName: string;
}

export async function getContactSuggestions(query: string): Promise<ContactSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`${API_BASE_URL}/contacts/suggest?q=${encodeURIComponent(q)}`, {
    ...apiFetchDefaults,
  });
  if (!res.ok) throw await parseApiErrorResponse(res, "toast.genericError");
  const data = (await parseJsonOrThrow(res)) as { suggestions: ContactSuggestion[] };
  return data.suggestions;
}
