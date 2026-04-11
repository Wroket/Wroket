/**
 * One-shot migration: decrypt todo title/tags and comment text, persist plaintext,
 * remove encV1 and user wrappedDekB64. Run BEFORE deploying code that removes encryption.
 *
 * This script is self-contained (copies legacy crypto) so it keeps working in git history
 * after crypto helpers are deleted from the main codebase.
 *
 * Prerequisites:
 * - CRYPTO_KEK_BASE64 (required if any encV1 exists)
 * - USE_LOCAL_STORE / GOOGLE_CLOUD_PROJECT per your environment
 * - Backup Firestore (or local-store.json) first
 *
 * Usage:
 *   cd backend && npm run migrate:strip-encryption
 */

import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const CT_VERSION = 1;

function loadKek(): Buffer | null {
  const b64 = process.env.CRYPTO_KEK_BASE64?.trim();
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) throw new Error("CRYPTO_KEK_BASE64 must decode to exactly 32 bytes");
  return buf;
}

function unwrapDataKey(wrappedB64: string): Buffer {
  const kek = loadKek();
  if (!kek) throw new Error("CRYPTO_KEK_BASE64 is not configured");
  const raw = Buffer.from(wrappedB64, "base64");
  if (raw.length < IV_LEN + TAG_LEN + 1) throw new Error("Invalid wrapped DEK payload");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, kek, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

function decryptUtf8WithDek(dek: Buffer, payloadB64: string): string {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const raw = Buffer.from(payloadB64, "base64");
  if (raw.length < 1 + IV_LEN + TAG_LEN + 1) throw new Error("Invalid ciphertext");
  if (raw[0] !== CT_VERSION) throw new Error(`Unsupported ciphertext version ${raw[0]}`);
  const iv = raw.subarray(1, 1 + IV_LEN);
  const tag = raw.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const enc = raw.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function getDekForUser(userRow: Record<string, unknown>): Buffer {
  const w = userRow.wrappedDekB64;
  if (typeof w !== "string" || !w.length) throw new Error("User has no wrappedDekB64");
  return unwrapDataKey(w);
}

function decryptTodoTitleTags(
  userRow: Record<string, unknown>,
  encV1: string,
): { title: string; tags: string[] } {
  const dek = getDekForUser(userRow);
  const json = decryptUtf8WithDek(dek, encV1);
  const parsed = JSON.parse(json) as { title?: string; tags?: unknown };
  const title = typeof parsed.title === "string" ? parsed.title : "";
  const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string") : [];
  return { title, tags };
}

function decryptCommentText(userRow: Record<string, unknown>, encV1: string): string {
  const dek = getDekForUser(userRow);
  return decryptUtf8WithDek(dek, encV1);
}

async function main(): Promise<void> {
  const { initStore, getStore, flushNow } = await import("../persistence");

  await initStore();
  const store = getStore();
  const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;

  const hasEncTodos = (): boolean => {
    for (const todos of Object.values(store.todos ?? {})) {
      for (const t of Object.values(todos as Record<string, Record<string, unknown>>)) {
        if (typeof t.encV1 === "string" && t.encV1.length > 0) return true;
      }
    }
    return false;
  };

  const hasEncComments = (): boolean => {
    for (const list of Object.values(store.comments ?? {})) {
      for (const c of list as Array<Record<string, unknown>>) {
        if (typeof c.encV1 === "string" && c.encV1.length > 0) return true;
      }
    }
    return false;
  };

  const needsKek = hasEncTodos() || hasEncComments();
  if (needsKek && !loadKek()) {
    console.error(
      "[migrate] Encrypted data present but CRYPTO_KEK_BASE64 is not set. Set the current KEK and re-run.",
    );
    process.exit(1);
  }

  let todoOk = 0;
  let todoFail = 0;
  let commentOk = 0;
  let commentFail = 0;

  if (loadKek() && store.todos) {
    for (const [userId, todos] of Object.entries(store.todos)) {
      const userRow = users[userId];
      for (const [id, raw] of Object.entries(todos as Record<string, Record<string, unknown>>)) {
        const enc = raw.encV1;
        if (typeof enc !== "string" || enc.length === 0) continue;
        if (!userRow) {
          console.error("[migrate] todo enc but no user row uid=%s", userId);
          todoFail++;
          continue;
        }
        try {
          const plain = decryptTodoTitleTags(userRow, enc);
          raw.title = plain.title;
          raw.tags = plain.tags;
          delete raw.encV1;
          todoOk++;
        } catch (e) {
          console.error("[migrate] todo decrypt failed uid=%s id=%s: %s", userId, id, e);
          raw.title = typeof raw.title === "string" ? raw.title : "[migration: decrypt failed]";
          raw.tags = Array.isArray(raw.tags) ? raw.tags : [];
          delete raw.encV1;
          todoFail++;
        }
      }
    }
  }

  if (loadKek() && store.comments) {
    const findOwner = (todoId: string): string | undefined => {
      for (const [uid, todos] of Object.entries(store.todos ?? {})) {
        if ((todos as Record<string, unknown>)[todoId]) return uid;
      }
      return undefined;
    };

    for (const [todoId, list] of Object.entries(store.comments)) {
      const owner = findOwner(todoId);
      const ownerRow = owner ? users[owner] : undefined;
      const arr = list as Array<Record<string, unknown>>;
      for (const raw of arr) {
        const enc = raw.encV1;
        if (typeof enc !== "string" || enc.length === 0) continue;
        if (!owner || !ownerRow) {
          console.error("[migrate] comment enc for todoId=%s but no owner", todoId);
          raw.text = typeof raw.text === "string" ? raw.text : "[migration: owner unknown]";
          delete raw.encV1;
          commentFail++;
          continue;
        }
        try {
          raw.text = decryptCommentText(ownerRow, enc);
          delete raw.encV1;
          commentOk++;
        } catch (e) {
          console.error("[migrate] comment decrypt failed todoId=%s: %s", todoId, e);
          raw.text = typeof raw.text === "string" ? raw.text : "[migration: decrypt failed]";
          delete raw.encV1;
          commentFail++;
        }
      }
    }
  }

  for (const u of Object.values(users)) {
    delete u.wrappedDekB64;
  }

  await flushNow();

  console.log(
    "[migrate] Done. todos: %d ok, %d fail; comments: %d ok, %d fail. wrappedDekB64 stripped.",
    todoOk,
    todoFail,
    commentOk,
    commentFail,
  );

  if (todoFail + commentFail > 0) {
    console.warn("[migrate] Some rows failed — review. Exit 1.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
