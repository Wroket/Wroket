import { Router } from "express";

import { getPublicSharedProject, publicShareLimiter } from "../controllers/projectShareController";
import {
  getPublicSharedTask,
  publicTaskShareLimiter,
} from "../controllers/taskShareController";
import {
  getPublicPortalHub,
  getPublicPortalProject,
  publicPortalLimiter,
} from "../controllers/clientPortalController";

const router = Router();

router.get("/project/:token", publicShareLimiter, getPublicSharedProject);
router.get("/task/:token", publicTaskShareLimiter, getPublicSharedTask);
router.get("/portal/:token", publicPortalLimiter, getPublicPortalHub);
router.get("/portal/:token/project/:projectToken", publicPortalLimiter, getPublicPortalProject);

export default router;
