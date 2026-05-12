import { Router } from "express";
import rateLimit from "express-rate-limit";

import { postPricingContact } from "../controllers/marketingController";

const marketingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de demandes, réessayez dans quelques minutes." },
});

const marketingRoutes = Router();

marketingRoutes.post("/pricing-contact", marketingLimiter, postPricingContact);

export default marketingRoutes;
