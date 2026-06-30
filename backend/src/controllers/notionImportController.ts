import { Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

import { AuthenticatedRequest } from "./authController";
import { confirmNotionZipImport, parseUploadAsNotionPreview } from "../services/notionImportService";
import { ValidationError } from "../utils/errors";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (
      name.endsWith(".zip") ||
      name.endsWith(".csv") ||
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.mimetype === "text/csv"
    ) {
      cb(null, true);
    } else {
      cb(new ValidationError("Seuls les fichiers ZIP (export Notion) ou CSV sont acceptés", "IMPORT_NOTION_INVALID"));
    }
  },
});

export const notionUploadMiddleware = upload.single("file");

export const notionPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop d'aperçus Notion — réessayez dans une minute", code: "IMPORT_NOTION_RATE_LIMIT" },
});

export async function previewNotionImport(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new ValidationError("Fichier ZIP requis", "IMPORT_NOTION_INVALID");

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  const teamId = (req.body?.teamId as string | undefined) || null;
  const databaseIndex = Number.parseInt(String(req.body?.databaseIndex ?? "0"), 10);

  const result = await parseUploadAsNotionPreview(
    req.file.buffer,
    req.user!.uid,
    req.user!.email,
    projectName,
    teamId,
    Number.isFinite(databaseIndex) ? databaseIndex : 0,
  );
  res.status(200).json(result);
}

export async function confirmNotionImport(req: AuthenticatedRequest, res: Response) {
  if (!req.file) throw new ValidationError("Fichier ZIP requis", "IMPORT_NOTION_INVALID");

  const projectName = (req.body?.projectName as string | undefined)?.trim();
  if (!projectName) throw new ValidationError("Nom du projet requis");
  const teamId = (req.body?.teamId as string | undefined) || null;
  const databaseIndex = Number.parseInt(String(req.body?.databaseIndex ?? "0"), 10);
  const importMode = (req.body?.importMode as string | undefined)?.trim();
  const mode =
    importMode === "create_new" || importMode === "merge" ? importMode : undefined;

  const result = await confirmNotionZipImport(
    req.user!.uid,
    req.user!.email,
    req.file.buffer,
    projectName,
    teamId,
    Number.isFinite(databaseIndex) ? databaseIndex : 0,
    mode ?? "merge",
  );
  res.status(201).json(result);
}
