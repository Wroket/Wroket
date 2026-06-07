import { Router } from "express";

import { getVapidKey, subscribe, unsubscribe } from "../controllers/pushController";
import { requireAuth } from "../middlewares/requireAuth";

const pushRoutes = Router();

// Public key is not secret — allow health checks without session (curl, uptime).
pushRoutes.get("/vapid-public-key", getVapidKey);

pushRoutes.use(requireAuth);
pushRoutes.post("/subscribe", subscribe);
pushRoutes.delete("/subscribe", unsubscribe);

export default pushRoutes;
