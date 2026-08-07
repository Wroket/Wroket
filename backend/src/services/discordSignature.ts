/**
 * Discord Ed25519 interaction signature verification.
 */

import crypto from "crypto";

import { getDiscordPublicKey, isDiscordInboundConfigured } from "./discordOAuthService";

export function isDiscordSigningConfigured(): boolean {
  return isDiscordInboundConfigured();
}

/**
 * Verify `X-Signature-Ed25519` + `X-Signature-Timestamp` per Discord docs.
 */
export function verifyDiscordSignature(opts: {
  publicKeyHex: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  rawBody: string;
}): boolean {
  if (!opts.publicKeyHex || !opts.signatureHeader || !opts.timestampHeader) return false;
  try {
    const message = Buffer.from(opts.timestampHeader + opts.rawBody);
    const signature = Buffer.from(opts.signatureHeader, "hex");
    const publicKey = Buffer.from(opts.publicKeyHex, "hex");
    return crypto.verify(null, message, { key: publicKey, format: "der", type: "spki" } as never, signature) ||
      crypto.verify(
        null,
        message,
        crypto.createPublicKey({
          key: Buffer.concat([
            // Ed25519 SubjectPublicKeyInfo prefix
            Buffer.from("302a300506032b6570032100", "hex"),
            publicKey,
          ]),
          format: "der",
          type: "spki",
        }),
        signature,
      );
  } catch {
    // Node  preferred path: tweetnacl-style via crypto.verify with raw key
    try {
      const message = Buffer.from(opts.timestampHeader + opts.rawBody);
      const signature = Buffer.from(opts.signatureHeader, "hex");
      const keyObject = crypto.createPublicKey({
        key: {
          kty: "OKP",
          crv: "Ed25519",
          x: Buffer.from(opts.publicKeyHex, "hex").toString("base64url"),
        },
        format: "jwk",
      });
      return crypto.verify(null, message, keyObject, signature);
    } catch (err) {
      console.warn("[discord] signature verify failed:", err);
      return false;
    }
  }
}

export function verifyDiscordRequest(opts: {
  headers: { signature?: string; timestamp?: string };
  rawBody: string;
}): boolean {
  return verifyDiscordSignature({
    publicKeyHex: getDiscordPublicKey(),
    signatureHeader: opts.headers.signature,
    timestampHeader: opts.headers.timestamp,
    rawBody: opts.rawBody,
  });
}
