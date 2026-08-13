import { Router } from "express";

import { list, count, read, readAll, dismiss } from "../controllers/notificationController";
import { requireAuth } from "../middlewares/requireAuth";

const notificationRoutes = Router();

notificationRoutes.get("/", requireAuth, list);
notificationRoutes.get("/count", requireAuth, count);
notificationRoutes.put("/read-all", requireAuth, readAll);
notificationRoutes.put("/:id/read", requireAuth, read);
notificationRoutes.delete("/:id", requireAuth, dismiss);

export default notificationRoutes;
