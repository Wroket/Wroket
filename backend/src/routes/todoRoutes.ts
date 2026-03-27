import { Router } from "express";

import { assigned, create, list, remove, update } from "../controllers/todoController";
import { requireAuth } from "../middlewares/requireAuth";

const todoRoutes = Router();

todoRoutes.use(requireAuth);

todoRoutes.get("/", list);
todoRoutes.get("/assigned", assigned);
todoRoutes.post("/", create);
todoRoutes.put("/:id", update);
todoRoutes.delete("/:id", remove);

export default todoRoutes;
