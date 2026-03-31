import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { addAttachment, listAttachments, getAttachmentFile, deleteAttachment } from "../services/attachmentService";
import { canAccessTodo } from "../services/todoService";
import { ForbiddenError } from "../utils/errors";

export async function uploadAttachment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  const file = req.file;
  if (!file) { res.status(400).json({ message: "Aucun fichier fourni" }); return; }
  const attachment = addAttachment(todoId, req.user!.uid, file);
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
  const { attachment, filePath } = getAttachmentFile(todoId, attachmentId);
  const asciiName = attachment.originalName.replace(/[^\x20-\x7E]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
  );
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(filePath);
}

export async function removeAttachment(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const attachmentId = req.params.attachmentId as string;
  if (!canAccessTodo(req.user!.uid, todoId)) throw new ForbiddenError("Accès refusé");
  deleteAttachment(todoId, attachmentId, req.user!.uid);
  res.status(204).end();
}
