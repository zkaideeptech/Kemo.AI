/**
 * @file route.ts
 * @description 术语确认 API，处理用户对模糊词的确认/编辑/拒绝
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { enqueueJob } from "@/lib/workflows/queue";
import { runJobPipeline } from "@/lib/workflows/jobPipeline";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";

export const runtime = "nodejs";

/**
 * 提交术语确认结果
 * @param req - 包含术语确认数据的请求
 * @param context - 包含任务 ID 的路由参数
 * @returns 确认结果
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json();
  const terms = body?.terms as Array<{
    id: string;
    termText: string;
    confirmedText: string;
    action: "accept" | "edit" | "reject";
    context?: string;
  }>;

  if (!Array.isArray(terms)) {
    return jsonError("invalid_payload", "Invalid terms payload", { status: 400 });
  }

  for (const term of terms) {
    const confirmed = term.confirmedText?.trim() || term.termText;

    await admin.from("confirmations").insert({
      user_id: user.id,
      job_id: jobId,
      term_text: term.termText,
      confirmed_text: confirmed,
      action: term.action,
      context: term.context || null,
      source: "user",
    });

    if (term.action !== "reject") {
      await admin.from("glossary_terms").upsert(
        {
          user_id: user.id,
          term: confirmed,
          normalized_term: confirmed.toLowerCase(),
          source: "confirmed",
        },
        { onConflict: "user_id,term" }
      );
    }

    await admin
      .from("term_occurrences")
      .update({ status: term.action === "reject" ? "rejected" : "confirmed" })
      .eq("id", term.id)
      .eq("user_id", user.id);
  }

  await admin
    .from("jobs")
    .update({ status: JOB_STATUS.queued, needs_review: false })
    .eq("id", jobId);

  await enqueueJob(jobId);

  const mode = process.env.JOB_EXECUTION_MODE || "queue";
  const isInline = mode === "inline" && process.env.NODE_ENV === "development";

  if (isInline) {
    runJobPipeline(jobId).catch(async (err) => {
      await admin
        .from("jobs")
        .update({
          status: JOB_STATUS.failed,
          error_message: err?.message || "Job failed",
        })
        .eq("id", jobId);
    });
  }

  return jsonOk({ ok: true });
}
