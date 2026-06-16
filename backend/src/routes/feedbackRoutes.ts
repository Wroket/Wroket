import { Router } from "express";
import rateLimit from "express-rate-limit";

import { postFeedback } from "../controllers/feedbackController";
import { requireAuth } from "../middlewares/requireAuth";

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de demandes, réessayez dans quelques minutes." },
});

const feedbackRoutes = Router();

feedbackRoutes.post("/", feedbackLimiter, requireAuth, postFeedback);

export default feedbackRoutes;
