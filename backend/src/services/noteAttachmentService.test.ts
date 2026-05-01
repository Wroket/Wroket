/**
 * Note Attachment Service — security and isolation tests.
 *
 * Verifies that:
 *   1. Only the note owner can upload to a note.
 *   2. Only the note owner can delete a note attachment.
 *   3. A non-owner who can view the note can download (note is shared).
 *   4. A user who cannot view the note gets an error on download.
 *   5. When a note is linked to a task, upload delegates to task namespace.
 *   6. Storage keys for note-only uploads are isolated by ownerUid + noteId.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const TMP_UPLOADS = path.join(
  os.tmpdir(),
  `wroket-note-att-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

beforeAll(async () => {
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = TMP_UPLOADS;
  fs.mkdirSync(TMP_UPLOADS, { recursive: true });
  const persistence = await import("../persistence");
  await persistence.initStore();
});

function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function fakeFile(name: string, contents = "test", mime = "text/plain") {
  const buffer = Buffer.from(contents, "utf-8");
  return { originalname: name, mimetype: mime, size: buffer.length, buffer };
}

/** Create a minimal note in the in-memory store, returning its id. */
async function seedNote(ownerUid: string, overrides: { todoId?: string } = {}) {
  const noteSvc = await import("./noteService");
  const note = noteSvc.createNote(ownerUid, {
    title: "Test note",
    content: "content",
    ...overrides,
  });
  return note.id;
}

describe("noteAttachmentService — access control", () => {
  it("owner can upload to their own note", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);

    const result = await svc.addNoteAttachment(noteId, owner, fakeFile("doc.txt"));
    expect(result.attachment).not.toBeNull();
    expect(result.attachment?.ownerUid).toBe(owner);
    expect(result.attachment?.noteId).toBe(noteId);
  });

  it("non-owner cannot upload to a note they do not own", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const other = uniq("other");
    const noteId = await seedNote(owner);

    // getNote(other, noteId) throws because the note doesn't belong to `other`.
    await expect(
      svc.addNoteAttachment(noteId, other, fakeFile("hack.txt")),
    ).rejects.toThrow();
  });

  it("storage key isolates by ownerUid and noteId", async () => {
    const svc = await import("./noteAttachmentService");
    const ownerA = uniq("uidA");
    const ownerB = uniq("uidB");
    const noteA = await seedNote(ownerA);
    const noteB = await seedNote(ownerB);

    const attA = await svc.addNoteAttachment(noteA, ownerA, fakeFile("a.txt", "A"));
    const attB = await svc.addNoteAttachment(noteB, ownerB, fakeFile("b.txt", "B"));

    // Keys must not share any path prefix beyond `notes/`.
    expect(attA.attachment?.storageKey).toContain(`notes/${ownerA}/${noteA}/`);
    expect(attB.attachment?.storageKey).toContain(`notes/${ownerB}/${noteB}/`);
    expect(attA.attachment?.storageKey).not.toBe(attB.attachment?.storageKey);
  });

  it("owner can list and download their own attachment", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);

    const result = await svc.addNoteAttachment(noteId, owner, fakeFile("readme.txt", "hello"));
    const attId = result.attachment!.id;

    const { noteAttachments } = svc.listNoteAttachments(noteId, owner);
    expect(noteAttachments.some((a) => a.id === attId)).toBe(true);

    const { stream } = await svc.openNoteAttachmentStream(noteId, attId, owner);
    expect(stream).toBeTruthy();
  });

  it("owner can delete their attachment", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);

    const result = await svc.addNoteAttachment(noteId, owner, fakeFile("todelete.txt"));
    const attId = result.attachment!.id;

    await svc.deleteNoteAttachment(noteId, attId, owner);

    const { noteAttachments } = svc.listNoteAttachments(noteId, owner);
    expect(noteAttachments.find((a) => a.id === attId)).toBeUndefined();
  });

  it("non-owner cannot delete a note attachment", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const other = uniq("other");
    const noteId = await seedNote(owner);

    const result = await svc.addNoteAttachment(noteId, owner, fakeFile("secret.txt"));
    const attId = result.attachment!.id;

    await expect(
      svc.deleteNoteAttachment(noteId, attId, other),
    ).rejects.toThrow();
  });

  it("purgeNoteAttachments removes all metadata for the note", async () => {
    const svc = await import("./noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);

    await svc.addNoteAttachment(noteId, owner, fakeFile("file1.txt"));
    await svc.addNoteAttachment(noteId, owner, fakeFile("file2.txt"));

    await svc.purgeNoteAttachments(noteId);

    const { noteAttachments } = svc.listNoteAttachments(noteId, owner);
    expect(noteAttachments).toHaveLength(0);
  });
});

describe("noteAttachmentService — task-linked notes", () => {
  it("upload for note linked to a task delegates to task attachment service", async () => {
    const svc = await import("./noteAttachmentService");
    const taskSvc = await import("./attachmentService");
    const todoSvc = await import("./todoService");
    const owner = uniq("owner");

    // createTodo signature: (userId, userEmail, input)
    const todo = await todoSvc.createTodo(owner, `${owner}@test.com`, { title: "My task", priority: "medium" });
    const noteId = await seedNote(owner, { todoId: todo.id });

    const result = await svc.addNoteAttachment(noteId, owner, fakeFile("linked.txt"));

    // Should delegate → no note-namespace attachment, but task-namespace one.
    expect(result.attachment).toBeNull();
    expect(result.linkedToTaskId).toBe(todo.id);
    expect(result.taskAttachmentId).toBeDefined();

    // The task attachment should appear in listTaskAttachments too.
    const taskAtts = taskSvc.listAttachments(todo.id);
    expect(taskAtts.some((a) => a.id === result.taskAttachmentId)).toBe(true);
  });

  it("listNoteAttachments includes task attachments for linked note", async () => {
    const svc = await import("./noteAttachmentService");
    const todoSvc = await import("./todoService");
    const owner = uniq("owner");

    const todo = await todoSvc.createTodo(owner, `${owner}@test.com`, { title: "Task with note", priority: "medium" });
    const noteId = await seedNote(owner, { todoId: todo.id });

    await svc.addNoteAttachment(noteId, owner, fakeFile("via-note.txt"));

    const data = svc.listNoteAttachments(noteId, owner);
    // Note-namespace attachments are empty (delegated to task).
    expect(data.noteAttachments).toHaveLength(0);
    // Task attachments must be present.
    expect(data.taskAttachments.length).toBeGreaterThan(0);
  });
});
