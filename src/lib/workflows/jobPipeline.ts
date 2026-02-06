/**
 * @file jobPipeline.ts
 * @description 任务执行管道，负责 ASR 转写 → 术语抽取 → 用户确认 → 生成摘要的完整流程
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import { startTranscription, pollResult } from "@/lib/providers/asrProvider";
import { extractTerms } from "@/lib/providers/termProvider";
import { generateIcQa, generateWeChatArticle } from "@/lib/providers/llmProvider";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_MAX_ATTEMPTS = 120;
const LOG = "[Pipeline]";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 转录完成后删除原始音频文件（宪法第十三条）
 */
async function deleteAudioAfterTranscription(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  storagePath: string,
  audioAssetId: string
) {
  try {
    console.log(`${LOG} 🗑 删除原始音频: ${storagePath}`);
    await supabase.storage.from(bucket).remove([storagePath]);
    await supabase
      .from("audio_assets")
      .update({ storage_path: `deleted:${storagePath}` })
      .eq("id", audioAssetId);
    console.log(`${LOG} ✓ 音频已删除`);
  } catch (err) {
    console.error(`${LOG} ⚠ 音频删除失败（不影响主流程）:`, err);
  }
}

/**
 * 执行完整的任务处理管道
 * @param jobId - 任务 ID
 */
