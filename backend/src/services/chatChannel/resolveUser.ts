/**
 * Map chat-provider email → Wroket user (shared identity path).
 */

import { findUserByEmail } from "../authService";
import type { ChatIdentityResult } from "./types";

/**
 * Resolve a Wroket user from an email returned by Slack / AAD / Workspace / Discord.
 * Does not fetch the email — callers obtain it from the platform API or link table.
 */
export function resolveUserFromChatEmail(
  email: string | null | undefined,
  opts?: { unknownEmailHint?: string },
): ChatIdentityResult {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return {
      error:
        opts?.unknownEmailHint ??
        "Impossible de lire votre email sur ce canal. Vérifiez la visibilité de l’email ou liez votre compte dans Paramètres → Intégrations.",
    };
  }
  const user = findUserByEmail(normalized);
  if (!user) {
    return {
      error: `Aucun compte Wroket pour ${normalized}. Utilisez le même email que votre compte Wroket, ou liez le compte dans Paramètres.`,
    };
  }
  return { uid: user.uid, email: user.email };
}
