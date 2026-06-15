/** UUID v4 for idempotent create (todos, notes) — sent to API before POST. */
export function newClientEntityId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("crypto.randomUUID is not available");
}
