import type { Request, Response } from "express";
import Stripe from "stripe";

import type { AuthenticatedRequest } from "./authController";
import {
  getStripeCustomerIdForUid,
  patchStripeBillingForUid,
  setBillingPlanForUid,
} from "../services/authService";
import { normalizeBillingPlan } from "../services/entitlementsService";
import { createBillingPortalSessionUrl } from "../services/stripePortalSessionService";

function applyPlanFromStripeMetadata(uid: string | undefined, planRaw: string | undefined): void {
  if (!uid) return;
  const plan = normalizeBillingPlan(planRaw);
  if (!plan) return;
  setBillingPlanForUid(uid, plan);
}

function stripeCustomerIdFromSession(session: Stripe.Checkout.Session): string | undefined {
  const c = session.customer;
  if (typeof c === "string" && c.trim()) return c.trim();
  if (c && typeof c === "object" && "id" in c && typeof (c as Stripe.Customer).id === "string") {
    return (c as Stripe.Customer).id.trim();
  }
  return undefined;
}

function stripeSubscriptionIdFromSession(session: Stripe.Checkout.Session): string | undefined {
  const s = session.subscription;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (s && typeof s === "object" && "id" in s && typeof (s as Stripe.Subscription).id === "string") {
    return (s as Stripe.Subscription).id.trim();
  }
  return undefined;
}

function subscriptionPeriodEndIso(sub: Stripe.Subscription): string | null {
  const ts = sub.current_period_end;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function syncSubscriptionFields(uid: string, sub: Stripe.Subscription): void {
  patchStripeBillingForUid(uid, {
    stripeSubscriptionId: sub.id,
    stripeSubscriptionStatus: sub.status,
    billingCurrentPeriodEnd: subscriptionPeriodEndIso(sub),
  });
}

/**
 * Stripe → `billingPlan` + optional Customer / Subscription fields on the Wroket user.
 *
 * Configure Checkout with `client_reference_id` = user uid (or `metadata.uid`),
 * `metadata.billing_plan` ∈ { free, first, small, large }, and the same `metadata.uid`
 * on the **Subscription** object so `customer.subscription.*` events can resolve the user.
 *
 * Enable the **Stripe Customer Portal** in the Dashboard for `POST /billing/create-portal-session`.
 */
export async function postStripeWebhook(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!webhookSecret || !secretKey) {
    res.status(503).json({
      message: "Stripe billing is not configured (set STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY).",
    });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ message: "Missing Stripe-Signature header" });
    return;
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia", typescript: true });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, webhookSecret);
  } catch (err) {
    console.warn("[stripe] webhook signature verification failed:", err);
    res.status(400).json({ message: "Invalid Stripe signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid =
          (typeof session.client_reference_id === "string" && session.client_reference_id) ||
          (typeof session.metadata?.uid === "string" && session.metadata.uid) ||
          undefined;
        const plan = session.metadata?.billing_plan;
        applyPlanFromStripeMetadata(uid, typeof plan === "string" ? plan : undefined);

        const customerId = stripeCustomerIdFromSession(session);
        if (uid && customerId) {
          patchStripeBillingForUid(uid, { stripeCustomerId: customerId });
        }

        const subId = stripeSubscriptionIdFromSession(session);
        if (uid && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          syncSubscriptionFields(uid, sub);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = typeof sub.metadata?.uid === "string" ? sub.metadata.uid : undefined;
        const active = sub.status === "active" || sub.status === "trialing";
        if (uid) {
          syncSubscriptionFields(uid, sub);
        }
        if (!active) {
          if (uid) setBillingPlanForUid(uid, "first");
          break;
        }
        const plan = sub.metadata?.billing_plan;
        applyPlanFromStripeMetadata(uid, typeof plan === "string" ? plan : undefined);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = typeof sub.metadata?.uid === "string" ? sub.metadata.uid : undefined;
        if (uid) {
          patchStripeBillingForUid(uid, {
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: null,
            billingCurrentPeriodEnd: null,
          });
          setBillingPlanForUid(uid, "first");
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe] webhook handler error:", err);
    res.status(500).json({ message: "Stripe webhook processing failed" });
    return;
  }

  res.status(200).json({ received: true });
}

export async function postCreateBillingPortalSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const uid = req.user!.uid;
  const customerId = getStripeCustomerIdForUid(uid);
  if (!customerId) {
    res.status(404).json({
      message: "Aucun client Stripe lié à ce compte. Finalisez un abonnement via Checkout d'abord.",
    });
    return;
  }

  const result = await createBillingPortalSessionUrl(customerId, req.body);
  if ("error" in result) {
    res.status(result.status).json({
      message: result.error,
      ...(result.detail ? { detail: result.detail } : {}),
    });
    return;
  }
  res.status(200).json({ url: result.url });
}
