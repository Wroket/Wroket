import { beforeEach, describe, expect, test } from "vitest";

import type { MondayDocSnapshot } from "./mondayApiService";
import {
  applyMondayDocSyncDiff,
  computeMondayDocSyncDiff,
} from "./mondayDocSyncService";
import { findNoteByExternalId } from "./noteService";

describe("mondayDocSyncService", () => {
  const uid = "user-monday-docs-test";

  beforeEach(() => {
    process.env.USE_LOCAL_STORE = "true";
  });

  const snapshot: MondayDocSnapshot = {
    provider: "monday",
    connectionId: "conn-1",
    docs: [
      {
        externalId: "doc-100",
        objectId: "obj-100",
        title: "Spec produit",
        markdown: "# Hello",
        contentHtml: "<h1>Hello</h1>",
        workspaceId: null,
        sourceUrl: null,
        updatedAt: null,
      },
    ],
  };

  test("computeMondayDocSyncDiff reports create for new doc", () => {
    const diff = computeMondayDocSyncDiff(uid, snapshot);
    expect(diff.summary.creates).toBe(1);
    expect(diff.docs.create[0]?.label).toBe("Spec produit");
  });

  test("applyMondayDocSyncDiff creates note with externalRef", () => {
    const result = applyMondayDocSyncDiff(uid, snapshot, { folder: "Monday" });
    expect(result.created).toBe(1);
    const note = findNoteByExternalId(uid, "monday", "doc-100");
    expect(note?.title).toBe("Spec produit");
    expect(note?.folder).toBe("Monday");
    expect(note?.externalRef?.connectionId).toBe("conn-1");
  });

  test("re-sync updates title and content", () => {
    applyMondayDocSyncDiff(uid, snapshot, { folder: "Monday" });
    const updated: MondayDocSnapshot = {
      ...snapshot,
      docs: [{
        ...snapshot.docs[0],
        title: "Spec v2",
        contentHtml: "<p>Updated</p>",
      }],
    };
    const diff = computeMondayDocSyncDiff(uid, updated);
    expect(diff.summary.updates).toBe(1);
    const result = applyMondayDocSyncDiff(uid, updated);
    expect(result.updated).toBe(1);
    const note = findNoteByExternalId(uid, "monday", "doc-100");
    expect(note?.title).toBe("Spec v2");
    expect(note?.content).toBe("<p>Updated</p>");
  });
});
