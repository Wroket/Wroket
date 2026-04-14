import { Request, Response } from "express";

import {
  COOKIE_NAME,
  login as loginService,
  loginWithGoogle,
  logout as logoutService,
  register as registerService,
  updateProfile as updateProfileService,
  type NotificationDeliveryMode,
  changePassword as changePasswordService,
  findUserByEmail,
  findUserByUid,
  verifyEmail as verifyEmailService,
  resendVerificationToken,
  requestPasswordReset,
  resetPassword as resetPasswordService,
  AuthUser,
  WorkingHours,
  type LoginSuccess,
  beginTotpSetup as beginTotpSetupService,
  completeTotpSetup as completeTotpSetupService,
  disableTotp as disableTotpService,
  twoFactorDisableRequiresPassword,
  cancelTotpSetup as cancelTotpSetupService,
  verifyTwoFactorLogin as verifyTwoFactorLoginService,
  requestEmail2faEnrollment as requestEmail2faEnrollmentService,
  confirmEmail2faEnrollment as confirmEmail2faEnrollmentService,
  setTotpEmailFallback as setTotpEmailFallbackService,
  requestDisableEmail2faOtp as requestDisableEmail2faOtpService,
  disableEmailOtp2fa as disableEmailOtp2faService,
} from "../services/authService";
import {
  getPendingTwoFactorMethods,
  prepareEmailOtpForPending,
} from "../services/twoFactorService";
import { exportUserData, deleteUserData } from "../services/rgpdService";
import { getActivityLog } from "../services/activityLogService";
import { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail, sendEmailOtpEmail } from "../services/emailService";
import { getGoogleSsoAuthUrl, exchangeGoogleSsoCode } from "../services/googleSsoService";
import { consumeSsoLoginState } from "../utils/oauthState";
import { AppError, ValidationError } from "../utils/errors";
import { flushNow, getStore, scheduleSave } from "../persistence";
import { parseCookies } from "../utils/parseCookies";

const isProd = process.env.NODE_ENV === "production";
const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  (isProd && (process.env.FRONTEND_URL?.startsWith("https://") ?? false));

/**
 * Shared parent domain (e.g. `.wroket.com`) so `auth_token` is sent to both `wroket.com`
 * (Next.js middleware) and `api.wroket.com` (API). Without this, SSO redirect to /dashboard
 * has no cookie on the web host and middleware sends users back to /login.
 */
function cookieParentDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  if (raw) {
    return raw.startsWith(".") ? raw : `.${raw}`;
  }
  const front = process.env.FRONTEND_URL;
  if (!front) return undefined;
  try {
    const { hostname } = new URL(front);
    if (hostname === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return undefined;
    }
    const parts = hostname.split(".");
    if (parts.length < 2) return undefined;
    return `.${parts.slice(-2).join(".")}`;
  } catch {
    return undefined;
  }
}

const COOKIE_DOMAIN = cookieParentDomain();

function baseCookieOpts(): { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; domain?: string } {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

function clearCookieOpts(): { path: string; domain?: string } {
  return { path: "/", ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}) };
}

const MAX_INVITE_LOG = 10_000;

