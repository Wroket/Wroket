import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  addAttachment,
  deleteAttachment,
  listAttachments,
  openAttachmentStream,
} from "../services/attachmentService";
import { canAccessTodo, getTodoStoreOwnerId } from "../services/todoService";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export async function uploadAttachment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  const file = req.file;
  if (!file) { res.status(400).json({ message: "Aucun fichier fourni" }); return; }
  // Resolve the true task owner server-side. Never trust client input to build
  // storage keys — this guarantees a caller cannot upload under another user's
  // namespace even if they have legitimate task access (e.g. as an assignee).
  const ownerUid = getTodoStoreOwnerId(todoId);
  if (!ownerUid) throw new NotFoundError("Tâche introuvable");
  const attachment = await addAttachment(todoId, req.user!.uid, ownerUid, file);
  res.status(201).json(attachment);
}

export async function getAttachments(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  res.status(200).json(listAttachments(todoId));
}

export async function downloadAttachment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const attachmentId = req.params.attachmentId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  // The lookup is strictly `(todoId, attachmentId)`. An attachmentId belonging
  // to a different task won't resolve here, so a caller cannot cross-read by
  // swapping ids in the URL.
  const { attachment, stream } = await openAttachmentStream(todoId, attachmentId);
  const asciiName = attachment.originalName.replace(/[^\x20-\x7E]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=0, no-store");
  stream.on("error", (err) => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  stream.pipe(res);
}

export async function removeAttachment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const attachmentId = req.params.attachmentId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  await deleteAttachment(todoId, attachmentId, req.user!.uid);
  res.status(204).end();
}
