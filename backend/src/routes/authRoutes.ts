import { Router } from "express";
import rateLimit from "express-rate-limit";

import { getMe, login, logout, register, updateProfile } from "../controllers/authController";
import { requireAuth } from "../middlewares/requireAuth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives, réessayez dans 15 minutes" },
});

const authRoutes = Router();

authRoutes.post("/register", authLimiter, register);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, getMe);
authRoutes.put("/me", requireAuth, updateProfile);

export default authRoutes;

