/**
 * A note is an ordered list of text and diagram blocks.
 * Notes saved before blocks existed are still `{ content, diagram }`.
 */
import type { NoteDiagram, NoteDiagramEdge, NoteDiagramNode } from "./noteService";

export interface NoteTextBlock {
  id: string;
  type: "text";
  html: string;
}

export interface NoteDiagramBlock {
  id: string;
  type: "diagram";
  nodes: NoteDiagramNode[];
  edges: NoteDiagramEdge[];
  updatedAt?: string;
}

export type NoteBlock = NoteTextBlock | NoteDiagramBlock;

const MAX_BLOCKS = 20;
const MAX_TEXT = 50_000;

export interface NoteBlockSource {
  content?: string;
  diagram?: NoteDiagram;
  blocks?: NoteBlock[];
}

/** One text block, and a diagram block before it when the note already has a graph. */
export function blocksFromLegacy(note: NoteBlockSource): NoteBlock[] {
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

/** Stored blocks win. Otherwise the legacy content and diagram are shown as blocks. */
export function resolveNoteBlocks(note: NoteBlockSource): NoteBlock[] {
  if (note.blocks && note.blocks.length > 0) return note.blocks;
  return blocksFromLegacy(note);
}

export function textHtmlFromBlocks(blocks: NoteBlock[]): string {
  return blocks.filter((block): block is NoteTextBlock => block.type === "text").map((block) => block.html).join("");
}

export function firstDiagramFromBlocks(blocks: NoteBlock[]): NoteDiagram | undefined {
  const block = blocks.find((item): item is NoteDiagramBlock => item.type === "diagram" && item.nodes.length > 0);
  if (!block) return undefined;
  return {
    nodes: block.nodes,
    edges: block.edges,
    updatedAt: block.updatedAt || new Date().toISOString(),
  };
}

function blockId(raw: unknown, fallback: string): string {
  const cleaned = typeof raw === "string" ? raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
  return cleaned || fallback;
}

/**
 * Keep a client block list inside the product limits.
 * Diagram graphs are checked by `sanitizeDiagram`.
 */
export function sanitizeNoteBlocks(
  raw: unknown,
  sanitizeDiagram: (value: unknown) => { nodes: NoteDiagramNode[]; edges: NoteDiagramEdge[] },
): NoteBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: NoteBlock[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = blockId(row.id, `b${blocks.length + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    if (row.type === "text") {
      const html = typeof row.html === "string" ? row.html.replace(/\u0000/g, "") : "";
      blocks.push({ id, type: "text", html });
    } else if (row.type === "diagram") {
      const graph = sanitizeDiagram({ nodes: row.nodes, edges: row.edges });
      const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt.slice(0, 40) : undefined;
      blocks.push({
        id,
        type: "diagram",
        nodes: graph.nodes,
        edges: graph.edges,
        ...(updatedAt ? { updatedAt } : {}),
      });
    }
  }
  const html = textHtmlFromBlocks(blocks);
  if (html.length > MAX_TEXT) {
    throw new Error("TEXT_TOO_LONG");
  }
  if (blocks.length === 0) {
    blocks.push({ id: "text", type: "text", html: "" });
  }
  return blocks;
}
