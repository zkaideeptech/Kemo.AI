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

/**
 * 更新指定任务
 * 当前只允许修改标题
 */
export async function PATCH(
  req: Request,
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

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return jsonError("invalid_payload", "Title is required", { status: 400 });
  }

  const { data: jobData, error } = await supabase
    .from("jobs")
    .update({ title })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (error || !job) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  return jsonOk({ job });
}

export async function DELETE(
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

  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as Pick<JobRow, "id" | "user_id"> | null;

  if (jobError || !job || job.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const cleanupTargets = [
    "favorites",
    "artifacts",
    "transcripts",
    "memos",
    "sources",
    "audio_assets",
    "term_occurrences",
    "confirmations",
    "credits_ledger",
  ] as const;

  const cleanupResults = await Promise.all(
    cleanupTargets.map((table) =>
      supabase
        .from(table)
        .delete()
        .eq("user_id", user.id)
        .eq("job_id", id)
    )
  );

  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) {
    return jsonError("db_error", cleanupError.message, { status: 500 });
  }

  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ removed: true });
}
