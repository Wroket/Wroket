import type { BillingPlan } from "@/lib/api/core";
import type { TranslationKey } from "@/lib/i18n";

/** Product/marketing name shown to users (roadmap: Free / Pro / Team). */
export function billingPlanMarketingKey(plan: BillingPlan | undefined): TranslationKey {
  if (plan === "free") return "settings.plan.free.marketing";
  if (plan === "first") return "settings.plan.first.marketing";
  if (plan === "small") return "settings.plan.small.marketing";
  if (plan === "large") return "settings.plan.large.marketing";
  return "settings.planUnknown";
}

/** Technical identifier in API / Stripe (`billingPlan`). */
export function billingPlanCodeKey(plan: BillingPlan | undefined): TranslationKey {
  if (plan === "free") return "settings.plan.free.code";
  if (plan === "first") return "settings.plan.first.code";
  if (plan === "small") return "settings.plan.small.code";
  if (plan === "large") return "settings.plan.large.code";
  return "settings.planUnknown.code";
}

export function subscriptionPlanTKey(plan: BillingPlan | undefined): TranslationKey {
  return billingPlanMarketingKey(plan);
}

export function subscriptionPlanTaglineTKey(plan: BillingPlan | undefined): TranslationKey {
  if (plan === "free") return "settings.plan.free.tagline";
  if (plan === "first") return "settings.plan.first.tagline";
  if (plan === "small") return "settings.plan.small.tagline";
  if (plan === "large") return "settings.plan.large.tagline";
  return "settings.planUnknown.tagline";
}
