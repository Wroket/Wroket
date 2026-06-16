import { Router } from "express";
import rateLimit from "express-rate-limit";

import { enrollEarlyBird } from "../controllers/earlyBirdController";
import { requireAuth } from "../middlewares/requireAuth";

const earlyBirdLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de demandes, réessayez dans quelques minutes." },
});

const earlyBirdRoutes = Router();

earlyBirdRoutes.post("/enroll", earlyBirdLimiter, requireAuth, enrollEarlyBird);

export default earlyBirdRoutes;
