import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKek: Buffer | null | undefined;

/**
 * Loads the Key-Encryption-Key (32 bytes) used to wrap per-user DEKs.
 * Set CRYPTO_KEK_BASE64 to a base64-encoded random 32-byte value (e.g. openssl rand -base64 32).
 */
export function isKekConfigured(): boolean {
  return loadKek() !== null;
}

function loadKek(): Buffer | null {
  if (cachedKek === undefined) {
    const b64 = process.env.CRYPTO_KEK_BASE64?.trim();
    if (!b64) {
      cachedKek = null;
      return null;
    }
    const buf = Buffer.from(b64, "base64");
    if (buf.length !== 32) {
      throw new Error("CRYPTO_KEK_BASE64 must decode to exactly 32 bytes (AES-256)");
    }
    cachedKek = buf;
  }
  return cachedKek;
}

/** Wrap a 32-byte DEK for storage (users.wrappedDekB64). */
export function wrapDataKey(dek: Buffer): string {
  const kek = loadKek();
  if (!kek) throw new Error("CRYPTO_KEK_BASE64 is not configured");
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, kek, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Unwrap DEK from storage. */
export function unwrapDataKey(wrappedB64: string): Buffer {
  const kek = loadKek();
  if (!kek) throw new Error("CRYPTO_KEK_BASE64 is not configured");

  const raw = Buffer.from(wrappedB64, "base64");
  if (raw.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid wrapped DEK payload");
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, kek, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
