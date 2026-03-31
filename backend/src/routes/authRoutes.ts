import { Router } from "express";
import rateLimit from "express-rate-limit";

import { getMe, login, logout, register, updateProfile, lookupUser, lookupUserByUid, verifyEmail, resendVerification, forgotPassword, resetPassword, googleSsoUrl, googleSsoCallback, shareInvite } from "../controllers/authController";
import { requireAuth } from "../middlewares/requireAuth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives, réessayez dans 15 minutes" },
});

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de recherches, réessayez dans une minute" },
});

const authRoutes = Router();

authRoutes.post("/register", authLimiter, register);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/logout", logout);

// FIX: Changed from GET to POST.
// GET /verify-email?token=... is a state-mutating endpoint (it marks the
// user as verified and deletes the token). GET requests with SameSite=Lax
// cookies are sent on top-level navigations, making this endpoint
// vulnerable to CSRF: an attacker who knows a verification token can
// embed <img src="https://api.wroket.com/auth/verify-email?token=...">
// and the browser will send the request with cookies attached.
//
// IMPORTANT: This is a breaking change — the frontend verify-email page
// must be updated to POST the token instead of navigating to the GET URL.
// See improvements/frontend/src/lib/api.ts for the corresponding change.
authRoutes.post("/verify-email", authLimiter, verifyEmail);

authRoutes.post("/resend-verification", authLimiter, resendVerification);
authRoutes.post("/forgot-password", authLimiter, forgotPassword);
authRoutes.post("/reset-password", authLimiter, resetPassword);
authRoutes.get("/google/url", googleSsoUrl);
authRoutes.get("/google/callback", googleSsoCallback);
authRoutes.post("/share-invite", requireAuth, authLimiter, shareInvite);
authRoutes.get("/me", requireAuth, getMe);
authRoutes.put("/me", requireAuth, updateProfile);
authRoutes.get("/lookup", requireAuth, lookupLimiter, lookupUser);
authRoutes.get("/lookup-uid", requireAuth, lookupLimiter, lookupUserByUid);

export default authRoutes;
