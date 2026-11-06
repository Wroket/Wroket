import type { Response } from "express";
import type { AuthenticatedRequest } from "./authController";

import type { RequestWithId } from "../middlewares/requestId";
import { readNoteAttachmentForOcr } from "../services/noteAttachmentService";
import { canViewNote } from "../services/noteService";
import {
  assertOcrEnabledFor,
  getOcrConfigFor,
  normalizeLanguageHint,
  normalizeOcrSource,
  recognizeImageForUser,
} from "../services/ocrService";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors";

/** GET /notes/ocr/config — flag + remaining daily quota for the current user. */
export async function getOcrConfig(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  res.status(200).json(getOcrConfigFor(user.uid, user.email));
}

/**
 * POST /notes/:noteId/ocr — multipart `file` (image), optional `languageHint`, `source`.
 * Returns `{ text, detectedLanguages, code? }`; nothing is persisted.
 */
export async function ocrUploadedImage(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  assertOcrEnabledFor(user.uid, user.email);
  if (!canViewNote(user.uid, user.email, noteId)) throw new NotFoundError("Note introuvable");
  if (!req.file) {
    throw new UnprocessableEntityError("Image manquante", "OCR_UNSUPPORTED_TYPE");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await recognizeImageForUser({
    uid: user.uid,
    email: user.email,
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    languageHint: normalizeLanguageHint(body.languageHint),
    source: normalizeOcrSource(body.source),
    requestId: (req as unknown as RequestWithId).id,
  });
  res.status(200).json(result);
}

/**
 * POST /notes/:noteId/attachments/:attachmentId/ocr — OCR on an existing image
 * attachment (note namespace or linked task). Body: `{ languageHint? }`.
 */
export async function ocrNoteAttachment(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  const attachmentId = req.params.attachmentId as string;
  assertOcrEnabledFor(user.uid, user.email);
  const languageHint = normalizeLanguageHint((req.body as Record<string, unknown> | undefined)?.languageHint);

  const { mimeType, buffer } = await readNoteAttachmentForOcr(noteId, attachmentId, user.uid);
  const result = await recognizeImageForUser({
    uid: user.uid,
    email: user.email,
    buffer,
    mimeType,
    languageHint,
    source: "attachment",
    requestId: (req as unknown as RequestWithId).id,
  });
  res.status(200).json(result);
}
