import { Router } from "express";

import { list, count, read, readAll } from "../controllers/notificationController";
import { requireAuth } from "../middlewares/requireAuth";

const notificationRoutes = Router();

notificationRoutes.get("/", requireAuth, list);
notificationRoutes.get("/count", requireAuth, count);
notificationRoutes.put("/:id/read", requireAuth, read);
notificationRoutes.put("/read-all", requireAuth, readAll);

export default notificationRoutes;
