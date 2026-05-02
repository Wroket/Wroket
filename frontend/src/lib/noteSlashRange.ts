/**
 * Plain-text helpers for slash commands in a contenteditable note editor.
 */

/** Visible text from the start of `root` up to the current caret. */
export function getPlainTextBeforeCaret(root: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return "";
  const anchor = sel.anchorNode;
  if (!anchor || !root.contains(anchor)) return "";
  try {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString();
  } catch {
    return "";
  }
}

export function getCaretPlainOffset(root: HTMLElement): number {
  return getPlainTextBeforeCaret(root).length;
}

/** Detect `/query` at end of current line (same rules as textarea slash menu). */
export function detectSlashQuery(root: HTMLElement): { slashStartPlainOffset: number; query: string } | null {
  const beforeCaret = getPlainTextBeforeCaret(root);
  const lastNl = Math.max(beforeCaret.lastIndexOf("\n"), beforeCaret.lastIndexOf("\r"));
  const lineStart = lastNl + 1;
  const lineSlice = beforeCaret.slice(lineStart);
  const m = lineSlice.match(/\/(\w*)$/);
  if (!m || m.index === undefined) return null;
  const slashStartPlainOffset = lineStart + m.index;
  return { slashStartPlainOffset, query: m[1] };
}

function resolvePlainOffset(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  if (offset < 0) return null;
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node as Text;
    const len = t.length;
    if (remaining < len) {
      return { node: t, offset: remaining };
    }
    if (remaining === len) {
      return { node: t, offset: len };
    }
    remaining -= len;
  }
  if (remaining === 0) {
    const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while ((node = w2.nextNode())) last = node as Text;
    if (last) return { node: last, offset: last.length };
  }
  return null;
}

/** Programmatic selection over the plain-text range `[start, end)` inside `root`. */
export function setPlainTextSelection(root: HTMLElement, start: number, end: number): boolean {
  const a = resolvePlainOffset(root, start);
  const b = resolvePlainOffset(root, end);
  if (!a || !b) return false;
  try {
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

/** Replace plain-text `[start, end)` with `replacement` (uses execCommand insertText). */
export function replacePlainTextRange(root: HTMLElement, start: number, end: number, replacement: string): boolean {
  root.focus();
  if (!setPlainTextSelection(root, start, end)) return false;
  return document.execCommand("insertText", false, replacement);
}

/** Move caret to plain offset after replacement (collapsed selection). */
export function placeCaretAtPlainOffset(root: HTMLElement, offset: number): void {
  const p = resolvePlainOffset(root, offset);
  if (!p) return;
  try {
    const range = document.createRange();
    range.setStart(p.node, p.offset);
    range.collapse(true);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore */
  }
}
