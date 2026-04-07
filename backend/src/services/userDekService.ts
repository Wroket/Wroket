import crypto from "crypto";

import { encryptUtf8WithDek, decryptUtf8WithDek } from "../crypto/contentEncryption";
import { isKekConfigured, unwrapDataKey, wrapDataKey } from "../crypto/kekService";
import { getStore, scheduleSave } from "../persistence";

const dekCache = new Map<string, Buffer>();

interface UserRow {
  wrappedDekB64?: string;
}

export function clearUserDekCache(uid?: string): void {
  if (uid === undefined) dekCache.clear();
  else dekCache.delete(uid);
}

export function ensureUserWrappedDek(uid: string): void {
  if (!isKekConfigured()) return;
  const store = getStore();
  const users = store.users as Record<string, UserRow> | undefined;
  const u = users?.[uid];
  if (!u || u.wrappedDekB64) return;

  const dek = crypto.randomBytes(32);
  u.wrappedDekB64 = wrapDataKey(dek);
  dekCache.delete(uid);
  scheduleSave("users");
}

export function getUserDek(uid: string): Buffer {
  if (!isKekConfigured()) {
    throw new Error("User DEK requested but CRYPTO_KEK_BASE64 is not set");
  }
  const hit = dekCache.get(uid);
  if (hit) return hit;

  const store = getStore();
  const u = (store.users as Record<string, UserRow> | undefined)?.[uid];
  const wrapped = u?.wrappedDekB64;
  if (!wrapped) {
    throw new Error(`User ${uid} has no wrapped DEK — call ensureUserWrappedDek first`);
  }
  const dek = unwrapDataKey(wrapped);
  dekCache.set(uid, dek);
  return dek;
}

export function encryptTodoTitleTags(uid: string, title: string, tags: string[]): string {
  const dek = getUserDek(uid);
  const payload = JSON.stringify({ title, tags });
  return encryptUtf8WithDek(dek, payload);
}

export function decryptTodoTitleTags(uid: string, encV1: string): { title: string; tags: string[] } {
  const dek = getUserDek(uid);
  const json = decryptUtf8WithDek(dek, encV1);
  const parsed = JSON.parse(json) as { title?: string; tags?: unknown };
  const title = typeof parsed.title === "string" ? parsed.title : "";
  const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [];
  return { title, tags };
}

export function encryptCommentText(ownerUid: string, text: string): string {
  const dek = getUserDek(ownerUid);
  return encryptUtf8WithDek(dek, text);
}

export function decryptCommentText(ownerUid: string, encV1: string): string {
  const dek = getUserDek(ownerUid);
  return decryptUtf8WithDek(dek, encV1);
}
