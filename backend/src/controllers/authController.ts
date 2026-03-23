import { Request, Response } from "express";

import {
  COOKIE_NAME,
  login as loginService,
  logout as logoutService,
  register as registerService,
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
      path: "/"
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
  res.status(200).json({ uid: user.uid, email: user.email });
}

