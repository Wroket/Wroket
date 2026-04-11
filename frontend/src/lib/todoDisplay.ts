/**
 * Label for todos whose title is missing in the API (e.g. legacy ciphertext removed before migration).
 */
export function displayTodoTitle(title: string | undefined | null, untitledLabel: string): string {
  const s = typeof title === "string" ? title.trim() : "";
  return s.length > 0 ? s : untitledLabel;
}
