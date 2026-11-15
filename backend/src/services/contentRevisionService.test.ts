import { describe, expect, test } from "vitest";

import {
  MAX_REVISIONS,
  pushNoteRevision,
  listNoteRevisions,
  pushDatabaseRevision,
  listDatabaseRevisions,
} from "./contentRevisionService";

describe("contentRevisionService", () => {
  test("note revisions ring keeps max 5", () => {
    const noteId = `note-${Date.now()}`;
    for (let i = 0; i < 7; i++) {
      pushNoteRevision(
        noteId,
        { title: `t${i}`, content: `c${i}`, blocks: undefined },
        "uid-a",
        "a@test.local",
      );
    }
    const revs = listNoteRevisions(noteId);
    expect(revs.length).toBe(MAX_REVISIONS);
    expect(revs[0].snapshot.title).toBe("t6");
    expect(revs[4].snapshot.title).toBe("t2");
  });

  test("skips no-op duplicate snapshot", () => {
    const noteId = `note-dup-${Date.now()}`;
    const snap = { title: "same", content: "x", blocks: undefined };
    expect(pushNoteRevision(noteId, snap, "u")).not.toBeNull();
    expect(pushNoteRevision(noteId, snap, "u")).toBeNull();
    expect(listNoteRevisions(noteId).length).toBe(1);
  });

  test("database revisions ring", () => {
    const dbId = `db-${Date.now()}`;
    for (let i = 0; i < 6; i++) {
      pushDatabaseRevision(
        dbId,
        {
          name: `n${i}`,
          columns: [],
          defaultView: "table",
          boardGroupColumnId: null,
          rows: [],
        },
        "uid-b",
      );
    }
    expect(listDatabaseRevisions(dbId).length).toBe(MAX_REVISIONS);
  });
});
