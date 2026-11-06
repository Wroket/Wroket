import { describe, expect, it } from "vitest";

import { resolveNoteBlocks, textHtmlFromBlocks } from "./noteBlocks";

describe("resolveNoteBlocks", () => {
  it("keeps a saved block order", () => {
    const blocks = resolveNoteBlocks({
      content: "<p>ignoré</p>",
      blocks: [
        { id: "t", type: "text", html: "<p>A</p>" },
        { id: "d", type: "diagram", nodes: [{ id: "n", label: "SCAN" }], edges: [] },
      ],
    });
    expect(blocks.map((block) => block.id)).toEqual(["t", "d"]);
    expect(textHtmlFromBlocks(blocks)).toBe("<p>A</p>");
  });

  it("places a legacy diagram before the text", () => {
    const blocks = resolveNoteBlocks({
      content: "<p>Bonjour</p>",
      diagram: { nodes: [{ id: "n", label: "SCAN" }], edges: [], updatedAt: "2026-11-06T00:00:00.000Z" },
    });
    expect(blocks.map((block) => block.type)).toEqual(["diagram", "text"]);
  });
});
