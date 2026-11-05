/**
 * Note OCR controller — access control, flag and attachment path.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authController";

const TMP_UPLOADS = path.join(
  os.tmpdir(),
  `wroket-note-ocr-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

beforeAll(async () => {
  process.env.USE_LOCAL_STORE = "true";
  process.env.ATTACHMENTS_BACKEND = "local";
  process.env.UPLOAD_DIR = TMP_UPLOADS;
  fs.mkdirSync(TMP_UPLOADS, { recursive: true });
  const persistence = await import("../persistence");
  await persistence.initStore();
});

beforeEach(async () => {
  process.env.OCR_ENABLED = "true";
  process.env.OCR_PROVIDER = "mock";
  delete process.env.OCR_BETA_EMAILS;
  const ocr = await import("../services/ocrService");
  ocr.__resetOcrQuota();
  ocr.__setOcrProviderForTests(null);
});

afterAll(() => {
  delete process.env.OCR_ENABLED;
  delete process.env.OCR_PROVIDER;
});

function uniq(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function fakeReq(
  uid: string,
  params: Record<string, string>,
  extra: { file?: { buffer: Buffer; mimetype: string }; body?: Record<string, unknown> } = {},
): AuthenticatedRequest {
  return {
    user: { uid, email: `${uid}@test.com` },
    params,
    body: extra.body ?? {},
    file: extra.file,
  } as unknown as AuthenticatedRequest;
}

async function seedNote(ownerUid: string): Promise<string> {
  const noteSvc = await import("../services/noteService");
  return noteSvc.createNote(ownerUid, { title: "OCR note", content: "" }).id;
}

const image = { buffer: Buffer.from("fake-jpeg"), mimetype: "image/jpeg" };

describe("noteOcrController", () => {
  it("returns OCR text for the note owner", async () => {
    const ctrl = await import("./noteOcrController");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);
    const res = fakeRes();

    await ctrl.ocrUploadedImage(fakeReq(owner, { noteId }, { file: image, body: { languageHint: "fr" } }), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect((res.body as { text: string }).text).toContain("mock");
  });

  it("returns 404 when the user cannot view the note", async () => {
    const ctrl = await import("./noteOcrController");
    const noteId = await seedNote(uniq("owner"));
    await expect(
      ctrl.ocrUploadedImage(fakeReq(uniq("intruder"), { noteId }, { file: image }), fakeRes() as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 503 OCR_DISABLED when the flag is off", async () => {
    process.env.OCR_ENABLED = "false";
    const ctrl = await import("./noteOcrController");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);
    await expect(
      ctrl.ocrUploadedImage(fakeReq(owner, { noteId }, { file: image }), fakeRes() as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 503, code: "OCR_DISABLED" });
  });

  it("rejects a missing file and an invalid language hint with 422", async () => {
    const ctrl = await import("./noteOcrController");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);
    await expect(
      ctrl.ocrUploadedImage(fakeReq(owner, { noteId }), fakeRes() as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 422, code: "OCR_UNSUPPORTED_TYPE" });
    await expect(
      ctrl.ocrUploadedImage(
        fakeReq(owner, { noteId }, { file: image, body: { languageHint: "<script>" } }),
        fakeRes() as unknown as Response,
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: "OCR_INVALID_LANGUAGE" });
  });

  it("runs OCR on an existing image attachment and refuses non-images", async () => {
    const ctrl = await import("./noteOcrController");
    const attSvc = await import("../services/noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);

    const img = await attSvc.addNoteAttachment(noteId, owner, {
      originalname: "board.png",
      mimetype: "image/png",
      size: 9,
      buffer: Buffer.from("fake-png!"),
    });
    const res = fakeRes();
    await ctrl.ocrNoteAttachment(
      fakeReq(owner, { noteId, attachmentId: img.attachment!.id }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { text: string }).text).toContain("mock");

    const txt = await attSvc.addNoteAttachment(noteId, owner, {
      originalname: "doc.txt",
      mimetype: "text/plain",
      size: 4,
      buffer: Buffer.from("text"),
    });
    await expect(
      ctrl.ocrNoteAttachment(fakeReq(owner, { noteId, attachmentId: txt.attachment!.id }), fakeRes() as unknown as Response),
    ).rejects.toMatchObject({ statusCode: 422, code: "OCR_UNSUPPORTED_TYPE" });
  });

  it("returns 404 for an attachment of a note the user cannot view", async () => {
    const ctrl = await import("./noteOcrController");
    const attSvc = await import("../services/noteAttachmentService");
    const owner = uniq("owner");
    const noteId = await seedNote(owner);
    const img = await attSvc.addNoteAttachment(noteId, owner, {
      originalname: "board.png",
      mimetype: "image/png",
      size: 9,
      buffer: Buffer.from("fake-png!"),
    });
    await expect(
      ctrl.ocrNoteAttachment(
        fakeReq(uniq("intruder"), { noteId, attachmentId: img.attachment!.id }),
        fakeRes() as unknown as Response,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
