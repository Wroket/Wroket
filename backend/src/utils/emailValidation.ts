import { ValidationError } from "./errors";

/**
 * Stricter than `includes("@")`: requires local@domain.tld shape, length bounds, no obvious junk.
 * Used for registration and password flows; roster emails pass a custom `invalidMessage`.
 */
export function assertValidEmailFormat(email: string, invalidMessage = "Email invalide"): void {
  const e = email.trim().toLowerCase();
  if (!e || e.length > 254) {
    throw new ValidationError(invalidMessage);
  }
  const at = e.indexOf("@");
  if (at <= 0 || at !== e.lastIndexOf("@")) {
    throw new ValidationError(invalidMessage);
  }
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (local.length > 64 || !domain || domain.length > 253) {
    throw new ValidationError(invalidMessage);
  }
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    throw new ValidationError(invalidMessage);
  }
  if (!domain.includes(".")) {
    throw new ValidationError(invalidMessage);
  }
  const labels = domain.split(".");
  if (labels.some((label) => !label || label.length > 63)) {
    throw new ValidationError(invalidMessage);
  }
}
