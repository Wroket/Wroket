/**
 * Parses GitHub-flavored markdown tables into header + row matrices.
 */

export interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

/** Returns all markdown tables found in the text (GFM pipe syntax). */
export function parseMarkdownTables(markdown: string): ParsedMarkdownTable[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const tables: ParsedMarkdownTable[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.includes("|")) {
      i++;
      continue;
    }

    const headerCells = splitTableRow(line);
    if (headerCells.length < 2) {
      i++;
      continue;
    }

    const sepIdx = i + 1;
    if (sepIdx >= lines.length) break;
    const sep = lines[sepIdx].trim();
    if (!/^\|?[\s:-]+\|[\s|:-]+$/.test(sep)) {
      i++;
      continue;
    }

    const rows: string[][] = [];
    let j = sepIdx + 1;
    while (j < lines.length) {
      const rowLine = lines[j].trim();
      if (!rowLine.includes("|")) break;
      const cells = splitTableRow(rowLine);
      if (cells.length === 0) break;
      rows.push(cells);
      j++;
    }

    if (rows.length > 0) {
      tables.push({ headers: headerCells, rows });
    }
    i = j;
  }

  return tables;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim()).filter((c, idx, arr) => {
    if (arr.length === 1 && !c) return false;
    return true;
  });
}
