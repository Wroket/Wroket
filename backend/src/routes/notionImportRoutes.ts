import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import {
  confirmNotionImport,
  notionPreviewLimiter,
  notionUploadMiddleware,
  previewNotionImport,
} from "../controllers/notionImportController";

const router = Router();

router.post("/notion/preview", requireAuth, notionPreviewLimiter, notionUploadMiddleware, previewNotionImport);
router.post("/notion/confirm", requireAuth, notionUploadMiddleware, confirmNotionImport);

export default router;
