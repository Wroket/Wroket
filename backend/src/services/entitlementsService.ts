/** Commercial paliers — persisted on user as `billingPlan` (see authService). */
export type BillingPlan = "free" | "first" | "small" | "large";

export interface Entitlements {
  /**
   * Pack intégrations (palier Small+) : webhooks (Paramètres → Intégrations),
   * livraison externe des notifications (email / Slack / Teams / Google Chat),
   * et calendriers externes (OAuth Google / Outlook, sync, réservation, Meet/Teams).
   */
  integrations: boolean;
  /** GET /teams/:teamId/reporting */
  teamReporting: boolean;
}

const DEFAULT_PLAN_FOR_LEGACY_USER: BillingPlan = "first";

export function normalizeBillingPlan(raw: unknown): BillingPlan | null {
  if (raw === "free" || raw === "first" || raw === "small" || raw === "large") return raw;
  return null;
}

/**
 * Pure mapping used by API + notifications. Legacy accounts without `billingPlan` are treated as {@link DEFAULT_PLAN_FOR_LEGACY_USER}.
 */
export function resolveBillingPlan(stored: unknown): BillingPlan {
  return normalizeBillingPlan(stored) ?? DEFAULT_PLAN_FOR_LEGACY_USER;
}

export function getEntitlements(plan: BillingPlan): Entitlements {
  const integrations = plan === "small" || plan === "large";
  const teamReporting = plan === "large";
  return { integrations, teamReporting };
}
