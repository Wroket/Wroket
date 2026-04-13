import { Router } from "express";

import multer from "multer";

import {
  archived, assigned, create, list, remove, update, getComments, postComment, removeComment, editCommentHandler,
  toggleReactionHandler, commentCounts, exportTodos, importTodos, previewTaskImport, confirmTaskImport, taskActivity, reorderTodos,
} from "../controllers/todoController";
import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const todoRoutes = Router();

todoRoutes.use(requireAuth);
todoRoutes.use(noStoreCache);

todoRoutes.get("/", list);
todoRoutes.get("/assigned", assigned);
todoRoutes.get("/archived", archived);
todoRoutes.get("/comment-counts", commentCounts);
todoRoutes.get("/export", exportTodos);
todoRoutes.post("/import/preview", upload.single("file"), previewTaskImport);
todoRoutes.post("/import/confirm", confirmTaskImport);
todoRoutes.post("/import", upload.single("file"), importTodos);
todoRoutes.post("/", create);
todoRoutes.put("/reorder", reorderTodos);
todoRoutes.put("/:id", update);
todoRoutes.delete("/:id", remove);
todoRoutes.get("/:id/activity", taskActivity);
todoRoutes.get("/:id/comments", getComments);
todoRoutes.post("/:id/comments", postComment);
todoRoutes.put("/:id/comments/:commentId", editCommentHandler);
todoRoutes.delete("/:id/comments/:commentId", removeComment);
todoRoutes.post("/:id/comments/:commentId/reactions", toggleReactionHandler);

export default todoRoutes;
