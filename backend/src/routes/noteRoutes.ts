import { Router } from "express";

import { list, get, create, update, remove, sync } from "../controllers/noteController";
import { requireAuth } from "../middlewares/requireAuth";

const noteRoutes = Router();

noteRoutes.use(requireAuth);

noteRoutes.get("/", list);
noteRoutes.post("/", create);
noteRoutes.post("/sync", sync);
noteRoutes.get("/:id", get);
noteRoutes.put("/:id", update);
noteRoutes.delete("/:id", remove);

export default noteRoutes;
