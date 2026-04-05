/**
 * @file route.ts
 * @description Stripe Webhook 处理路由
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";

import { jsonError } from "@/lib/api/response";

export const runtime = "nodejs";

/**
 * 获取 Stripe 实例（延迟初始化，避免构建时报错）
 */
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

/**
 * 处理 Stripe Webhook 事件
 * @param req - Stripe 发送的 Webhook 请求
 * @returns 确认接收
 */
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

  try {
    stripe.client.webhooks.constructEvent(body, signature, stripe.webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return jsonError("invalid_signature", message, {
      status: 400,
    });
  }

  // TODO: 处理订阅事件
  // - customer.subscription.created
  // - customer.subscription.updated
  // - customer.subscription.deleted

  return NextResponse.json({ received: true });
}
