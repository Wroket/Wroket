import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { isSmtpConfiguredForOutbound, sendAppFeedbackEmails } from "../services/emailService";
import { AppError, ValidationError } from "../utils/errors";

const MAX_MESSAGE = 500;

function trimMessage(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, MAX_MESSAGE);
}

export async function postFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const message = trimMessage(body.message);
  const locale = body.locale === "en" ? "en" : "fr";

  if (!message) throw new ValidationError("Message requis");
  if (message.length > MAX_MESSAGE) throw new ValidationError("Message trop long (500 caractères max)");

  if (!isSmtpConfiguredForOutbound()) {
    throw new AppError(
      503,
      "L'envoi par email est temporairement indisponible. Écrivez-nous à team@wroket.com.",
    );
  }

  const { teamSent, ackSent } = await sendAppFeedbackEmails({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    message,
    locale,
  });

  if (!teamSent) {
    throw new AppError(502, "Impossible d'envoyer le message. Réessayez plus tard ou contactez team@wroket.com.");
  }

  res.status(200).json({ ok: true, ackSent });
}
