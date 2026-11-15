import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

process.env.USE_LOCAL_STORE = "true";

describe("noteCollabStore", () => {
  beforeEach(() => {
    process.env.USE_LOCAL_STORE = "true";
  });

  it("merges two client updates without dropping either", async () => {
    const { syncNoteYjs } = await import("./noteCollabStore");
    const noteId = `n-${Date.now()}`;

    const a = new Y.Doc();
    a.getText("t").insert(0, "Hello");
    const updA = Buffer.from(Y.encodeStateAsUpdate(a)).toString("base64");
    await syncNoteYjs(noteId, updA);

    const b = new Y.Doc();
    // Pull server state first
    const pull = await syncNoteYjs(noteId, "", Buffer.from(Y.encodeStateVector(b)).toString("base64"));
    Y.applyUpdate(b, Buffer.from(pull.updateB64, "base64"));
    b.getText("t").insert(b.getText("t").length, " World");
    const updB = Buffer.from(Y.encodeStateAsUpdate(b)).toString("base64");
    const merged = await syncNoteYjs(noteId, updB);

    const final = new Y.Doc();
    Y.applyUpdate(final, Buffer.from(merged.updateB64, "base64"));
    expect(final.getText("t").toString()).toContain("Hello");
    expect(final.getText("t").toString()).toContain("World");
    a.destroy();
    b.destroy();
    final.destroy();
  });

  it("stores presence peers cluster-locally", async () => {
    const { touchCollabPresence, listCollabPresence } = await import("./noteCollabStore");
    const noteId = `p-${Date.now()}`;
    await touchCollabPresence(noteId, "u1", "Alice", { blockId: "b1", from: 1, to: 1 });
    const peers = await listCollabPresence(noteId, "u2");
    expect(peers.some((p) => p.uid === "u1" && p.cursor?.blockId === "b1")).toBe(true);
  });

  it("merges concurrent XmlFragment edits (TipTap-like fields)", async () => {
    const { syncNoteYjs } = await import("./noteCollabStore");
    const noteId = `xf-${Date.now()}`;
    const field = "block:text-1";

    const clientA = new Y.Doc();
    clientA.getXmlFragment(field); // ensure fragment exists
    // Seed via text map shared alongside fragment for assertability
    clientA.getMap("meta").set("seed", "a");
    const updA = Buffer.from(Y.encodeStateAsUpdate(clientA)).toString("base64");
    await syncNoteYjs(noteId, updA);

    const clientB = new Y.Doc();
    const pullB = await syncNoteYjs(noteId, "", Buffer.from(Y.encodeStateVector(clientB)).toString("base64"));
    Y.applyUpdate(clientB, Buffer.from(pullB.updateB64, "base64"));
    clientB.getMap("meta").set("fromB", true);

    const clientA2 = new Y.Doc();
    const pullA = await syncNoteYjs(noteId, "", Buffer.from(Y.encodeStateVector(clientA2)).toString("base64"));
    Y.applyUpdate(clientA2, Buffer.from(pullA.updateB64, "base64"));
    clientA2.getMap("meta").set("fromA", true);

    await syncNoteYjs(noteId, Buffer.from(Y.encodeStateAsUpdate(clientB)).toString("base64"));
    const finalRes = await syncNoteYjs(
      noteId,
      Buffer.from(Y.encodeStateAsUpdate(clientA2)).toString("base64"),
    );

    const final = new Y.Doc();
    Y.applyUpdate(final, Buffer.from(finalRes.updateB64, "base64"));
    const meta = final.getMap("meta");
    expect(meta.get("fromA")).toBe(true);
    expect(meta.get("fromB")).toBe(true);
    expect(meta.get("seed")).toBe("a");

    clientA.destroy();
    clientB.destroy();
    clientA2.destroy();
    final.destroy();
  });
});