function logInvite(fromEmail: string, fromName: string, toEmail: string): void {
  const store = getStore();
  if (!store.inviteLog) store.inviteLog = [];
  const log = store.inviteLog as unknown[];
  log.push({ fromEmail, fromName, toEmail, sentAt: new Date().toISOString() });
  if (log.length > MAX_INVITE_LOG) {
    store.inviteLog = log.slice(-MAX_INVITE_LOG);
  }
  scheduleSave("inviteLog");
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function register(req: Request, res: Response) {
  const { email, password, timezone } = req.body as { email?: unknown; password?: unknown; timezone?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    throw new ValidationError("Email et mot de passe requis");
  }

  const result = registerService({ email, password, timezone: typeof timezone === "string" ? timezone : undefined });
  await sendVerificationEmail(email, result.verifyToken);
  res.status(201).json({ message: "Compte créé. Vérifiez votre email.", needsVerification: true });
}

export async function verifyEmail(req: Request, res: Response) {
  const token = req.body?.token;
  if (typeof token !== "string") {
    throw new ValidationError("Token requis");
  }

  verifyEmailService(token);
  res.status(200).json({ message: "Email vérifié avec succès" });
}

export async function resendVerification(req: Request, res: Response) {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ValidationError("Email requis");
  }

  const { verifyToken } = resendVerificationToken(email);
  await sendVerificationEmail(email, verifyToken);
  res.status(200).json({ message: "Lien de vérification envoyé" });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ValidationError("Email requis");
  }

  const result = requestPasswordReset(email);
  if (result) {
    await sendPasswordResetEmail(result.email, result.resetToken);
  }

  // Always return 200 to prevent user enumeration
  res.status(200).json({ message: "Si un compte existe, un email de réinitialisation a été envoyé." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token?: unknown; password?: unknown };
  if (typeof token !== "string") {
    throw new ValidationError("Token requis");
  }
  if (typeof password !== "string" || password.length < 8) {
    throw new ValidationError("Mot de passe trop court (min 8 caractères)");
  }

  resetPasswordService(token, password);
  res.status(200).json({ message: "Mot de passe modifié avec succès" });
}

export async function googleSsoUrl(req: Request, res: Response) {
  const loginHint = typeof req.query.login_hint === "string" ? req.query.login_hint : undefined;
  const { url, state } = getGoogleSsoAuthUrl(loginHint);
  res.cookie("oauth_state", state, {
    ...baseCookieOpts(),
    maxAge: 10 * 60 * 1000,
  });
  res.status(200).json({ url });
}

