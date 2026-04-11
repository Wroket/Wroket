import { Request, Response } from "express";

import {
  COOKIE_NAME,
  login as loginService,
  loginWithGoogle,
  logout as logoutService,
  register as registerService,
  updateProfile as updateProfileService,
  changePassword as changePasswordService,
  findUserByEmail,
  findUserByUid,
  verifyEmail as verifyEmailService,
  resendVerificationToken,
  requestPasswordReset,
  resetPassword as resetPasswordService,
  AuthUser,
  WorkingHours,
} from "../services/authService";
import { exportUserData, deleteUserData } from "../services/rgpdService";
import { getActivityLog } from "../services/activityLogService";
import { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail } from "../services/emailService";
import { getGoogleSsoAuthUrl, exchangeGoogleSsoCode } from "../services/googleSsoService";
import { consumeSsoLoginState } from "../utils/oauthState";
import { ValidationError } from "../utils/errors";
import { getStore, scheduleSave } from "../persistence";
import { parseCookies } from "../utils/parseCookies";

const isProd = process.env.NODE_ENV === "production";
const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  (isProd && (process.env.FRONTEND_URL?.startsWith("https://") ?? false));

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
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
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

  res.clearCookie("oauth_state", { path: "/" });

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

    res.cookie(COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      path: "/",
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

  res.cookie(COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: "Login OK" });
}

export async function logout(req: Request, res: Response) {
  logoutService(req.headers.cookie);
  res.clearCookie(COOKIE_NAME, { path: "/" });
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
    googleCalendarConnected: user.googleCalendarConnected,
    googleAccounts: user.googleAccounts,
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

  const { firstName, lastName, effortMinutes, workingHours, skipNonWorkingDays } = req.body as {
    firstName?: unknown; lastName?: unknown; effortMinutes?: unknown; workingHours?: unknown; skipNonWorkingDays?: unknown;
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

  const updated = updateProfileService(user.uid, {
    firstName: firstName as string | undefined,
    lastName: lastName as string | undefined,
    effortMinutes: validatedEffort,
    workingHours: validatedWorkingHours,
    skipNonWorkingDays: skipNonWorkingDays !== undefined ? !!skipNonWorkingDays : undefined,
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
  res.clearCookie(COOKIE_NAME, { path: "/" });
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
