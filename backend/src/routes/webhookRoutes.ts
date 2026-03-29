import { Router } from "express";

import {
  getWebhooks,
  postUpsertWebhook,
  postDeleteWebhook,
  postTestWebhook,
} from "../controllers/webhookController";
import { requireAuth } from "../middlewares/requireAuth";

const webhookRoutes = Router();

webhookRoutes.use(requireAuth);

webhookRoutes.get("/", getWebhooks);
webhookRoutes.post("/", postUpsertWebhook);
webhookRoutes.delete("/:id", postDeleteWebhook);
webhookRoutes.post("/test", postTestWebhook);

export default webhookRoutes;
