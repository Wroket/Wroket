import { Router } from "express";

import { requireAuth } from "../middlewares/requireAuth";
import { requireProductAccess } from "../middlewares/requireProductAccess";
import {
  createPortalHandler,
  listMyPortals,
  revokePortalHandler,
  updatePortalHandler,
} from "../controllers/clientPortalController";

const router = Router();

router.get("/", requireAuth, requireProductAccess, listMyPortals);
router.post("/", requireAuth, requireProductAccess, createPortalHandler);
router.patch("/:id", requireAuth, requireProductAccess, updatePortalHandler);
router.delete("/:id", requireAuth, requireProductAccess, revokePortalHandler);

export default router;
