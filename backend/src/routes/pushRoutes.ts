import { Router } from "express";

import { getVapidKey, subscribe, unsubscribe } from "../controllers/pushController";
import { requireAuth } from "../middlewares/requireAuth";

const pushRoutes = Router();

pushRoutes.use(requireAuth);

pushRoutes.get("/vapid-public-key", getVapidKey);
pushRoutes.post("/subscribe", subscribe);
pushRoutes.delete("/subscribe", unsubscribe);

export default pushRoutes;
