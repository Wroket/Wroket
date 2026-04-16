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
noteRoutes.get("/:id", get);
noteRoutes.put("/:id", update);
noteRoutes.delete("/:id", remove);

export default noteRoutes;
