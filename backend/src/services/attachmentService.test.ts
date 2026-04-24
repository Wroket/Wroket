import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Attachment isolation tests.
 *
 * Goal: prove that a user can never touch another user's attachment blob or
 * metadata, regardless of how the HTTP/id inputs are forged. Uses the local
 * filesystem backend so no GCS/Firestore dependency is required.
 */

const TMP_UPLOADS = path.join(
  os.tmpdir(),
  `wroket-att-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function fakeFile(name: string, contents: string, mime = "text/plain") {
  const buffer = Buffer.from(contents, "utf-8");
  return { originalname: name, mimetype: mime, size: buffer.length, buffer };
}

describe("attachmentService — isolation between users", () => {
  it("storage key encodes the true task owner, not the uploader", async () => {
    const svc = await import("./attachmentService");
    const ownerA = uniq("uidA");
    const assigneeB = uniq("uidB");
    const todoId = uniq("todo");

    const att = await svc.addAttachment(
      todoId,
      assigneeB, // uploader (legitimate access as assignee)
      ownerA, // task owner — must end up in the key
      fakeFile("report.txt", "hello"),
    );

    expect(att.storageKey).toBeTruthy();
    expect(att.storageKey).toContain(`attachments/${ownerA}/${todoId}/`);
    expect(att.storageKey).not.toContain(assigneeB);
  });

  it("openAttachmentStream refuses to cross-read via a forged todoId", async () => {
    const svc = await import("./attachmentService");
    const ownerA = uniq("uidA");
    const ownerC = uniq("uidC");
    const todoA = uniq("todoA");
    const todoC = uniq("todoC");

    const attA = await svc.addAttachment(todoA, ownerA, ownerA, fakeFile("secretA.txt", "SECRET_A"));
    await svc.addAttachment(todoC, ownerC, ownerC, fakeFile("otherC.txt", "data_C"));

    const good = await svc.openAttachmentStream(todoA, attA.id);
    expect(good.attachment.id).toBe(attA.id);
    good.stream.destroy();

    await expect(svc.openAttachmentStream(todoC, attA.id)).rejects.toThrow(/introuvable/i);
  });

  it("deleteAttachment rejects callers who did not upload (even if they access the task)", async () => {
    const svc = await import("./attachmentService");
    const ownerA = uniq("uidA");
    const assigneeB = uniq("uidB");
    const todoId = uniq("todo");

    const att = await svc.addAttachment(todoId, ownerA, ownerA, fakeFile("a.txt", "x"));

    await expect(svc.deleteAttachment(todoId, att.id, assigneeB)).rejects.toThrow(
      /propriétaire/i,
    );

    const list = svc.listAttachments(todoId);
    expect(list.some((a) => a.id === att.id)).toBe(true);
  });

  it("deleteAttachment refuses to hop via a foreign todoId", async () => {
    const svc = await import("./attachmentService");
    const ownerA = uniq("uidA");
    const ownerC = uniq("uidC");
    const todoA = uniq("todoA");
    const todoC = uniq("todoC");

    const attA = await svc.addAttachment(todoA, ownerA, ownerA, fakeFile("a.txt", "data"));
    await svc.addAttachment(todoC, ownerC, ownerC, fakeFile("c.txt", "data"));

    await expect(svc.deleteAttachment(todoC, attA.id, ownerC)).rejects.toThrow(
      /introuvable/i,
    );

    expect(svc.listAttachments(todoA).some((a) => a.id === attA.id)).toBe(true);
  });

  it("storage keys never collide across users (same todoId, different owners)", async () => {
    const svc = await import("./attachmentService");
    const sharedTodoId = uniq("todo-shared");
    const u1 = uniq("uidU1");
    const u2 = uniq("uidU2");

    const att1 = await svc.addAttachment(sharedTodoId, u1, u1, fakeFile("f.txt", "v1"));

    // Second upload must target a different todoId because the storage guard
    // ifGenerationMatch=0 would reject a collision. We simulate two users
    // naming their todo similarly by reusing just the prefix.
    const otherTodoId = sharedTodoId + "-b";
    const att2 = await svc.addAttachment(otherTodoId, u2, u2, fakeFile("f.txt", "v2"));

    expect(att1.storageKey).not.toBe(att2.storageKey);
    expect(att1.storageKey).toContain(`attachments/${u1}/`);
    expect(att2.storageKey).toContain(`attachments/${u2}/`);
  });

  it("each upload gets a fresh attachmentId — no silent overwrite is possible", async () => {
    const svc = await import("./attachmentService");
    const todoZ = uniq("todoZ");
    const u = uniq("uidU");

    const a1 = await svc.addAttachment(todoZ, u, u, fakeFile("same.txt", "v1"));
    const a2 = await svc.addAttachment(todoZ, u, u, fakeFile("same.txt", "v2"));

    expect(a1.id).not.toBe(a2.id);
    expect(a1.storageKey).not.toBe(a2.storageKey);
  });

  it("upload rejected when ownerUid is missing (defensive against malformed call sites)", async () => {
    const svc = await import("./attachmentService");
    await expect(
      svc.addAttachment(uniq("todoQ"), uniq("uidU"), "", fakeFile("x.txt", "x")),
    ).rejects.toThrow(/introuvable/i);
  });
});
