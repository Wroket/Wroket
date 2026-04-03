import { Router } from "express";

import { list, listShared, byTodo, todoNoteMap, get, create, update, remove, sync, exportNotes } from "../controllers/noteController";
import { requireAuth } from "../middlewares/requireAuth";

const noteRoutes = Router();

noteRoutes.use(requireAuth);

noteRoutes.get("/", list);
noteRoutes.post("/", create);
noteRoutes.get("/export", exportNotes);
noteRoutes.get("/shared", listShared);
noteRoutes.get("/by-todo/:todoId", byTodo);
noteRoutes.get("/todo-note-map", todoNoteMap);
noteRoutes.post("/sync", sync);
noteRoutes.get("/:id", get);
noteRoutes.put("/:id", update);
noteRoutes.delete("/:id", remove);

export default noteRoutes;
