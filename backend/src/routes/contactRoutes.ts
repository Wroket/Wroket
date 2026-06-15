import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";
import { list, suggest, getOne, create, update, remove, listArchived, restoreArchived, purgeArchived } from "../controllers/contactController";

const contactRoutes = Router();

contactRoutes.use(requireAuth);
contactRoutes.use(noStoreCache);

contactRoutes.get("/suggest", suggest);
contactRoutes.get("/archived", listArchived);
contactRoutes.post("/archived/:id/restore", restoreArchived);
contactRoutes.delete("/archived/:id", purgeArchived);
contactRoutes.get("/", list);
contactRoutes.get("/:id", getOne);
contactRoutes.post("/", create);
contactRoutes.patch("/:id", update);
contactRoutes.delete("/:id", remove);

export default contactRoutes;
