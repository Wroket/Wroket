/** Strips accidental JS `undefined` string coercion prepended to user input. */
export function stripUndefinedTitlePrefix(raw: string): string {
  if (raw.startsWith("undefined") && raw.length > 9) {
    return raw.slice(9).trimStart();
  }
  return raw;
}

/** Normalizes todo title input before API submit (never sends non-string / coercion artifacts). */
export function normalizeTodoTitleInput(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return stripUndefinedTitlePrefix(s);
}

/**
 * Label for todos whose title is missing in the API (e.g. legacy ciphertext removed before migration).
 */
export function displayTodoTitle(title: string | undefined | null, untitledLabel: string): string {
  const s = stripUndefinedTitlePrefix(typeof title === "string" ? title.trim() : "");
  return s.length > 0 ? s : untitledLabel;
}
