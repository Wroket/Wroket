import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";

import { requireApiKey, type ApiKeyAuthenticatedRequest } from "../middlewares/requireApiKey";
import { requireProductAccess } from "../middlewares/requireProductAccess";
import { extBootstrap, extCapture } from "../controllers/extCaptureController";

const extLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes extension", code: "RATE_LIMIT" },
});

const router = Router();

router.use(requireApiKey);
router.use(requireProductAccess);
router.use(extLimiter);

router.get("/bootstrap", (req: Request, res: Response, next: NextFunction) => {
  void extBootstrap(req as ApiKeyAuthenticatedRequest, res, next);
});

router.post("/capture", (req: Request, res: Response, next: NextFunction) => {
  void extCapture(req as ApiKeyAuthenticatedRequest, res, next);
});

export default router;
