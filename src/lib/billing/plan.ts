/**
 * @file plan.ts
 * @description 用户套餐管理，获取 Free/Pro 计划信息和权益限制
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanTier = "free" | "pro";

/** Free 用户单文件上限 50MB */
export const FREE_MAX_FILE_SIZE_MB = 50;
/** Pro 用户单文件上限（默认 500MB，可通过环境变量调整） */
export const DEFAULT_PRO_MAX_FILE_SIZE_MB = Number(process.env.PRO_MAX_FILE_SIZE_MB || 500);
/** Free 用户每月最多任务数 */
export const FREE_MAX_JOBS_PER_MONTH = 10;

/**
 * 获取用户当前套餐信息和权益限制
 * @param supabase - Supabase 客户端实例
 * @param userId - 用户 ID
 * @returns 套餐类型和文件大小限制
 */
export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<{ plan: PlanTier; maxFileSizeMb: number }> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { status: string | null; plan: string | null } | null;
  const plan = row?.status === "active" && row?.plan === "pro" ? "pro" : "free";
  const maxFileSizeMb = plan === "pro" ? DEFAULT_PRO_MAX_FILE_SIZE_MB : FREE_MAX_FILE_SIZE_MB;

  return { plan, maxFileSizeMb };
}
