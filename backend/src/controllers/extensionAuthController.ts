import { Response, NextFunction } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  createExtensionAuthCode,
  exchangeExtensionAuthCode,
  isAllowedExtensionRedirectUri,
} from "../services/extensionAuthService";
import {
  listExtensionKeysForUser,
  revokeApiKeyForUser,
} from "../services/authService";
import { ValidationError } from "../utils/errors";

/**
 * POST /auth/extension/authorize — session cookie required.
 * Body: { codeChallenge, redirectUri, browserName? }
 */
export function extensionAuthorize(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ message: "Non authentifié" });
      return;
    }
    const body = req.body as {
      codeChallenge?: string;
      redirectUri?: string;
      browserName?: string;
    };
    if (!body.codeChallenge || !body.redirectUri) {
      throw new ValidationError("codeChallenge et redirectUri requis");
    }
    const code = createExtensionAuthCode({
      uid,
      codeChallenge: body.codeChallenge,
      redirectUri: body.redirectUri,
      browserName: body.browserName,
    });
    res.json({
      code,
      redirectUri: body.redirectUri,
      expiresIn: 60,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/extension/token — public (Bearer not required).
 * Body: { code, codeVerifier, redirectUri }
 */
export function extensionToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const body = req.body as {
      code?: string;
      codeVerifier?: string;
      redirectUri?: string;
    };
    if (!body.code || !body.codeVerifier || !body.redirectUri) {
      throw new ValidationError("code, codeVerifier et redirectUri requis");
    }
    if (!isAllowedExtensionRedirectUri(body.redirectUri)) {
      throw new ValidationError("redirect_uri non autorisé", "INVALID_REDIRECT_URI");
    }
    const result = exchangeExtensionAuthCode({
      code: body.code,
      codeVerifier: body.codeVerifier,
      redirectUri: body.redirectUri,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /auth/extension/browsers — list connected extension keys. */
export function listExtensionBrowsers(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ message: "Non authentifié" });
      return;
    }
    res.json({ browsers: listExtensionKeysForUser(uid) });
  } catch (err) {
    next(err);
  }
}

/** DELETE /auth/extension/browsers/:id */
export function revokeExtensionBrowser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ message: "Non authentifié" });
      return;
    }
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
    if (!id) throw new ValidationError("id requis");
    revokeApiKeyForUser(uid, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
