import { Request, Response } from "express";

import {
  COOKIE_NAME,
  login as loginService,
  logout as logoutService,
  register as registerService,
  updateProfile as updateProfileService,
  findUserByEmail,
  findUserByUid,
  AuthUser,
  WorkingHours,
} from "../services/authService";
import { ValidationError } from "../utils/errors";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function register(req: Request, res: Response) {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    throw new ValidationError("Email et mot de passe requis");
  }

  registerService({ email, password });
  res.status(201).json({ message: "Compte créé" });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    throw new ValidationError("Email et mot de passe requis");
  }

  const result = loginService({ email, password });

  const cookieSecure = process.env.COOKIE_SECURE === "true";
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
  res.status(200).json({ uid: user.uid, email: user.email, firstName: user.firstName, lastName: user.lastName, effortMinutes: user.effortMinutes, workingHours: user.workingHours, googleCalendarConnected: user.googleCalendarConnected });
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

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }

  const { firstName, lastName, effortMinutes, workingHours } = req.body as {
    firstName?: unknown; lastName?: unknown; effortMinutes?: unknown; workingHours?: unknown;
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
  });
  res.status(200).json(updated);
}
