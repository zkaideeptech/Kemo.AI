/**
 * @file route.ts
 * @description 单个任务详情 API
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * 获取指定任务详情
 * @param _req - 请求对象
 * @param context - 包含路由参数的上下文
 * @returns 任务详情数据
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: jobData, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (error || !job || job.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  return jsonOk({ job });
}
