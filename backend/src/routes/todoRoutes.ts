import { Router } from "express";

import { archived, assigned, create, list, remove, update } from "../controllers/todoController";
import { requireAuth } from "../middlewares/requireAuth";

const todoRoutes = Router();

todoRoutes.use(requireAuth);

todoRoutes.get("/", list);
todoRoutes.get("/assigned", assigned);
todoRoutes.get("/archived", archived);
todoRoutes.post("/", create);
todoRoutes.put("/:id", update);
todoRoutes.delete("/:id", remove);

export default todoRoutes;
