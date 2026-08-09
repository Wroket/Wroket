import { Router } from "express";

import {
  createAutomationHandler,
  deleteAutomationHandler,
  listAutomations,
  updateAutomationHandler,
} from "../controllers/automationController";
import { requireAuth } from "../middlewares/requireAuth";
import { noStoreCache } from "../middlewares/noStoreCache";

const router = Router();
router.use(requireAuth);
router.use(noStoreCache);

router.get("/", listAutomations);
router.post("/", createAutomationHandler);
router.patch("/:id", updateAutomationHandler);
router.delete("/:id", deleteAutomationHandler);

export default router;
