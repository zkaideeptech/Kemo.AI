import Stripe from "stripe";

import { jsonError, jsonOk } from "@/lib/api/response";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getStripe() {
  const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
  const priceId = process.env.STRIPE_PRO_PRICE_ID || "";

  if (!stripeSecret || !priceId) {
    return null;
  }

  return {
    client: new Stripe(stripeSecret, { apiVersion: "2026-01-28.clover" }),
    priceId,
  };
}

export async function POST(req: Request) {
  const stripe = getStripe();

  if (!stripe) {
    return jsonError("missing_env", "Stripe checkout env not configured", { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const body = await req.json().catch(() => ({}));
  const locale = typeof body?.locale === "string" && body.locale === "en" ? "en" : "zh";

  const session = await stripe.client.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email || undefined,
    line_items: [{ price: stripe.priceId, quantity: 1 }],
    success_url: `${origin}/${locale}/app/settings?checkout=success`,
    cancel_url: `${origin}/${locale}/app/settings?checkout=cancelled`,
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan: "pro",
      },
    },
    metadata: {
      user_id: user.id,
      plan: "pro",
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return jsonError("checkout_failed", "Stripe did not return a checkout URL", { status: 500 });
  }

  return jsonOk({ url: session.url });
}
