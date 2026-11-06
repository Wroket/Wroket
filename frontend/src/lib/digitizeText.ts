/**
 * Text that belongs in the note body after a photo is digitized.
 * Words written in the boxes stay on the canvas. A line is dropped when every
 * word on it already appears in a box, which is how a messy OCR line repeats
 * several labels at once. A sentence that adds its own words is kept.
 * Vision text wins; the diagram reader's aside fills in when Vision returned nothing usable.
 */
const FILLER_WORDS = new Set([
  "et", "le", "la", "les", "de", "du", "des", "un", "une", "au", "aux", "ou", "en",
  "the", "and", "of", "in", "to", "for", "sur", "par",
]);

function wordsOf(value: string): string[] {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2);
}

function boxWords(labels: string[]): Set<string> {
  const words = new Set<string>();
  for (const label of labels) {
    for (const word of wordsOf(label)) words.add(word);
  }
  return words;
}

/** True when the line only restates box labels, plus small linking words. */
function lineIsOnlyBoxes(line: string, known: Set<string>): boolean {
  const words = wordsOf(line);
  if (words.length === 0) return true;
  return words.every((word) => known.has(word) || FILLER_WORDS.has(word));
}

function withoutBoxLabels(raw: string, known: Set<string>): string {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !lineIsOnlyBoxes(line, known))
    .join("\n")
    .trim();
}

export function proseFromCapture(ocrText: string, aside: string, labels: string[]): string {
  const known = boxWords(labels);
  const fromOcr = withoutBoxLabels(ocrText, known);
  if (fromOcr) return fromOcr;
  return withoutBoxLabels(aside, known);
}