export async function googleSsoCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const code = req.query.code as string | undefined;
  const stateParam = req.query.state as string | undefined;

  const cookies = parseCookies(req.headers.cookie);
  const storedState = cookies.oauth_state;

  res.clearCookie("oauth_state", clearCookieOpts());

  if (!code || !stateParam) {
    res.redirect(`${frontendUrl}/login?error=google_sso_failed`);
    return;
  }

  // Validate signed state first. Do not require oauth_state cookie to match: some browsers
  // or cross-site cookie rules leave it empty/stale while ?state= from Google is still valid.
  if (!consumeSsoLoginState(stateParam)) {
    res.redirect(`${frontendUrl}/login?error=google_sso_failed`);
    return;
  }
  if (storedState && stateParam !== storedState) {
    console.warn("[auth] Google SSO: oauth_state cookie differed from ?state= (ignored after HMAC ok)");
  }

  try {
    const userInfo = await exchangeGoogleSsoCode(code);

    const timezone = cookies.tz || undefined;

    const result = loginWithGoogle({
      email: userInfo.email,
      firstName: userInfo.given_name ?? "",
      lastName: userInfo.family_name ?? "",
      timezone,
    });

    await flushNow();

    if ("requiresTwoFactor" in result && result.requiresTwoFactor) {
      res.redirect(`${frontendUrl}/login?pending2fa=${encodeURIComponent(result.pendingToken)}`);
      return;
    }

    const session = result as LoginSuccess;
    res.cookie(COOKIE_NAME, session.sessionToken, {
      ...baseCookieOpts(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${frontendUrl}/dashboard`);
  } catch (err) {
    console.error("[auth] Google SSO callback error:", err);
    res.redirect(`${frontendUrl}/login?error=google_sso_failed`);
  }
}

export async function login(req: Request, res: Response) {
  const { email, password, timezone } = req.body as { email?: unknown; password?: unknown; timezone?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    throw new ValidationError("Email et mot de passe requis");
  }

  const result = loginService({ email, password, timezone: typeof timezone === "string" ? timezone : undefined });

  await flushNow();

  if ("requiresTwoFactor" in result && result.requiresTwoFactor) {
    res.status(200).json({
      requiresTwoFactor: true,
      pendingToken: result.pendingToken,
      twoFactorMethods: result.twoFactorMethods,
    });
    return;
  }

  const session = result as LoginSuccess;
  res.cookie(COOKIE_NAME, session.sessionToken, {
    ...baseCookieOpts(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: "Login OK" });
}

function localeFromReq(req: Request): "fr" | "en" {
  return req.acceptsLanguages(["fr", "en"]) === "en" ? "en" : "fr";
}

/** Public: which second factors are allowed for this pending login (e.g. after Google redirect). */
export function pendingTwoFactorMeta(req: Request, res: Response) {
  const token = typeof req.query.pendingToken === "string" ? req.query.pendingToken.trim() : "";
  if (!token) {
    res.status(400).json({ message: "Jeton requis" });
    return;
  }
  const methods = getPendingTwoFactorMethods(token);
  if (!methods) {
    res.status(404).json({ message: "Jeton invalide ou expiré" });
    return;
  }
  res.status(200).json({ twoFactorMethods: methods });
}

/** Send a 6-digit login code by email (pending step after password / Google). */
export async function sendEmailOtpForPendingLogin(req: Request, res: Response) {
  const { pendingToken } = req.body as { pendingToken?: unknown };
  if (typeof pendingToken !== "string" || !pendingToken.trim()) {
    throw new ValidationError("Jeton requis");
  }
  const token = pendingToken.trim();
  const { code, uid } = prepareEmailOtpForPending(token);
  const authUser = findUserByUid(uid);
  if (!authUser?.email) {
    throw new AppError(401, "Session 2FA expirée ou invalide. Reconnectez-vous.");
  }
  await sendEmailOtpEmail(authUser.email, code, "login", localeFromReq(req));
  await flushNow();
  res.status(200).json({ message: "Code envoyé" });
}

export async function email2faEnrollmentRequest(req: AuthenticatedRequest, res: Response) {
  await requestEmail2faEnrollmentService(req.user!.uid, localeFromReq(req));
  await flushNow();
  res.status(200).json({ message: "Code envoyé" });
}

export async function email2faEnrollmentConfirm(req: AuthenticatedRequest, res: Response) {
  const { code } = req.body as { code?: unknown };
  if (typeof code !== "string" || !code.trim()) {
    throw new ValidationError("Code requis");
  }
  const user = confirmEmail2faEnrollmentService(req.user!.uid, code.trim());
  await flushNow();
  res.status(200).json(user);
}

export async function putTotpEmailFallback(req: AuthenticatedRequest, res: Response) {
  const { enabled } = req.body as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    throw new ValidationError("enabled requis");
  }
  const user = setTotpEmailFallbackService(req.user!.uid, enabled);
  await flushNow();
  res.status(200).json(user);
}

export async function email2faDisableRequest(req: AuthenticatedRequest, res: Response) {
  await requestDisableEmail2faOtpService(req.user!.uid, localeFromReq(req));
  await flushNow();
  res.status(200).json({ message: "Code envoyé" });
}

export async function email2faDisable(req: AuthenticatedRequest, res: Response) {
  const { password, code } = req.body as { password?: unknown; code?: unknown };
  if (typeof code !== "string" || !code.trim()) {
    throw new ValidationError("Code requis");
  }
  const pwd = typeof password === "string" ? password : undefined;
  disableEmailOtp2faService(req.user!.uid, pwd, code.trim());
  await flushNow();
  res.status(200).json({ message: "OK" });
}

export async function verifyTwoFactor(req: Request, res: Response) {
  const { pendingToken, code } = req.body as { pendingToken?: unknown; code?: unknown };
  if (typeof pendingToken !== "string" || typeof code !== "string") {
    throw new ValidationError("Jeton et code requis");
  }

  const result = verifyTwoFactorLoginService(pendingToken, code);
  await flushNow();

  res.cookie(COOKIE_NAME, result.sessionToken, {
    ...baseCookieOpts(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: "Login OK" });
}

export async function totpSetup(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const out = beginTotpSetupService(uid);
  res.status(200).json(out);
}

export async function totpEnable(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const { code } = req.body as { code?: unknown };
  if (typeof code !== "string" || !code.trim()) {
    throw new ValidationError("Code requis");
  }
  const user = completeTotpSetupService(uid, code.trim());
  res.status(200).json(user);
}

export async function totpDisable(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const { password, code } = req.body as { password?: unknown; code?: unknown };
  if (typeof code !== "string" || !code.trim()) {
    throw new ValidationError("Code requis");
  }
  const pwd = typeof password === "string" ? password : undefined;
  disableTotpService(uid, pwd, code.trim());
  res.status(200).json({ message: "2FA désactivée" });
}

export async function totpCancelSetup(req: AuthenticatedRequest, res: Response) {
  cancelTotpSetupService(req.user!.uid);
  res.status(200).json({ message: "OK" });
}

export async function logout(req: Request, res: Response) {
  logoutService(req.headers.cookie);
  res.clearCookie(COOKIE_NAME, clearCookieOpts());
  res.status(200).json({ message: "Logged out" });
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }
  res.status(200).json({
    uid: user.uid,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    effortMinutes: user.effortMinutes,
    workingHours: user.workingHours,
    skipNonWorkingDays: user.skipNonWorkingDays,
    googleCalendarConnected: user.googleCalendarConnected,
    googleAccounts: user.googleAccounts,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorDisableRequiresPassword: twoFactorDisableRequiresPassword(user.uid),
    emailOtp2faEnabled: user.emailOtp2faEnabled === true,
    totpEmailFallbackEnabled: user.totpEmailFallbackEnabled !== false,
    notificationDeliveryMode: user.notificationDeliveryMode,
    notificationDeliveryWebhookUrl: user.notificationDeliveryWebhookUrl,
  });
}

export async function lookupUser(req: AuthenticatedRequest, res: Response) {
  const email = req.query.email;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ValidationError("Email requis");
  }
  const user = findUserByEmail(email);
  if (!user) {
    res.status(404).json({ message: "Utilisateur introuvable" });
    return;
  }
  res.status(200).json({ uid: user.uid, email: user.email, firstName: user.firstName, lastName: user.lastName });
}

export async function lookupUserByUid(req: AuthenticatedRequest, res: Response) {
  const uid = req.query.uid;
  if (typeof uid !== "string" || uid.length === 0) {
    throw new ValidationError("UID requis");
  }
  const user = findUserByUid(uid);
  if (!user) {
    res.status(404).json({ message: "Utilisateur introuvable" });
    return;
  }
  res.status(200).json({ uid: user.uid, email: user.email, firstName: user.firstName, lastName: user.lastName });
}

export async function shareInvite(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }

  const { email } = req.body as { email?: unknown };
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ValidationError("Email requis");
  }

  const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  await sendInviteEmail(email, fromName);
  logInvite(user.email, fromName, email.trim().toLowerCase());
  res.status(200).json({ message: "Invitation envoyée" });
}

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }

  const { firstName, lastName, effortMinutes, workingHours, skipNonWorkingDays, notificationDeliveryMode, notificationDeliveryWebhookUrl } = req.body as {
    firstName?: unknown; lastName?: unknown; effortMinutes?: unknown; workingHours?: unknown; skipNonWorkingDays?: unknown;
    notificationDeliveryMode?: unknown; notificationDeliveryWebhookUrl?: unknown;
  };
  if (firstName !== undefined && typeof firstName !== "string") {
    throw new ValidationError("Prénom invalide");
  }
  if (lastName !== undefined && typeof lastName !== "string") {
    throw new ValidationError("Nom invalide");
  }

  let validatedEffort: { light: number; medium: number; heavy: number } | undefined;
  if (effortMinutes !== undefined) {
    const em = effortMinutes as Record<string, unknown>;
    if (typeof em !== "object" || em === null) throw new ValidationError("effortMinutes invalide");
    for (const k of ["light", "medium", "heavy"] as const) {
      const v = em[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 480) {
        throw new ValidationError(`effortMinutes.${k} doit être entre 1 et 480`);
      }
    }
    validatedEffort = { light: em.light as number, medium: em.medium as number, heavy: em.heavy as number };
  }

  let validatedWorkingHours: WorkingHours | undefined;
  if (workingHours !== undefined) {
    const wh = workingHours as Record<string, unknown>;
    if (typeof wh !== "object" || wh === null) throw new ValidationError("workingHours invalide");
    if (typeof wh.start !== "string") throw new ValidationError("workingHours.start requis");
    if (typeof wh.end !== "string") throw new ValidationError("workingHours.end requis");
    if (typeof wh.timezone !== "string") throw new ValidationError("workingHours.timezone requis");
    if (!Array.isArray(wh.daysOfWeek)) throw new ValidationError("workingHours.daysOfWeek requis");
    validatedWorkingHours = {
      start: wh.start,
      end: wh.end,
      timezone: wh.timezone,
      daysOfWeek: wh.daysOfWeek as number[],
    };
  }

  let validatedWebhookUrl: string | null | undefined;
  if (notificationDeliveryWebhookUrl !== undefined) {
    if (notificationDeliveryWebhookUrl === null) validatedWebhookUrl = null;
    else if (typeof notificationDeliveryWebhookUrl === "string") validatedWebhookUrl = notificationDeliveryWebhookUrl;
    else throw new ValidationError("notificationDeliveryWebhookUrl invalide");
  }

  const updated = await updateProfileService(user.uid, {
    firstName: firstName as string | undefined,
    lastName: lastName as string | undefined,
    effortMinutes: validatedEffort,
    workingHours: validatedWorkingHours,
    skipNonWorkingDays: skipNonWorkingDays !== undefined ? !!skipNonWorkingDays : undefined,
    notificationDeliveryMode: notificationDeliveryMode !== undefined ? notificationDeliveryMode as NotificationDeliveryMode : undefined,
    notificationDeliveryWebhookUrl: validatedWebhookUrl,
  });
  res.status(200).json(updated);
}

export async function changePassword(req: Request, res: Response) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }
  const { currentPassword, newPassword } = req.body as Record<string, unknown>;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    throw new ValidationError("Mot de passe actuel et nouveau requis");
  }
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.auth_token;
  changePasswordService(user.uid, currentPassword, newPassword, sessionToken);
  res.status(200).json({ message: "Mot de passe modifié" });
}

export async function myExport(req: Request, res: Response) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }
  const data = exportUserData(user.uid, { decryptedTaskContent: true });
  res.status(200).json(data);
}

export async function myDeleteAccount(req: Request, res: Response) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }
  const { confirmation } = req.body as Record<string, unknown>;
  const accepted = ["SUPPRIMER", "DELETE"];
  if (typeof confirmation !== "string" || !accepted.includes(confirmation.toUpperCase())) {
    throw new ValidationError("Type SUPPRIMER or DELETE to confirm");
  }
  await deleteUserData(user.uid);
  res.clearCookie(COOKIE_NAME, clearCookieOpts());
  res.status(200).json({ message: "Compte supprimé" });
}

export async function myActivity(req: Request, res: Response) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }
  const { limit, offset } = req.query as Record<string, string | undefined>;
  const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50;
  const parsedOffset = Math.max(0, offset ? parseInt(offset, 10) || 0 : 0);
  const result = getActivityLog({ userId: user.uid, limit: parsedLimit, offset: parsedOffset });
  res.status(200).json(result);
}