export async function runJobPipeline(jobId: string) {
  const startTime = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${LOG} ▶ 开始执行 Pipeline: ${jobId}`);
  console.log(`${"=".repeat(60)}`);

  const supabase = createSupabaseAdminClient();

  // ── 加载 Job ──
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error(`${LOG} ✗ Job 不存在: ${jobError?.message}`);
    throw new Error(jobError?.message || "Job not found");
  }

  if (job.status === JOB_STATUS.completed) {
    console.log(`${LOG} ⏭ Job 已完成，跳过`);
    return;
  }

  const userId = job.user_id;
  console.log(`${LOG} Job: ${jobId.slice(0, 8)}... / User: ${userId.slice(0, 8)}... / Status: ${job.status}`);

  // ── 加载音频资源 ──
  const { data: audioAsset } = await supabase
    .from("audio_assets")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!audioAsset) {
    console.error(`${LOG} ✗ 音频资源不存在`);
    throw new Error("Audio asset not found");
  }

  console.log(`${LOG} 音频: ${audioAsset.file_name} / ${(audioAsset.file_size / 1024 / 1024).toFixed(2)}MB`);

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";

  // ================================================================
  // 阶段 1：ASR 转写
  // ================================================================
  let { data: transcript } = await supabase
    .from("transcripts")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!transcript) {
    console.log(`\n${LOG} ── 阶段 1/4: ASR 转写 ──`);

    await supabase
      .from("jobs")
      .update({ status: JOB_STATUS.transcribing })
      .eq("id", jobId);

    // 生成 signed URL
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(audioAsset.storage_path, 60 * 60);

    if (!signed?.signedUrl) {
      console.error(`${LOG} ✗ 无法生成 signed URL`);
      throw new Error("Failed to create signed URL for audio");
    }

    console.log(`${LOG} Signed URL 已生成 (1h有效期)`);

    // 提交 ASR 任务
    const { vendorTaskId } = await startTranscription({
      audioUrl: signed.signedUrl,
    });

    // 轮询结果
    let attempt = 0;
    let result;

    while (attempt < DEFAULT_POLL_MAX_ATTEMPTS) {
      result = await pollResult({ vendorTaskId });
      if (result.status === "completed") break;
      if (result.status === "failed") {
        console.error(`${LOG} ✗ ASR 转写失败:`, result.errorMessage);
        throw new Error(`ASR failed: ${result.errorMessage || "unknown"}`);
      }
      attempt += 1;
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }

    if (!result || result.status !== "completed") {
      console.error(`${LOG} ✗ ASR 轮询超时 (${attempt} 次)`);
      throw new Error("ASR polling timed out");
    }

    // 写入转写结果
    const { data: transcriptRow, error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        user_id: userId,
        job_id: jobId,
        transcript_text: result.transcriptText || "",
        raw: result.raw || null,
      })
      .select("*")
      .single();

    if (transcriptError || !transcriptRow) {
      console.error(`${LOG} ✗ 转写结果写入失败:`, transcriptError?.message);
      throw new Error(transcriptError?.message || "Failed to write transcript");
    }

    transcript = transcriptRow;
    console.log(`${LOG} ✓ 转写完成: ${transcript.transcript_text.length} 字符`);

    await supabase
      .from("jobs")
      .update({ transcript_id: transcript.id, status: JOB_STATUS.extracting_terms })
      .eq("id", jobId);

    // 宪法第十三条：转录完成后删除原始音频
    await deleteAudioAfterTranscription(supabase, bucket, audioAsset.storage_path, audioAsset.id);
  } else {
    console.log(`${LOG} ⏭ 转写已存在，跳过 ASR`);
  }

  // ================================================================
  // 阶段 2：术语抽取
  // ================================================================
  const { data: existingTerms } = await supabase
    .from("term_occurrences")
    .select("*")
    .eq("job_id", jobId);

  if (!existingTerms || existingTerms.length === 0) {
    console.log(`\n${LOG} ── 阶段 2/4: 术语抽取 ──`);

    await supabase
      .from("jobs")
      .update({ status: JOB_STATUS.extracting_terms })
      .eq("id", jobId);

    const { data: glossaryTerms } = await supabase
      .from("glossary_terms")
      .select("term, normalized_term")
      .eq("user_id", userId);

    const glossaryList = (glossaryTerms || []).map((t: any) => t.term);
    console.log(`${LOG} 用户术语库: ${glossaryList.length} 个术语`);

    const extraction = await extractTerms({
      transcriptText: transcript.transcript_text,
      glossaryTerms: glossaryList,
    });

    console.log(`${LOG} 抽取到 ${extraction.candidates.length} 个候选术语`);

    if (extraction.candidates.length > 0) {
      const insertPayload = extraction.candidates.map((term) => ({
        user_id: userId,
        job_id: jobId,
        term_text: term.term,
        confidence: term.confidence,
        status: "pending",
        context: term.context || null,
      }));

      const { error: insertError } = await supabase
        .from("term_occurrences")
        .insert(insertPayload);

      if (insertError) {
        console.error(`${LOG} ✗ 术语写入失败:`, insertError.message);
        throw new Error(insertError.message);
      }
    }
  } else {
    console.log(`${LOG} ⏭ 术语已存在 (${existingTerms.length} 个)，跳过抽取`);
  }

  // ================================================================
  // 阶段 3：术语确认检查
  // ================================================================
  const { data: pendingTerms } = await supabase
    .from("term_occurrences")
    .select("*")
    .eq("job_id", jobId)
    .eq("status", "pending");

  if (pendingTerms && pendingTerms.length > 0) {
    console.log(`\n${LOG} ── 阶段 3/4: 等待用户确认 ──`);
    console.log(`${LOG} ⏸ ${pendingTerms.length} 个术语待确认，Pipeline 暂停`);

    await supabase
      .from("jobs")
      .update({ status: JOB_STATUS.needs_review, needs_review: true })
      .eq("id", jobId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${LOG} Pipeline 暂停 (${elapsed}s)，等待用户 Terms Review\n`);
    return;
  }

  // ================================================================
  // 阶段 4：生成摘要
  // ================================================================
  const { data: existingMemo } = await supabase
    .from("memos")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingMemo) {
    console.log(`${LOG} ⏭ 摘要已存在，直接完成`);
    await supabase
      .from("jobs")
      .update({ memo_id: existingMemo.id, status: JOB_STATUS.completed })
      .eq("id", jobId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${LOG} ✅ Pipeline 完成 (${elapsed}s)\n`);
    return;
  }

  console.log(`\n${LOG} ── 阶段 4/4: 生成摘要 ──`);

  await supabase
    .from("jobs")
    .update({ status: JOB_STATUS.summarizing, needs_review: false })
    .eq("id", jobId);

  const { data: glossary } = await supabase
    .from("glossary_terms")
    .select("term")
    .eq("user_id", userId);

  const glossaryTerms = (glossary || []).map((g: any) => g.term);

  console.log(`${LOG} 生成 IC Q&A 纪要...`);
  const icQa = await generateIcQa({
    transcriptText: transcript.transcript_text,
    glossaryTerms,
    uncertainTerms: [],
  });
  console.log(`${LOG} ✓ IC Q&A: ${icQa.length} 字符`);

  console.log(`${LOG} 生成公众号长文...`);
  const wechat = await generateWeChatArticle({
    transcriptText: transcript.transcript_text,
    glossaryTerms,
    uncertainTerms: [],
  });
  console.log(`${LOG} ✓ 公众号长文: ${wechat.length} 字符`);

  const { data: memoRow, error: memoError } = await supabase
    .from("memos")
    .insert({
      user_id: userId,
      job_id: jobId,
      ic_qa_text: icQa,
      wechat_article_text: wechat,
    })
    .select("*")
    .single();

  if (memoError || !memoRow) {
    console.error(`${LOG} ✗ 摘要写入失败:`, memoError?.message);
    throw new Error(memoError?.message || "Failed to write memo");
  }

  await supabase
    .from("jobs")
    .update({ memo_id: memoRow.id, status: JOB_STATUS.completed })
    .eq("id", jobId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${LOG} ✅ Pipeline 完成: ${jobId.slice(0, 8)}... (${elapsed}s)`);
  console.log(`${"=".repeat(60)}\n`);
}
