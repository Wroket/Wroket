import { Router } from "express";
import multer from "multer";

import { uploadAttachment, getAttachments, downloadAttachment, removeAttachment } from "../controllers/attachmentController";
import { requireAuth } from "../middlewares/requireAuth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const attachmentRoutes = Router();

attachmentRoutes.use(requireAuth);

attachmentRoutes.post("/:todoId", upload.single("file"), uploadAttachment);
attachmentRoutes.get("/:todoId", getAttachments);
attachmentRoutes.get("/:todoId/:attachmentId", downloadAttachment);
attachmentRoutes.delete("/:todoId/:attachmentId", removeAttachment);

export default attachmentRoutes;
