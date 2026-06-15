import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import {
  confirmMondayImport,
  mondayPreviewLimiter,
  mondayUploadMiddleware,
  previewMondayImport,
} from "../controllers/mondayImportController";

const router = Router();

router.post("/monday/preview", requireAuth, mondayPreviewLimiter, mondayUploadMiddleware, previewMondayImport);
router.post("/monday/confirm", requireAuth, mondayUploadMiddleware, confirmMondayImport);

export default router;
