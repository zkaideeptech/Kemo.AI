/**
 * @file jobPipeline.ts
 * @description 任务执行管道，负责 ASR 转写 → 术语抽取 → 用户确认 → 生成摘要的完整流程
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import {
  formatSpeakerTranscript,
  extractSpeakerSegments,
  startTranscription,
  pollResult,
  transcribeWithSpeakerDiarization,
} from "@/lib/providers/asrProvider";
import { extractTerms } from "@/lib/providers/termProvider";
import { generateArtifactText, generateIcQa, generateWeChatArticle } from "@/lib/providers/llmProvider";
import type { Database, Json } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type AudioAssetRow = Database["public"]["Tables"]["audio_assets"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type GlossaryTermRow = Pick<Database["public"]["Tables"]["glossary_terms"]["Row"], "term" | "normalized_term">;
type TermOccurrenceRow = Database["public"]["Tables"]["term_occurrences"]["Row"];
type MemoRow = Database["public"]["Tables"]["memos"]["Row"];

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_MAX_ATTEMPTS = 120;
const LOG = "[Pipeline]";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilCompleted(vendorTaskId: string) {
  let attempt = 0;
  let result;

  while (attempt < DEFAULT_POLL_MAX_ATTEMPTS) {
    result = await pollResult({ vendorTaskId });
    if (result.status === "completed") {
      return result;
    }
    if (result.status === "failed") {
      throw new Error(`ASR failed: ${result.errorMessage || "unknown"}`);
    }

    attempt += 1;
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error("ASR polling timed out");
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
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  const job = jobData as JobRow | null;

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
  const { data: audioAssetData } = await supabase
    .from("audio_assets")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  const audioAsset = audioAssetData as AudioAssetRow | null;

  if (!audioAsset) {
    console.error(`${LOG} ✗ 音频资源不存在`);
    throw new Error("Audio asset not found");
  }

  console.log(`${LOG} 音频: ${audioAsset.file_name} / ${(audioAsset.file_size / 1024 / 1024).toFixed(2)}MB`);

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";

  // ================================================================
  // 阶段 1：ASR 转写
  // ================================================================
  const { data: transcriptData } = await supabase
    .from("transcripts")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  let transcript = transcriptData as TranscriptRow | null;

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

    // 提交主转写任务
    const { vendorTaskId } = await startTranscription({
      audioUrl: signed.signedUrl,
    });

    const result = await pollUntilCompleted(vendorTaskId);

    let transcriptText = result.transcriptText || "";
    let speakerTranscriptText = "";
    let diarizationRaw: unknown = null;

    try {
      console.log(`${LOG} 尝试生成说话人分离版本...`);
      const diarizationTaskId = await transcribeWithSpeakerDiarization({
        audioUrl: signed.signedUrl,
      });
      const diarizationResult = await pollUntilCompleted(diarizationTaskId);
      const diarizationPayload =
        diarizationResult.raw &&
        typeof diarizationResult.raw === "object" &&
        "transcription" in (diarizationResult.raw as Record<string, unknown>)
          ? (diarizationResult.raw as Record<string, unknown>).transcription
          : diarizationResult.raw;
      const speakerSegments = extractSpeakerSegments(diarizationPayload);
      speakerTranscriptText = formatSpeakerTranscript(speakerSegments);
      diarizationRaw = diarizationResult.raw;

      if (speakerTranscriptText.trim()) {
        transcriptText = speakerTranscriptText;
        console.log(`${LOG} ✓ 说话人分离完成: ${speakerSegments.length} 句 / ${speakerTranscriptText.length} 字符`);
      } else {
        console.log(`${LOG} ⏭ 说话人分离未返回 speaker_id，保留主转写`);
      }
    } catch (error) {
      console.warn(`${LOG} ⚠ 说话人分离失败，保留主转写:`, error instanceof Error ? error.message : error);
    }

    // 写入转写结果
    const { data: transcriptRow, error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        user_id: userId,
        job_id: jobId,
        transcript_text: transcriptText,
        raw: ({
          primary: result.raw || null,
          diarization: diarizationRaw,
          speaker_transcript_text: speakerTranscriptText || null,
        } satisfies Record<string, unknown>) as Json,
      })
      .select("*")
      .single();

    if (transcriptError || !transcriptRow) {
      console.error(`${LOG} ✗ 转写结果写入失败:`, transcriptError?.message);
      throw new Error(transcriptError?.message || "Failed to write transcript");
    }

    transcript = transcriptRow as TranscriptRow;
    console.log(`${LOG} ✓ 转写完成: ${transcript.transcript_text.length} 字符`);

    await supabase
      .from("jobs")
      .update({ transcript_id: transcript.id, status: JOB_STATUS.extracting_terms })
      .eq("id", jobId);

  } else {
    console.log(`${LOG} ⏭ 转写已存在，跳过 ASR`);
  }

  // ================================================================
  // 阶段 2：术语抽取
  // ================================================================
  const { data: existingTermsData } = await supabase
    .from("term_occurrences")
    .select("*")
    .eq("job_id", jobId);

  const existingTerms = (existingTermsData || null) as TermOccurrenceRow[] | null;

  if (!existingTerms || existingTerms.length === 0) {
    console.log(`\n${LOG} ── 阶段 2/4: 术语抽取 ──`);

    await supabase
      .from("jobs")
      .update({ status: JOB_STATUS.extracting_terms })
      .eq("id", jobId);

    const { data: glossaryTermsData } = await supabase
      .from("glossary_terms")
      .select("term, normalized_term")
      .eq("user_id", userId);

    const glossaryTerms = (glossaryTermsData || []) as GlossaryTermRow[];
    const glossaryList = glossaryTerms.map((t) => t.term);
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
  const { data: pendingTermsData } = await supabase
    .from("term_occurrences")
    .select("*")
    .eq("job_id", jobId)
    .eq("status", "pending");

  const pendingTerms = (pendingTermsData || null) as TermOccurrenceRow[] | null;

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

  const { data: glossaryData } = await supabase
    .from("glossary_terms")
    .select("term")
    .eq("user_id", userId);

  const glossary = (glossaryData || []) as Array<Pick<GlossaryTermRow, "term">>;
  const glossaryTerms = glossary.map((g) => g.term);

  console.log(`${LOG} 生成发布稿整理...`);
  const publishScript = await generateArtifactText("publish_script", {
    transcriptText: transcript.transcript_text,
    glossaryTerms,
    uncertainTerms: [],
    title: job.title || "",
    guestName: job.guest_name || "",
    interviewerName: job.interviewer_name || "",
  });
  console.log(`${LOG} ✓ 发布稿整理: ${publishScript.length} 字符`);

  console.log(`${LOG} 生成快速摘要...`);
  const quickSummary = await generateArtifactText("quick_summary", {
    transcriptText: transcript.transcript_text,
    glossaryTerms,
    uncertainTerms: [],
    title: job.title || "",
    guestName: job.guest_name || "",
    interviewerName: job.interviewer_name || "",
  });
  console.log(`${LOG} ✓ 快速摘要: ${quickSummary.length} 字符`);

  console.log(`${LOG} 生成灵感追问...`);
  const inspirationQuestions = await generateArtifactText("inspiration_questions", {
    transcriptText: transcript.transcript_text,
    glossaryTerms,
    uncertainTerms: [],
    title: job.title || "",
    guestName: job.guest_name || "",
    interviewerName: job.interviewer_name || "",
    publishScriptText: publishScript,
  });
  console.log(`${LOG} ✓ 灵感追问: ${inspirationQuestions.length} 字符`);

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

  const { data: memoData, error: memoError } = await supabase
    .from("memos")
    .insert({
      user_id: userId,
      job_id: jobId,
      ic_qa_text: icQa,
      wechat_article_text: wechat,
    })
    .select("*")
    .single();

  const memoRow = memoData as MemoRow | null;

  if (memoError || !memoRow) {
    console.error(`${LOG} ✗ 摘要写入失败:`, memoError?.message);
    throw new Error(memoError?.message || "Failed to write memo");
  }

  await supabase
    .from("jobs")
    .update({ memo_id: memoRow.id, status: JOB_STATUS.completed })
    .eq("id", jobId);

  try {
    await supabase.from("artifacts").insert([
      {
        user_id: userId,
        project_id: job.project_id,
        job_id: jobId,
        kind: "publish_script",
        title: "发布稿整理",
        content: publishScript,
        summary: publishScript.slice(0, 180),
        status: "ready",
      },
      {
        user_id: userId,
        project_id: job.project_id,
        job_id: jobId,
        kind: "quick_summary",
        title: "快速摘要",
        content: quickSummary,
        summary: quickSummary.slice(0, 180),
        status: "ready",
      },
      {
        user_id: userId,
        project_id: job.project_id,
        job_id: jobId,
        kind: "inspiration_questions",
        title: "灵感追问",
        content: inspirationQuestions,
        summary: inspirationQuestions.slice(0, 180),
        status: "ready",
      },
      {
        user_id: userId,
        project_id: job.project_id,
        job_id: jobId,
        kind: "ic_qa",
        title: "IC 纪要",
        content: icQa,
        summary: icQa.slice(0, 180),
        status: "ready",
      },
      {
        user_id: userId,
        project_id: job.project_id,
        job_id: jobId,
        kind: "wechat_article",
        title: "公众号长文",
        content: wechat,
        summary: wechat.slice(0, 180),
        status: "ready",
      },
    ]);
  } catch (error) {
    console.error(`${LOG} ⚠ artifact 写入失败（保留 legacy memo）:`, error);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${LOG} ✅ Pipeline 完成: ${jobId.slice(0, 8)}... (${elapsed}s)`);
  console.log(`${"=".repeat(60)}\n`);
}
