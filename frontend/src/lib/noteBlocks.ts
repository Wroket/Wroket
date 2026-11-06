import type { Note, NoteBlock, NoteDiagram, NoteDiagramBlock, NoteDiagramEdge, NoteDiagramNode, NoteTextBlock } from "@/lib/api/notes";

/** Notes without `blocks` are shown as the diagram, when there is one, then the text. */
export function resolveNoteBlocks(note: Pick<Note, "content" | "diagram" | "blocks">): NoteBlock[] {
  if (note.blocks && note.blocks.length > 0) return note.blocks;
  const blocks: NoteBlock[] = [];
  if (note.diagram && note.diagram.nodes.length > 0) {
    blocks.push({
      id: "diagram",
      type: "diagram",
      nodes: note.diagram.nodes,
      edges: note.diagram.edges ?? [],
      updatedAt: note.diagram.updatedAt,
    });
  }
  blocks.push({ id: "text", type: "text", html: note.content ?? "" });
  return blocks;
}

export function textHtmlFromBlocks(blocks: NoteBlock[]): string {
  return blocks.filter((block): block is NoteTextBlock => block.type === "text").map((block) => block.html).join("");
}

export function newBlockId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Copy of the visible blocks, plus a new diagram and prose on the last text zone. */
export function appendCapture(
  blocks: NoteBlock[],
  nodes: NoteDiagramNode[],
  edges: NoteDiagramEdge[],
  html: string,
): NoteBlock[] {
  const next = blocks.map((block) => (
    block.type === "text" ? { ...block } : { ...block, nodes: [...block.nodes], edges: [...block.edges] }
  ));
  if (nodes.length > 0) {
    next.push({ id: newBlockId(), type: "diagram", nodes, edges });
  }
  if (!html) return next;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const block = next[index];
    if (!block || block.type !== "text") continue;
    const current = block.html;
    const filled = current.replace(/<br\s*\/?>/gi, "").trim().length > 0;
    next[index] = { ...block, html: filled ? `${current}${html}` : html };
    return next;
  }
  next.push({ id: newBlockId(), type: "text", html });
  return next;
}

export function diagramFromBlock(block: NoteDiagramBlock): NoteDiagram {
  return {
    nodes: block.nodes,
    edges: block.edges,
    updatedAt: block.updatedAt || "",
  };
}
