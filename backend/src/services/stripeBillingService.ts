import Stripe from "stripe";

/**
 * Best-effort Stripe subscription cancellation when a user account is deleted.
 * Does not throw — logs and continues RGPD purge if Stripe is unavailable.
 */
export async function cancelStripeSubscriptionsById(uid: string, subscriptionIds: string[]): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || subscriptionIds.length === 0) return;

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia", typescript: true });
  const unique = [...new Set(subscriptionIds.map((s) => s.trim()).filter(Boolean))];

  for (const subId of unique) {
    try {
      await stripe.subscriptions.cancel(subId);
      console.info("[rgpd] Stripe subscription cancelled", JSON.stringify({ uid, subId }));
    } catch (err) {
      console.warn("[rgpd] Stripe subscription cancel failed (non-blocking)", JSON.stringify({
        uid,
        subId,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }
}
