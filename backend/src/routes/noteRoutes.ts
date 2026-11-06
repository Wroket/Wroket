import { Router, type RequestHandler } from "express";
import multer from "multer";

import {
  list,
  listShared,
  byTodo,
  todoNoteMap,
  get,
  create,
  update,
  remove,
  sync,
  exportNotes,
  importNotes,
  listArchived,
  restoreArchived,
  purgeArchived,
  listFolders,
  createFolder,
  removeFolder,
  getNoteLive,
  postNotePresence,
} from "../controllers/noteController";
import {
  uploadNoteAttachment,
  listNoteAttachmentsHandler,
  downloadNoteAttachment,
  removeNoteAttachment,
  downloadTaskAttachmentViaNote,
} from "../controllers/noteAttachmentController";
import { getOcrConfig, ocrUploadedImage, ocrNoteAttachment } from "../controllers/noteOcrController";
import { spawnedTasks, spawnTasks } from "../controllers/noteSpawnController";
import { getDiagramConfig, recognizeDiagram, saveDiagram } from "../controllers/noteDiagramController";
import { getTaskSuggestConfig, suggestTasks } from "../controllers/taskSuggestController";
import { requireAuth } from "../middlewares/requireAuth";
import { UnprocessableEntityError } from "../utils/errors";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const noteRoutes = Router();

/** Single image upload for OCR; oversize files become a structured 422 instead of a 500. */
const ocrUpload: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new UnprocessableEntityError("Image trop volumineuse (max 5 Mo)", "OCR_UNSUPPORTED_TYPE"));
      return;
    }
    next(err as Error | undefined);
  });
};

noteRoutes.use(requireAuth);

noteRoutes.get("/", list);
noteRoutes.post("/", create);
noteRoutes.get("/export", exportNotes);
noteRoutes.post("/import", upload.single("file"), importNotes);
noteRoutes.get("/shared", listShared);
noteRoutes.get("/by-todo/:todoId", byTodo);
noteRoutes.get("/todo-note-map", todoNoteMap);
noteRoutes.post("/sync", sync);
noteRoutes.get("/archived", listArchived);
noteRoutes.post("/archived/:id/restore", restoreArchived);
noteRoutes.delete("/archived/:id", purgeArchived);
noteRoutes.get("/folders", listFolders);
noteRoutes.post("/folders", createFolder);
noteRoutes.delete("/folders/:name", removeFolder);
noteRoutes.get("/ocr/config", getOcrConfig);
noteRoutes.get("/diagram/config", getDiagramConfig);
noteRoutes.get("/task-suggestions/config", getTaskSuggestConfig);

// Note attachments — note-namespace files.
noteRoutes.get("/:noteId/attachments", listNoteAttachmentsHandler);
noteRoutes.post("/:noteId/attachments", upload.single("file"), uploadNoteAttachment);
noteRoutes.get("/:noteId/attachments/:attachmentId", downloadNoteAttachment);
noteRoutes.delete("/:noteId/attachments/:attachmentId", removeNoteAttachment);
noteRoutes.post("/:noteId/attachments/:attachmentId/ocr", ocrNoteAttachment);

// OCR — image → text preview, nothing persisted.
noteRoutes.post("/:noteId/ocr", ocrUpload, ocrUploadedImage);

// Tasks proposed from the note, and photo → workflow graph.
noteRoutes.get("/:noteId/spawned-tasks", spawnedTasks);
noteRoutes.post("/:noteId/spawn-tasks", spawnTasks);
noteRoutes.post("/:noteId/task-suggestions", suggestTasks);
noteRoutes.post("/:noteId/diagram", ocrUpload, recognizeDiagram);
noteRoutes.put("/:noteId/diagram", saveDiagram);

// Task-attachment access via note context (note must be linked to the task).
noteRoutes.get("/:noteId/task-attachments/:todoId/:attachmentId", downloadTaskAttachmentViaNote);

noteRoutes.get("/:id/live", getNoteLive);
noteRoutes.post("/:id/presence", postNotePresence);
noteRoutes.get("/:id", get);
noteRoutes.put("/:id", update);
noteRoutes.delete("/:id", remove);

export default noteRoutes;
