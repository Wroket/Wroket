/**
 * Light post-OCR cleanup: preserve intentional handwriting lines, only join
 * mid-sentence fragments, then optional language-scoped word fixes.
 * Deliberately conservative — no network, no LLM.
 */

/**
 * Trim lines and keep whiteboard-style line breaks.
 * Only joins when the next line continues mid-sentence (starts lowercase and
 * previous line has no sentence-ending punctuation) — typical Vision wrap of
 * a single physical line. Does NOT flatten a whole note into one paragraph.
 */
export function normalizeOcrLineBreaks(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) return "";

      const merged: string[] = [lines[0]!];
      for (let i = 1; i < lines.length; i++) {
        const prev = merged[merged.length - 1]!;
        const curr = lines[i]!;
        const prevEndsSentence = /[.!?…:]$/u.test(prev);
        const currIsCompleteUtterance = /[.!?…]$/u.test(curr);
        const currContinues = /^[\p{Ll}]/u.test(curr);
        // Join only true mid-line wraps ("Je serai" + "chez Julie"), not
        // "Bonne journée" + "grand!" nor lines that start with a capital.
        if (!prevEndsSentence && currContinues && !currIsCompleteUtterance) {
          merged[merged.length - 1] = `${prev} ${curr}`;
        } else {
          merged.push(curr);
        }
      }
      return merged.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * High-confidence FR substitutions for Vision handwriting slips.
 * Whole-word only, case-insensitive; preserves original casing pattern lightly.
 */
const FR_OCR_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  // Phrases before single words (order matters).
  [/\bce sor\b/gi, "ce soir"],
  [/\bde nove\b/gi, "de note"],
  [/\bjourner\b/gi, "journée"],
  [/\bjauner\b/gi, "journée"],
  [/\bjournee\b/gi, "journée"],
  [/\bsori\b/gi, "soir"],
  [/\bnove\b/gi, "note"],
  [/\baujord'?hui\b/gi, "aujourd'hui"],
  [/\bparceque\b/gi, "parce que"],
  [/\bpeutetre\b/gi, "peut-être"],
  [/\bquelqun\b/gi, "quelqu'un"],
  [/\bmaintenat\b/gi, "maintenant"],
  [/\bvraimant\b/gi, "vraiment"],
  // "ground" often misread for "grand" in FR handwriting (not applied in EN).
  [/\bground\b/gi, "grand"],
];

function applyWordFixes(text: string, fixes: ReadonlyArray<readonly [RegExp, string]>): string {
  let out = text;
  for (const [pattern, replacement] of fixes) {
    out = out.replace(pattern, (match) => {
      if (match === match.toUpperCase()) return replacement.toUpperCase();
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return out;
}

/**
 * Autocorrect OCR preview text for the given BCP-47 hint / locale.
 * Preserves line breaks; applies FR lexicon when lang starts with "fr".
 */
export function autocorrectOcrText(text: string, lang?: string | null): string {
  const flowed = normalizeOcrLineBreaks(text);
  const code = (lang ?? "").trim().toLowerCase();
  if (code === "fr" || code.startsWith("fr-")) {
    return applyWordFixes(flowed, FR_OCR_FIXES);
  }
  return flowed;
}
