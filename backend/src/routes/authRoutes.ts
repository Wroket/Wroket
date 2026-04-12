import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  getMe,
  login,
  logout,
  register,
  updateProfile,
  changePassword,
  myExport,
  myDeleteAccount,
  myActivity,
  lookupUser,
  lookupUserByUid,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleSsoUrl,
  googleSsoCallback,
  shareInvite,
  verifyTwoFactor,
  totpSetup,
  totpEnable,
  totpDisable,
  totpCancelSetup,
  pendingTwoFactorMeta,
  sendEmailOtpForPendingLogin,
  email2faEnrollmentRequest,
  email2faEnrollmentConfirm,
  putTotpEmailFallback,
  email2faDisableRequest,
  email2faDisable,
} from "../controllers/authController";
import { globalSearch } from "../controllers/searchController";
import { requireAuth } from "../middlewares/requireAuth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives, réessayez dans 15 minutes" },
});

/** Separate bucket from login/register so enabling 2FA is not blocked after a few auth attempts */
const twoFaManageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes 2FA, réessayez dans 15 minutes" },
});

const lookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de recherches, réessayez dans une minute" },
});

/** Brute-force protection on TOTP verification (unauthenticated step) */
const twoFaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives 2FA, réessayez dans 15 minutes" },
});

const authRoutes = Router();

authRoutes.post("/register", authLimiter, register);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/2fa/verify", twoFaVerifyLimiter, verifyTwoFactor);
authRoutes.get("/2fa/pending-meta", lookupLimiter, pendingTwoFactorMeta);
authRoutes.post("/2fa/send-email", twoFaVerifyLimiter, sendEmailOtpForPendingLogin);
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
authRoutes.get("/google/url", authLimiter, googleSsoUrl);
authRoutes.get("/google/callback", authLimiter, googleSsoCallback);
authRoutes.post("/share-invite", requireAuth, authLimiter, shareInvite);
authRoutes.get("/me", requireAuth, getMe);
authRoutes.post("/2fa/setup", requireAuth, twoFaManageLimiter, totpSetup);
authRoutes.post("/2fa/enable", requireAuth, twoFaManageLimiter, totpEnable);
authRoutes.post("/2fa/disable", requireAuth, twoFaManageLimiter, totpDisable);
authRoutes.post("/2fa/cancel-setup", requireAuth, twoFaManageLimiter, totpCancelSetup);
authRoutes.post("/2fa/email/request-enrollment", requireAuth, twoFaManageLimiter, email2faEnrollmentRequest);
authRoutes.post("/2fa/email/confirm-enrollment", requireAuth, twoFaManageLimiter, email2faEnrollmentConfirm);
authRoutes.put("/2fa/email/totp-fallback", requireAuth, twoFaManageLimiter, putTotpEmailFallback);
authRoutes.post("/2fa/email/disable-request", requireAuth, twoFaManageLimiter, email2faDisableRequest);
authRoutes.post("/2fa/email/disable", requireAuth, twoFaManageLimiter, email2faDisable);
authRoutes.put("/me", requireAuth, updateProfile);
authRoutes.put("/password", requireAuth, authLimiter, changePassword);
authRoutes.get("/my-export", requireAuth, authLimiter, myExport);
authRoutes.post("/my-delete", requireAuth, authLimiter, myDeleteAccount);
authRoutes.get("/my-activity", requireAuth, myActivity);
authRoutes.get("/search", requireAuth, lookupLimiter, globalSearch);
authRoutes.get("/lookup", requireAuth, lookupLimiter, lookupUser);
authRoutes.get("/lookup-uid", requireAuth, lookupLimiter, lookupUserByUid);

export default authRoutes;
