import { describe, expect, it } from "vitest";

import { resolveApiError, formatUserFacingError, ApiClientError } from "./apiErrors";

describe("resolveApiError", () => {
  it("maps calendar integration plan code", () => {
    const msg = resolveApiError(
      { code: "CALENDAR_INTEGRATIONS_PLAN_REQUIRED", message: "raw" },
      "errors.fallback.generic",
      "fr",
    );
    expect(msg).toContain("Small teams");
  });

  it("maps legacy EMAIL_NOT_VERIFIED token", () => {
    const msg = resolveApiError({ message: "EMAIL_NOT_VERIFIED" }, "errors.fallback.generic", "en");
    expect(msg.toLowerCase()).toContain("email");
  });

  it("falls back to server message when no code mapping", () => {
    const msg = resolveApiError({ message: "Erreur métier explicite" }, "errors.fallback.generic", "fr");
    expect(msg).toBe("Erreur métier explicite");
  });

  it("uses fallback key when body empty", () => {
    const msg = resolveApiError(null, "errors.fallback.generic", "fr");
    expect(msg).toContain("erreur");
  });

  it("maps AUTH_INVALID_CREDENTIALS code", () => {
    const msg = resolveApiError(
      { code: "AUTH_INVALID_CREDENTIALS", message: "Identifiants invalides" },
      "errors.fallback.generic",
      "fr",
    );
    expect(msg.toLowerCase()).toMatch(/identifiant|email|mot de passe/);
  });

  it("maps IMPORT_CSV_INVALID code", () => {
    const msg = resolveApiError(
      { code: "IMPORT_CSV_INVALID", message: "Fichier requis" },
      "errors.fallback.generic",
      "en",
    );
    expect(msg.toLowerCase()).toMatch(/csv|import|file|invalid/);
  });

  it("maps MEET_INVALID_INVITEE_EMAIL code", () => {
    const msg = resolveApiError(
      { code: "MEET_INVALID_INVITEE_EMAIL", message: "raw" },
      "errors.fallback.generic",
      "fr",
    );
    expect(msg.toLowerCase()).toMatch(/email|invit/);
  });
});

describe("formatUserFacingError", () => {
  it("returns ApiClientError message", () => {
    const err = new ApiClientError("Message utilisateur", 403, "FORBIDDEN");
    expect(formatUserFacingError(err, "errors.fallback.generic", "fr")).toBe("Message utilisateur");
  });
});
