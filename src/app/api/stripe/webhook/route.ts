import Stripe from "stripe";

import { jsonError, jsonOk } from "@/lib/api/response";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HANDLED_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function getStripe() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!stripeSecret || !webhookSecret) {
    return null;
  }

  return {
    client: new Stripe(stripeSecret, { apiVersion: "2026-01-28.clover" }),
    webhookSecret,
  };
}

function getSubscriptionPlan(subscription: Stripe.Subscription) {
  const metadataPlan = subscription.metadata?.plan;
  if (metadataPlan === "pro" || metadataPlan === "free") {
    return metadataPlan;
  }

  const price = subscription.items.data[0]?.price;
  const lookupKey = price?.lookup_key;
  const nickname = price?.nickname?.toLowerCase();
  return lookupKey === "pro" || nickname?.includes("pro") ? "pro" : "free";
}

function getPeriodEnd(subscription: Stripe.Subscription) {
  const itemPeriodEnd = subscription.items.data[0]?.current_period_end;
  const periodEnd = itemPeriodEnd || subscription.trial_end || null;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

async function resolveSubscriptionUserId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  subscription: Stripe.Subscription
) {
  const metadataUserId = subscription.metadata?.user_id || subscription.metadata?.supabase_user_id;
  if (metadataUserId) return metadataUserId;

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) return null;

  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.user_id || null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = createSupabaseAdminClient();
  const userId = await resolveSubscriptionUserId(admin, subscription);

  if (!userId) {
    throw new Error("Stripe subscription is missing user_id metadata and no customer mapping exists");
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
  const status = subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due"
    ? subscription.status
    : "canceled";
  const plan = status === "active" || status === "trialing" ? getSubscriptionPlan(subscription) : "free";

  const { error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status,
        plan,
        current_period_end: getPeriodEnd(subscription),
      },
      { onConflict: "stripe_subscription_id" }
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();

  if (!stripe) {
    return jsonError("missing_env", "Stripe env not configured", { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return jsonError("missing_signature", "Missing Stripe signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.client.webhooks.constructEvent(body, signature, stripe.webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return jsonError("invalid_signature", message, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return jsonOk({ received: true, handled: false });
  }

  try {
    await syncSubscription(event.data.object as Stripe.Subscription);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to sync Stripe subscription";
    return jsonError("subscription_sync_failed", message, { status: 500 });
  }

  return jsonOk({ received: true, handled: true });
}
