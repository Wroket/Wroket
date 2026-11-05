/**
 * Convert OCR plain text into safe note HTML: one escaped `<p dir="auto">` per line
 * (RTL scripts render correctly), consecutive blank lines collapsed into one.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ocrTextToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let lastBlank = true;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (!lastBlank) out.push("<p><br></p>");
      lastBlank = true;
      continue;
    }
    out.push(`<p dir="auto">${escapeHtml(line)}</p>`);
    lastBlank = false;
  }
  if (out[out.length - 1] === "<p><br></p>") out.pop();
  return out.join("");
}
