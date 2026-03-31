/**
 * Escape a string for safe embedding in an HTML context.
 *
 * WHY: `sendInviteEmail()` interpolates the user-controlled `fromName`
 * directly into an HTML email template:
 *
 *     <h2>${fromName} vous recommande Wroket !</h2>
 *
 * A user who sets their name to `<img src=x onerror=alert(1)>` or similar
 * payloads can inject HTML into the rendered email. While most modern email
 * clients strip <script> tags, many still execute inline event handlers and
 * CSS injection. This utility covers the OWASP-recommended set of
 * replacements for HTML body/attribute contexts.
 */
const REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const RE = /[&<>"']/g;

export function escapeHtml(str: string): string {
  return str.replace(RE, (ch) => REPLACEMENTS[ch]);
}
