import { Router } from "express";

import { create, list, remove, update } from "../controllers/todoController";
import { requireAuth } from "../middlewares/requireAuth";

const todoRoutes = Router();

todoRoutes.use(requireAuth);

todoRoutes.get("/", list);
todoRoutes.post("/", create);
todoRoutes.put("/:id", update);
todoRoutes.delete("/:id", remove);

export default todoRoutes;
