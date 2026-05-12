import { Request, Response } from "express";

import { getStore, scheduleSave } from "../persistence";
import { isSmtpConfiguredForOutbound, sendPricingContactLeadEmails } from "../services/emailService";
import { normalizeEmail } from "../services/authService";
import { AppError, ConflictError, ValidationError } from "../utils/errors";

const MAX_FIRST = 120;
const MAX_LAST = 120;
const MAX_TIER = 200;
const DEDUPE_MS = 7 * 24 * 60 * 60 * 1000;

function trimStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function isValidEmailShape(s: string): boolean {
  if (s.length < 3 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function postPricingContact(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const firstName = trimStr(body.firstName, MAX_FIRST);
  const lastName = trimStr(body.lastName, MAX_LAST);
  const emailRaw = trimStr(body.email, 254);
  const tier = trimStr(body.tier, MAX_TIER);
  const locale = body.locale === "en" ? "en" : "fr";
  const confirmResubmit = body.confirmResubmit === true;

  if (!firstName) throw new ValidationError("Prénom requis");
  if (!lastName) throw new ValidationError("Nom requis");
  if (!emailRaw || !isValidEmailShape(emailRaw)) throw new ValidationError("Email invalide");
  if (!tier) throw new ValidationError("Plan requis");

  if (!isSmtpConfiguredForOutbound()) {
    throw new AppError(
      503,
      "L’envoi par email est temporairement indisponible. Écrivez-nous à team@wroket.com.",
    );
  }

  const emailNorm = normalizeEmail(emailRaw);
  const store = getStore();
  if (!store.pricingContactLeads) {
    store.pricingContactLeads = {};
  }
  const leads = store.pricingContactLeads as Record<string, { lastSubmittedAt: string; lastTier?: string }>;

  const prev = leads[emailNorm];
  const now = Date.now();
  if (prev?.lastSubmittedAt && !confirmResubmit) {
    const prevMs = new Date(prev.lastSubmittedAt).getTime();
    if (Number.isFinite(prevMs) && now - prevMs < DEDUPE_MS) {
      throw new ConflictError(
        "Une demande est déjà en cours pour cette adresse. Confirmez pour envoyer une nouvelle demande.",
        "PRICING_LEAD_PENDING",
      );
    }
  }

  const { teamSent, ackSent } = await sendPricingContactLeadEmails({
    firstName,
    lastName,
    email: emailRaw,
    tier,
    locale,
  });

  if (!teamSent) {
    throw new AppError(502, "Impossible d’envoyer le message. Réessayez plus tard ou contactez team@wroket.com.");
  }

  leads[emailNorm] = { lastSubmittedAt: new Date().toISOString(), lastTier: tier };
  scheduleSave("pricingContactLeads");

  res.status(200).json({ ok: true, ackSent });
}
