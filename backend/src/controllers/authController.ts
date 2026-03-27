import { Request, Response } from "express";

import {
  COOKIE_NAME,
  login as loginService,
  logout as logoutService,
  register as registerService,
  updateProfile as updateProfileService,
  findUserByEmail,
  findUserByUid,
  AuthUser
} from "../services/authService";

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export async function register(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ message: "Email et mot de passe requis" });
      return;
    }

    registerService({ email, password });
    res.status(201).json({ message: "Compte créé" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message === "Compte déjà existant" ? 409 : 400;
    console.warn("[auth.register] %s", message);
    res.status(status).json({ message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ message: "Email et mot de passe requis" });
      return;
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.warn("[auth.login] %s", message);
    res.status(401).json({ message });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    logoutService(req.headers.cookie);
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    console.error("[auth.logout] error", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }
  res.status(200).json({ uid: user.uid, email: user.email, firstName: user.firstName, lastName: user.lastName });
}

export async function lookupUser(req: AuthenticatedRequest, res: Response) {
  const email = req.query.email;
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ message: "Email requis" });
    return;
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
    res.status(400).json({ message: "UID requis" });
    return;
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

  try {
    const { firstName, lastName } = req.body as { firstName?: unknown; lastName?: unknown };
    if (firstName !== undefined && typeof firstName !== "string") {
      res.status(400).json({ message: "Prénom invalide" });
      return;
    }
    if (lastName !== undefined && typeof lastName !== "string") {
      res.status(400).json({ message: "Nom invalide" });
      return;
    }

    const updated = updateProfileService(user.uid, {
      firstName: firstName as string | undefined,
      lastName: lastName as string | undefined,
    });
    res.status(200).json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    res.status(400).json({ message });
  }
}

