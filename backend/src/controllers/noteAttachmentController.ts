import type { Response } from "express";
import type { AuthenticatedRequest } from "./authController";

import {
  addNoteAttachment,
  listNoteAttachments,
  openNoteAttachmentStream,
  deleteNoteAttachment,
  openTaskAttachmentViaNote,
} from "../services/noteAttachmentService";
import { NotFoundError, ValidationError } from "../utils/errors";

/** POST /notes/:noteId/attachments */
export async function uploadNoteAttachment(req: AuthenticatedRequest, res: Response) {
  const noteId = req.params.noteId as string;
  const uid = req.user!.uid;

  if (!req.file) throw new ValidationError("Fichier manquant");

  const result = await addNoteAttachment(noteId, uid, {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    buffer: req.file.buffer,
  });

  res.status(201).json(result);
}

/** GET /notes/:noteId/attachments */
export async function listNoteAttachmentsHandler(req: AuthenticatedRequest, res: Response) {
  const noteId = req.params.noteId as string;
  const uid = req.user!.uid;

  const data = listNoteAttachments(noteId, uid);
  res.status(200).json(data);
}

/** GET /notes/:noteId/attachments/:attachmentId */
export async function downloadNoteAttachment(req: AuthenticatedRequest, res: Response) {
  const noteId = req.params.noteId as string;
  const attachmentId = req.params.attachmentId as string;
  const uid = req.user!.uid;

  const { attachment, stream } = await openNoteAttachmentStream(noteId, attachmentId, uid);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");

  stream.pipe(res);
}

/** DELETE /notes/:noteId/attachments/:attachmentId */
export async function removeNoteAttachment(req: AuthenticatedRequest, res: Response) {
  const noteId = req.params.noteId as string;
  const attachmentId = req.params.attachmentId as string;
  const uid = req.user!.uid;

  await deleteNoteAttachment(noteId, attachmentId, uid);
  res.status(204).send();
}

/**
 * GET /notes/:noteId/task-attachments/:todoId/:attachmentId
 * Download a task attachment through a note context (note must be linked to the task).
 */
export async function downloadTaskAttachmentViaNote(req: AuthenticatedRequest, res: Response) {
  const noteId = req.params.noteId as string;
  const todoId = req.params.todoId as string;
  const attachmentId = req.params.attachmentId as string;
  const uid = req.user!.uid;

  const { attachment, stream } = await openTaskAttachmentViaNote(noteId, todoId, attachmentId, uid);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");

  stream.pipe(res);
}
