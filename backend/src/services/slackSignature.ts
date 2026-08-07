/**
 * Slack request signature verification (Lot 3).
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */

import crypto from "crypto";

const MAX_SKEW_SEC = 60 * 5;

export function getSlackSigningSecret(): string {
  return (process.env.SLACK_SIGNING_SECRET ?? "").trim();
}

export function isSlackSigningConfigured(): boolean {
  return getSlackSigningSecret().length > 0;
}

/**
 * Verify `X-Slack-Signature` v0 over `v0:{timestamp}:{rawBody}`.
 * Returns true when valid; false otherwise (never throws).
 */
export function verifySlackSignature(opts: {
  signingSecret: string;
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  rawBody: string | Buffer;
  nowSec?: number;
}): boolean {
  const { signingSecret, timestampHeader, signatureHeader, rawBody } = opts;
  if (!signingSecret || !timestampHeader || !signatureHeader) return false;

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) return false;

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const base = `v0:${timestampHeader}:${body}`;
  const digest = crypto.createHmac("sha256", signingSecret).update(base, "utf8").digest("hex");
  const expected = `v0=${digest}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
