/** Commercial paliers — persisted on user as `billingPlan` (see authService). */
export type BillingPlan = "free" | "first" | "small" | "large";

export interface Entitlements {
  /**
   * Pack intégrations : webhooks (Paramètres → Intégrations),
   * livraison externe des notifications (email / Slack / Teams / Google Chat),
   * et calendriers externes (OAuth Google / Outlook, sync, réservation, Meet/Teams).
   * Activé pour Small+ ou via le statut **early bird** (admin uniquement, voir {@link resolveEntitlements}).
   */
  integrations: boolean;
  /** GET /teams/:teamId/reporting — Large+, ou early bird (admin). */
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

/** Matrice paliers uniquement (sans statut early bird). Palier `first` (« 1st in ») = pas d’intégrations ni reporting. */
export function getEntitlements(plan: BillingPlan): Entitlements {
  const integrations = plan === "small" || plan === "large";
  const teamReporting = plan === "large";
  return { integrations, teamReporting };
}

/**
 * Droits effectifs : si `earlyBird` (attribué uniquement par un admin), accès complet intégrations + reporting ;
 * sinon uniquement {@link getEntitlements}(plan).
 */
export function resolveEntitlements(plan: BillingPlan, earlyBird: boolean): Entitlements {
  if (earlyBird) {
    return { integrations: true, teamReporting: true };
  }
  return getEntitlements(plan);
}
