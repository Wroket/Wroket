import { Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

import { AuthenticatedRequest } from "./authController";
import { buildMondayCsvSnapshot } from "../services/mondayApiService";
import {
  applySyncDiff,
  assertSyncEntitlement,
  computeSyncDiff,
  type SyncImportMode,
} from "../services/externalSyncService";
import { findProjectByExternalRef, getProjectById } from "../services/projectService";
import { ValidationError } from "../utils/errors";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".csv") || file.mimetype === "text/csv") {
      cb(null, true);
    } else {
      cb(new ValidationError("Seuls les fichiers CSV (export Monday) sont acceptés", "IMPORT_MONDAY_INVALID"));
    }
  },
});

export const mondayUploadMiddleware = upload.single("file");

export const mondayPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop d'aperçus Monday — réessayez dans une minute", code: "IMPORT_MONDAY_RATE_LIMIT" },
});

function parseImportMode(raw: unknown): SyncImportMode {
  return raw === "create_new" ? "create_new" : "merge";
}

export async function previewMondayImport(req: AuthenticatedRequest, res: Response) {
  assertSyncEntitlement(req.user!.uid);
  if (!req.file) throw new ValidationError("Fichier CSV requis", "IMPORT_MONDAY_INVALID");

  const projectName = (req.body?.projectName as string | undefined)?.trim() || "Monday";
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot, mappingReport } = buildMondayCsvSnapshot(req.file.buffer, projectName);
  const diff = await computeSyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId,
    importMode,
  });

  const mergeTarget = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "monday",
    snapshot.projectExternalId,
  );
  const existingProject = mergeTarget ? { id: mergeTarget.id, name: mergeTarget.name } : null;

  res.status(200).json({
    diff,
    snapshot: {
      projectName: snapshot.projectName,
      projectExternalId: snapshot.projectExternalId,
      phaseCount: snapshot.phases.length,
      taskCount: snapshot.tasks.length,
    },
    existingProject,
    mappingReport,
  });
}

export async function confirmMondayImport(req: AuthenticatedRequest, res: Response) {
  assertSyncEntitlement(req.user!.uid);
  if (!req.file) throw new ValidationError("Fichier CSV requis", "IMPORT_MONDAY_INVALID");

  const projectName = (req.body?.projectName as string | undefined)?.trim() || "Monday";
  const teamId = (req.body?.teamId as string | undefined) || null;
  const targetProjectId = (req.body?.targetProjectId as string | undefined)?.trim() || null;
  const importMode = parseImportMode(req.body?.importMode);

  const { snapshot } = buildMondayCsvSnapshot(req.file.buffer, projectName);
  const existingProject = findProjectByExternalRef(
    req.user!.uid,
    req.user!.email,
    "monday",
    snapshot.projectExternalId,
  );

  const result = await applySyncDiff(req.user!.uid, req.user!.email, snapshot, {
    teamId,
    targetProjectId: importMode === "merge" && existingProject ? existingProject.id : targetProjectId,
    importMode: existingProject ? importMode : "merge",
  });

  const project = getProjectById(result.projectId);
  if (!project) throw new ValidationError("Projet introuvable après import");

  res.status(201).json({
    project,
    ...result,
  });
}
