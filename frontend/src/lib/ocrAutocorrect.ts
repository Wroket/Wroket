/**
 * Light post-OCR cleanup: flow line breaks into paragraphs, then optional
 * language-scoped word fixes for common handwriting misreads.
 * Deliberately conservative — no network, no LLM.
 */

/** Join single newlines into spaces; keep blank lines as paragraph breaks. */
export function normalizeOcrLineBreaks(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
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
 * Always normalizes line breaks; applies FR lexicon when lang starts with "fr".
 */
export function autocorrectOcrText(text: string, lang?: string | null): string {
  const flowed = normalizeOcrLineBreaks(text);
  const code = (lang ?? "").trim().toLowerCase();
  if (code === "fr" || code.startsWith("fr-")) {
    return applyWordFixes(flowed, FR_OCR_FIXES);
  }
  return flowed;
}
