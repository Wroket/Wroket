import { Router } from "express";

import { streamUserSync } from "../controllers/syncEventsController";
import { requireAuth } from "../middlewares/requireAuth";

const syncEventsRoutes = Router();

syncEventsRoutes.use(requireAuth);
syncEventsRoutes.get("/stream", streamUserSync);

export default syncEventsRoutes;
