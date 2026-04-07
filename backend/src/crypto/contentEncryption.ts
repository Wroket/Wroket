import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = 1;

/**
 * Encrypt UTF-8 string with a user DEK. Output: base64(version|iv|tag|ciphertext).
 */
export function encryptUtf8WithDek(dek: Buffer, plaintext: string): string {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from([VERSION]);
  return Buffer.concat([header, iv, tag, body]).toString("base64");
}

export function decryptUtf8WithDek(dek: Buffer, payloadB64: string): string {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const raw = Buffer.from(payloadB64, "base64");
  if (raw.length < 1 + IV_LEN + TAG_LEN + 1) {
    throw new Error("Invalid ciphertext");
  }
  if (raw[0] !== VERSION) {
    throw new Error(`Unsupported ciphertext version ${raw[0]}`);
  }
  const iv = raw.subarray(1, 1 + IV_LEN);
  const tag = raw.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const enc = raw.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
