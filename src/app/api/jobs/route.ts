/**
 * @file route.ts
 * @description 任务创建与列表 API，负责上传音频并创建 Job
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getUserPlan, FREE_MAX_JOBS_PER_MONTH } from "@/lib/billing/plan";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

const LOG = "[API /jobs]";

export const runtime = "nodejs";

/**
 * 获取当前用户的任务列表
 */
export async function GET() {
  console.log(`${LOG} GET 任务列表`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.log(`${LOG} ✗ 未认证`);
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  console.log(`${LOG} 用户: ${user.id.slice(0, 8)}...`);

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`${LOG} ✗ 查询失败:`, error.message);
    return jsonError("db_error", error.message, { status: 500 });
  }

  console.log(`${LOG} ✓ 返回 ${data?.length || 0} 个任务`);
  return jsonOk({ jobs: data });
}

/**
 * 创建新任务并上传音频文件
 */
export async function POST(req: Request) {
  console.log(`${LOG} POST 创建任务`);

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.log(`${LOG} ✗ 未认证`);
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  console.log(`${LOG} 用户: ${user.id.slice(0, 8)}... / ${user.email}`);

  // 获取用户套餐
  const plan = await getUserPlan(supabase, user.id);
  console.log(`${LOG} 套餐: ${plan.plan} / 单文件上限: ${plan.maxFileSizeMb}MB`);

  // 权益检查：Free 用户每月任务数限制
  if (plan.plan === "free") {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count } = await admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    const jobsThisMonth = count || 0;
    console.log(`${LOG} 本月已用任务: ${jobsThisMonth}/${FREE_MAX_JOBS_PER_MONTH}`);

    if (jobsThisMonth >= FREE_MAX_JOBS_PER_MONTH) {
      console.log(`${LOG} ✗ Free 用户月度任务数已达上限`);
      return jsonError(
        "quota_exceeded",
        `Free plan allows ${FREE_MAX_JOBS_PER_MONTH} jobs/month. Upgrade to Pro.`,
        { status: 403 }
      );
    }
  }

  // 解析上传内容
  const formData = await req.formData();
  const file = formData.get("file");
  const title = formData.get("title")?.toString() || null;

  if (!(file instanceof File)) {
    console.log(`${LOG} ✗ 缺少音频文件`);
    return jsonError("invalid_file", "Missing audio file", { status: 400 });
  }

  const fileSizeMb = file.size / (1024 * 1024);
  console.log(`${LOG} 文件: ${file.name} / ${fileSizeMb.toFixed(2)}MB / ${file.type}`);

  // 权益检查：文件大小限制
  if (fileSizeMb > plan.maxFileSizeMb) {
    console.log(`${LOG} ✗ 文件超限: ${fileSizeMb.toFixed(2)}MB > ${plan.maxFileSizeMb}MB`);
    return jsonError(
      "file_too_large",
      `File exceeds ${plan.maxFileSizeMb}MB limit`,
      { status: 400 }
    );
  }

  // 创建 Job 记录
  console.log(`${LOG} 创建 Job 记录...`);
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      title,
      status: JOB_STATUS.pending,
    })
    .select("*")
    .single();

  const job = jobData as JobRow | null;

  if (jobError || !job) {
    console.error(`${LOG} ✗ Job 创建失败:`, jobError?.message);
    return jsonError("db_error", jobError?.message || "Failed to create job", { status: 500 });
  }

  console.log(`${LOG} ✓ Job 已创建: ${job.id}`);

  // 上传音频到 Storage
  // 清洗文件名：Supabase Storage 不支持中文/空格等特殊字符
  const safeFileName = file.name
    .replace(/[^\w.\-]/g, "_")  // 非字母数字点横线全部替换为下划线
    .replace(/_+/g, "_");       // 连续下划线合并
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
  const storagePath = `${user.id}/${job.id}/${safeFileName}`;
  console.log(`${LOG} 原始文件名: ${file.name} → 安全文件名: ${safeFileName}`);
  console.log(`${LOG} 上传音频: ${bucket}/${storagePath} (${fileSizeMb.toFixed(2)}MB)`);

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "audio/mpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error(`${LOG} ✗ Storage 上传失败:`, uploadError.message);
    await admin
      .from("jobs")
      .update({ status: JOB_STATUS.failed, error_message: uploadError.message })
      .eq("id", job.id);
    return jsonError("upload_failed", uploadError.message, { status: 500 });
  }

  console.log(`${LOG} ✓ 音频上传成功`);

  // 创建 audio_assets 记录
  const { data: audioAsset, error: audioError } = await admin
    .from("audio_assets")
    .insert({
      user_id: user.id,
      job_id: job.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    })
    .select("*")
    .single();

  if (audioError || !audioAsset) {
    console.error(`${LOG} ✗ audio_assets 写入失败:`, audioError?.message);
    await admin
      .from("jobs")
      .update({ status: JOB_STATUS.failed, error_message: audioError?.message })
      .eq("id", job.id);
    return jsonError("db_error", audioError?.message || "Audio asset failed", { status: 500 });
  }

  await admin
    .from("jobs")
    .update({ audio_asset_id: audioAsset.id })
    .eq("id", job.id);

  // 记入用量账本
  await admin.from("credits_ledger").insert({
    user_id: user.id,
    job_id: job.id,
    action: "debit",
    amount: 1,
    unit: "files",
  });

  console.log(`${LOG} ✓ 任务创建完成: jobId=${job.id}`);

  return jsonOk({ jobId: job.id });
}
