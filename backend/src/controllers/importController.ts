import { Response } from "express";
import multer from "multer";

import { AuthenticatedRequest } from "./authController";
import { parseCsv, validateAndPreview, executeImport } from "../services/importService";
import { ValidationError } from "../utils/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new ValidationError("Seuls les fichiers CSV sont acceptés"));
    }
  },
});

export const uploadMiddleware = upload.single("file");

export async function preview(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new ValidationError("Fichier CSV requis");
  const projectName = (req.body?.projectName as string)?.trim();
  if (!projectName) throw new ValidationError("Nom du projet requis");

  const rows = parseCsv(req.file.buffer);
  const result = validateAndPreview(rows, projectName);
  res.status(200).json(result);
}

export async function confirm(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new ValidationError("Fichier CSV requis");
  const projectName = (req.body?.projectName as string)?.trim();
  if (!projectName) throw new ValidationError("Nom du projet requis");
  const teamId = (req.body?.teamId as string) || null;

  const rows = parseCsv(req.file.buffer);
  const preview = validateAndPreview(rows, projectName);

  if (preview.errors.length > 0) {
    throw new ValidationError(`${preview.errors.length} erreur(s) dans le CSV — utilisez l'aperçu pour corriger`);
  }

  const result = executeImport(req.user!.uid, req.user!.email, projectName, teamId, preview.tasks);
  res.status(201).json(result);
}
