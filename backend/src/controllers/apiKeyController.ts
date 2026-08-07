import {
  createApiKeyForUser,
  listApiKeysForUser,
  revokeApiKeyForUser,
  type ApiKeyPublic,
  type CreateApiKeyResult,
} from "../services/authService";
import { AuthenticatedRequest } from "./authController";
import { ValidationError } from "../utils/errors";
import type { Response } from "express";

/**
 * GET /auth/api-keys — list keys (no secrets).
 */
export function listApiKeys(req: AuthenticatedRequest, res: Response): void {
  const keys = listApiKeysForUser(req.user!.uid);
  res.status(200).json({ keys });
}

/**
 * POST /auth/api-keys — create key; plaintext returned once.
 */
export function createApiKey(req: AuthenticatedRequest, res: Response): void {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) throw new ValidationError("Nom de clé requis");
  if (name.length > 64) throw new ValidationError("Nom trop long (max 64)");

  let scopes: string[] | undefined;
  if (Array.isArray(req.body?.scopes)) {
    scopes = req.body.scopes.filter((s: unknown) => typeof s === "string");
  }

  const result: CreateApiKeyResult = createApiKeyForUser(req.user!.uid, name, scopes);
  res.status(201).json(result);
}

/**
 * DELETE /auth/api-keys/:id — revoke.
 */
export function revokeApiKey(req: AuthenticatedRequest, res: Response): void {
  const id = String(req.params.id ?? "").trim();
  if (!id) throw new ValidationError("Identifiant de clé requis");
  revokeApiKeyForUser(req.user!.uid, id);
  res.status(204).send();
}

export type { ApiKeyPublic };
