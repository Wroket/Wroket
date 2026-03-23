import { Router } from "express";

import { getMe, login, logout, register } from "../controllers/authController";
import { requireAuth } from "../middlewares/requireAuth";

const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, getMe);

export default authRoutes;

