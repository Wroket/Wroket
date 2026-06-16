import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { enrollEarlyBirdForUid } from "../services/authService";
import { isSmtpConfiguredForOutbound, sendEarlyBirdEnrollEmails } from "../services/emailService";
import { AppError } from "../utils/errors";

export async function enrollEarlyBird(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: "Non authentifié" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const locale = body.locale === "en" ? "en" : "fr";

  if (user.earlyBird) {
    res.status(200).json({
      ok: true,
      earlyBird: true,
      alreadyEnrolled: true,
      ackSent: false,
    });
    return;
  }

  if (!isSmtpConfiguredForOutbound()) {
    throw new AppError(
      503,
      "L'envoi par email est temporairement indisponible. Écrivez-nous à team@wroket.com.",
    );
  }

  const { alreadyEnrolled } = enrollEarlyBirdForUid(user.uid);
  if (alreadyEnrolled) {
    res.status(200).json({
      ok: true,
      earlyBird: true,
      alreadyEnrolled: true,
      ackSent: false,
    });
    return;
  }

  const { teamSent, ackSent } = await sendEarlyBirdEnrollEmails({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    uid: user.uid,
    locale,
  });

  if (!teamSent) {
    throw new AppError(
      502,
      "Votre statut Early Bird est actif, mais la notification n'a pas pu être envoyée. Contactez team@wroket.com si besoin.",
    );
  }

  res.status(200).json({
    ok: true,
    earlyBird: true,
    alreadyEnrolled: false,
    ackSent,
  });
}
