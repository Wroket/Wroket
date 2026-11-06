/**
 * Pull action-shaped lines out of a note's HTML. No network.
 * Bullets, checkboxes and lines starting with TODO or "action" become candidates.
 */
import type { Priority } from "@/lib/api/todos";

export interface ProposedTaskLine {
  clientKey: string;
  title: string;
  /** `YYYY-MM-DD`, or empty when the line has no date. */
  deadline: string;
  priority: Priority;
  included: boolean;
}

const ACTION_PREFIX =
  /^(?:[-*•]|\[\s?[xX ]?\s?\]|\d+[.)]|TODO\b:?|action\b:?)\s+/i;
const DATE_AT_END =
  /(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?)\s*$/;

function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

/** Visible lines of a note, list items marked so the parser can see them. */
export function htmlToPlainLines(html: string): string[] {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  return decode(withBreaks.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(match: RegExpMatchArray, today: Date): string | null {
  if (match[1] && match[2] && match[3]) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const day = Number(match[4]);
  const month = Number(match[5]);
  if (!day || !month || month > 12 || day > 31) return null;
  let year = match[6] ? Number(match[6]) : today.getFullYear();
  if (year < 100) year += 2000;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Propose up to 25 tasks from note HTML.
 * @param today used when a line has a day/month and no year.
 */
export function parseNoteTaskLines(html: string, today = new Date()): ProposedTaskLine[] {
  const out: ProposedTaskLine[] = [];
  for (const line of htmlToPlainLines(html)) {
    if (!ACTION_PREFIX.test(line)) continue;
    let title = line.replace(ACTION_PREFIX, "").trim();
    if (!title) continue;
    let deadline = "";
    const dateMatch = title.match(DATE_AT_END);
    if (dateMatch && dateMatch.index != null) {
      const iso = toIsoDate(dateMatch, today);
      if (iso) {
        deadline = iso;
        title = title.slice(0, dateMatch.index).replace(/[-–—:]\s*$/, "").trim();
      }
    }
    if (!title || title.length > 500) continue;
    out.push({
      clientKey: `l${out.length}`,
      title,
      deadline,
      priority: "medium",
      included: true,
    });
    if (out.length >= 25) break;
  }
  return out;
}
