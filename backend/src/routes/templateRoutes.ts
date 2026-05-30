import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";
import { list, create, update, remove } from "../controllers/templateController";

const templateRoutes = Router();

templateRoutes.use(requireAuth);
templateRoutes.use(noStoreCache);

templateRoutes.get("/", list);
templateRoutes.post("/", create);
templateRoutes.put("/:id", update);
templateRoutes.delete("/:id", remove);

export default templateRoutes;
