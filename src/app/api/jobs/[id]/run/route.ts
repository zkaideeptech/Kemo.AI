/**
 * @file route.ts
 * @description 触发任务执行管道 API
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { enqueueJob } from "@/lib/workflows/queue";
import { runJobPipeline } from "@/lib/workflows/jobPipeline";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";

export const runtime = "nodejs";

/**
 * 触发任务处理管道
 * @param _req - 请求对象
 * @param context - 包含任务 ID 的路由参数
 * @returns 排队状态
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as { id: string; user_id: string } | null;

  if (!job || job.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  await enqueueJob(job.id);

  const mode = process.env.JOB_EXECUTION_MODE || "queue";
  const isInline = mode === "inline" && process.env.NODE_ENV === "development";

  if (isInline) {
    runJobPipeline(job.id).catch(async (err) => {
      await admin
        .from("jobs")
        .update({
          status: JOB_STATUS.failed,
          error_message: err?.message || "Job failed",
        })
        .eq("id", job.id);
    });
  }

  return jsonOk({ queued: true }, { status: 202 });
}
