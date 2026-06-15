import { Router } from "express";

import { getPublicSharedProject, publicShareLimiter } from "../controllers/projectShareController";

const router = Router();

router.get("/project/:token", publicShareLimiter, getPublicSharedProject);

export default router;
