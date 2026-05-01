import { Router } from "express";
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
} from "../controllers/noteController";
import {
  uploadNoteAttachment,
  listNoteAttachmentsHandler,
  downloadNoteAttachment,
  removeNoteAttachment,
  downloadTaskAttachmentViaNote,
} from "../controllers/noteAttachmentController";
import { requireAuth } from "../middlewares/requireAuth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const noteRoutes = Router();

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

// Note attachments — note-namespace files.
noteRoutes.get("/:noteId/attachments", listNoteAttachmentsHandler);
noteRoutes.post("/:noteId/attachments", upload.single("file"), uploadNoteAttachment);
noteRoutes.get("/:noteId/attachments/:attachmentId", downloadNoteAttachment);
noteRoutes.delete("/:noteId/attachments/:attachmentId", removeNoteAttachment);

// Task-attachment access via note context (note must be linked to the task).
noteRoutes.get("/:noteId/task-attachments/:todoId/:attachmentId", downloadTaskAttachmentViaNote);

noteRoutes.get("/:id", get);
noteRoutes.put("/:id", update);
noteRoutes.delete("/:id", remove);

export default noteRoutes;
