import Stripe from "stripe";

/**
 * Same rules as user-facing billing portal: only allow return URLs under FRONTEND_URL.
 */
export function safeBillingPortalReturnUrl(body: unknown): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const fallback = `${base}/settings?tab=subscription`;
  if (typeof body !== "object" || body === null) return fallback;
  const raw = (body as Record<string, unknown>).returnUrl;
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith(`${base}/`) && trimmed !== base) return fallback;
  return trimmed;
}

export async function createBillingPortalSessionUrl(
  customerId: string,
  returnUrlBody: unknown,
): Promise<{ url: string } | { error: string; status: number; detail?: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return { error: "Stripe n'est pas configuré (STRIPE_SECRET_KEY).", status: 503 };
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia", typescript: true });
  const returnUrl = safeBillingPortalReturnUrl(returnUrlBody);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    if (!session.url) {
      return { error: "Stripe n'a pas renvoyé d'URL de portail.", status: 502 };
    }
    return { url: session.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe] billing portal session error:", err);
    return {
      error:
        "Impossible d'ouvrir le portail de facturation Stripe. Vérifiez que le Customer Portal est activé dans le dashboard Stripe.",
      status: 502,
      detail: process.env.NODE_ENV === "development" ? msg : undefined,
    };
  }
}
