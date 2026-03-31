import { Router } from "express";

import { archived, assigned, create, list, remove, update, getComments, postComment, removeComment, editCommentHandler, toggleReactionHandler } from "../controllers/todoController";
import { requireAuth } from "../middlewares/requireAuth";

const todoRoutes = Router();

todoRoutes.use(requireAuth);

todoRoutes.get("/", list);
todoRoutes.get("/assigned", assigned);
todoRoutes.get("/archived", archived);
todoRoutes.post("/", create);
todoRoutes.put("/:id", update);
todoRoutes.delete("/:id", remove);
todoRoutes.get("/:id/comments", getComments);
todoRoutes.post("/:id/comments", postComment);
todoRoutes.put("/:id/comments/:commentId", editCommentHandler);
todoRoutes.delete("/:id/comments/:commentId", removeComment);
todoRoutes.post("/:id/comments/:commentId/reactions", toggleReactionHandler);

export default todoRoutes;
