import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { buildClarificationContext, loadJobClarifications } from "@/lib/clarifications";
import { sanitizeTranscriptText } from "@/lib/live/transcriptCleanup";
import { generateArtifactText } from "@/lib/providers/llmProvider";
import { extractSpeakerSegments, formatSpeakerTranscript, pollResult, transcribeWithSpeakerDiarization } from "@/lib/providers/asrProvider";
import { getArtifactLabel } from "@/lib/workspace";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import type { Database, Json } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type AudioAssetRow = Database["public"]["Tables"]["audio_assets"]["Row"];

const DEFAULT_ASR_POLL_INTERVAL_MS = 5000;
const DEFAULT_ASR_POLL_MAX_ATTEMPTS = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilCompleted(vendorTaskId: string) {
  let attempt = 0;

  while (attempt < DEFAULT_ASR_POLL_MAX_ATTEMPTS) {
    const result = await pollResult({ vendorTaskId });
    if (result.status === "completed") {
      return result;
    }
    if (result.status === "failed") {
      throw new Error(result.errorMessage || "ASR failed");
    }

    attempt += 1;
    await sleep(DEFAULT_ASR_POLL_INTERVAL_MS);
  }

  throw new Error("ASR polling timed out");
}

function splitTranscriptUnits(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function dedupeUnits(units: string[]) {
  const seen = new Set<string>();

  return units.filter((unit) => {
    const key = unit.replace(/\s+/g, "");
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildFallbackPublishDraft({
  title,
  interviewerName,
  guestName,
  transcriptText,
}: {
  title: string;
  interviewerName: string;
  guestName: string;
  transcriptText: string;
}) {
  const units = dedupeUnits(splitTranscriptUnits(transcriptText));
  const recap = units.slice(0, 4).map((unit, index) => `${index + 1}. ${unit}`).join("\n");
  const excerpt = units.slice(0, 8).join("\n\n");

  return [
    `# ${title || "实时访谈基础整理版"}`,
    "",
    interviewerName ? `采访者：${interviewerName}` : null,
    guestName ? `受访者：${guestName}` : null,
    "",
    "## 当前摘要",
    recap || "转写已同步，AI 草稿暂不可用。",
    "",
    "## 转写摘录",
    excerpt || transcriptText.trim(),
    "",
    "## 说明",
    "当前内容为基础整理版。AI 草稿暂时不可用，恢复后可重新生成正式稿。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackInspirationDraft(transcriptText: string) {
  const units = dedupeUnits(splitTranscriptUnits(transcriptText));
  const focus = units.slice(0, 3);

  return [
    "1. 这一段里最值得追问的核心判断是什么？证据是否已经说清？",
    focus[0] ? `2. 围绕“${focus[0].slice(0, 28)}${focus[0].length > 28 ? "…" : ""}”继续追问：背景、数据、边界条件分别是什么？` : "2. 继续追问：背景、数据、边界条件分别是什么？",
    focus[1] ? `3. 如果把“${focus[1].slice(0, 24)}${focus[1].length > 24 ? "…" : ""}”展开成一个完整案例，还缺哪些细节？` : "3. 如果把当前观点展开成一个完整案例，还缺哪些细节？",
    "4. 这段内容里有哪些名词、时间点、数字还需要二次核实？",
  ].join("\n");
}

function buildFallbackQuickSummary({
  title,
  transcriptText,
}: {
  title: string;
  transcriptText: string;
}) {
  const units = dedupeUnits(splitTranscriptUnits(transcriptText));
  const overview = units.slice(0, 3);
  const focus = units.slice(3, 8);

  return [
    title ? `### ${title}` : "### 快速摘要",
    "",
    "总览：",
    ...overview.map((unit) => `- ${unit}`),
    "",
    "重点：",
    ...(focus.length ? focus : overview).map((unit) => `- ${unit}`),
  ].join("\n");
}

function getLiveDraftWarning(error: unknown) {
  const message = error instanceof Error ? error.message : "Live draft generation failed";
  const normalized = message.toLowerCase();

  if (normalized.includes("429") || normalized.includes("quota") || normalized.includes("billing")) {
    return "转写已同步，AI 草稿额度不足，已切换为基础整理版。";
  }

  return "转写已同步，AI 草稿暂不可用，已切换为基础整理版。";
}

function buildSourceContext(sources: SourceRow[]) {
  return sources
    .map((source, index) => {
      const header = `Source ${index + 1}: ${source.title || source.url || "Imported source"}`;
      const body = (source.extracted_text || "").slice(0, 2000);
      return `${header}\n${body}`;
    })
    .filter((item) => item.trim().length > 0)
    .join("\n\n---\n\n")
    .slice(0, 10000);
}

async function buildLiveSpeakerTranscript({
  admin,
  job,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  job: JobRow;
}) {
  if (!job.audio_asset_id) {
    return {
      transcriptText: "",
      speakerTranscriptText: "",
      diarizationRaw: null,
    };
  }

  const { data: audioAssetData } = await admin
    .from("audio_assets")
    .select("*")
    .eq("id", job.audio_asset_id)
    .maybeSingle();

  const audioAsset = audioAssetData as AudioAssetRow | null;
  if (!audioAsset) {
    return {
      transcriptText: "",
      speakerTranscriptText: "",
      diarizationRaw: null,
    };
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
  const { data: signedData, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(audioAsset.storage_path, 60 * 60);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(signedError?.message || "Failed to create signed URL for live audio");
  }

  const diarizationTaskId = await transcribeWithSpeakerDiarization({
    audioUrl: signedData.signedUrl,
    language: "zh",
  });
  const diarizationResult = await pollUntilCompleted(diarizationTaskId);
  const diarizationPayload =
    diarizationResult.raw &&
    typeof diarizationResult.raw === "object" &&
    "transcription" in (diarizationResult.raw as Record<string, unknown>)
      ? (diarizationResult.raw as Record<string, unknown>).transcription
      : diarizationResult.raw;
  const speakerSegments = extractSpeakerSegments(diarizationPayload);
  const speakerTranscriptText = formatSpeakerTranscript(speakerSegments);

  return {
    transcriptText: speakerTranscriptText.trim(),
    speakerTranscriptText: speakerTranscriptText.trim(),
    diarizationRaw: diarizationResult.raw,
  };
}

export const runtime = "nodejs";

export async function POST(
  req: Request,
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
  const userId = user.id;

  const body = await req.json().catch(() => ({}));
  const transcriptText = typeof body?.transcriptText === "string" ? sanitizeTranscriptText(body.transcriptText) : "";
  const statusText = typeof body?.statusText === "string" ? body.statusText.trim() : "";
  const finalize = Boolean(body?.finalize);
  const includeInspiration = finalize || Boolean(body?.includeInspiration);

  if (!transcriptText) {
    return jsonError("invalid_payload", "Missing transcriptText", { status: 400 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== userId) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const ensuredJob = job;
  let finalTranscriptText = transcriptText;
  let diarizationRaw: unknown = null;
  let speakerTranscriptText = "";

  if (finalize) {
    try {
      const diarizationResult = await buildLiveSpeakerTranscript({
        admin,
        job: ensuredJob,
      });

      if (diarizationResult.transcriptText) {
        finalTranscriptText = sanitizeTranscriptText(diarizationResult.transcriptText);
        speakerTranscriptText = diarizationResult.speakerTranscriptText;
        diarizationRaw = diarizationResult.diarizationRaw;
      }
    } catch {
      // keep the realtime snapshot transcript as fallback
    }
  }

  const { data: updatedJobData, error: updateJobError } = await admin
    .from("jobs")
    .update({
      live_transcript_snapshot: finalTranscriptText,
      capture_mode: "live",
      source_type: ensuredJob.capture_mode === "live" ? ensuredJob.source_type : "live_capture",
      started_at: ensuredJob.started_at || new Date().toISOString(),
      ...(finalize ? { status: "completed" } : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateJobError || !updatedJobData) {
    return jsonError("db_error", updateJobError?.message || "Failed to update live transcript", { status: 500 });
  }

  if (finalTranscriptText.length < 24 && !finalize) {
    return jsonOk({ job: updatedJobData, draftArtifacts: [], statusText });
  }

  const { data: glossary } = await supabase
    .from("glossary_terms")
    .select("term")
    .eq("user_id", userId);

  const { data: sourcesData } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", ensuredJob.project_id || "")
    .order("created_at", { ascending: false })
    .limit(6);

  const glossaryTerms = (glossary || []).map((term) => term.term);
  const sourceContext = buildSourceContext((sourcesData || []) as SourceRow[]);
  const clarifications = await loadJobClarifications(supabase, id);
  const clarificationContext = buildClarificationContext(clarifications);

  async function upsertDraftArtifact(
    kind: "publish_script" | "quick_summary" | "inspiration_questions",
    content: string
  ) {
    const { data: existingDraftData } = await supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .eq("kind", kind)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingDraft = existingDraftData as ArtifactRow | null;
    const nextMetadata = {
      generated_at: new Date().toISOString(),
      live_draft: "true",
      status_text: statusText,
    };

    if (existingDraft) {
      const { data: updatedDraftData, error: draftUpdateError } = await admin
        .from("artifacts")
        .update({
          title: `${getArtifactLabel(kind)}（实时草稿）`,
          content,
          summary: content.slice(0, 180),
          metadata: nextMetadata,
        })
        .eq("id", existingDraft.id)
        .select("*")
        .single();

      if (draftUpdateError || !updatedDraftData) {
        throw new Error(draftUpdateError?.message || `Failed to update ${kind} draft`);
      }

      return updatedDraftData as ArtifactRow;
    }

    const { data: createdDraftData, error: draftCreateError } = await admin
      .from("artifacts")
      .insert({
        user_id: userId,
        project_id: ensuredJob.project_id,
        job_id: ensuredJob.id,
        kind,
        title: `${getArtifactLabel(kind)}（实时草稿）`,
        content,
        summary: content.slice(0, 180),
        metadata: nextMetadata,
        status: "draft",
      })
      .select("*")
      .single();

    if (draftCreateError || !createdDraftData) {
      throw new Error(draftCreateError?.message || `Failed to create ${kind} draft`);
    }

    return createdDraftData as ArtifactRow;
  }

  const draftArtifacts: ArtifactRow[] = [];

  try {
    const draftText = await generateArtifactText("publish_script", {
      transcriptText: finalTranscriptText,
      glossaryTerms,
      uncertainTerms: [],
      sourceContext,
      clarificationContext,
      title: ensuredJob.title || "",
      guestName: ensuredJob.guest_name || "",
      interviewerName: ensuredJob.interviewer_name || "",
      isLiveDraft: true,
    });

    draftArtifacts.push(await upsertDraftArtifact("publish_script", draftText));

    const quickSummaryText = await generateArtifactText("quick_summary", {
      transcriptText: finalTranscriptText,
      glossaryTerms,
      uncertainTerms: [],
      sourceContext,
      clarificationContext,
      title: ensuredJob.title || "",
      guestName: ensuredJob.guest_name || "",
      interviewerName: ensuredJob.interviewer_name || "",
      publishScriptText: draftText,
      isLiveDraft: true,
    });

    draftArtifacts.push(await upsertDraftArtifact("quick_summary", quickSummaryText));

    if (includeInspiration && finalTranscriptText.length >= 60) {
      const inspirationText = await generateArtifactText("inspiration_questions", {
        transcriptText: finalTranscriptText,
        glossaryTerms,
        uncertainTerms: [],
        sourceContext,
        clarificationContext,
        title: ensuredJob.title || "",
        guestName: ensuredJob.guest_name || "",
        interviewerName: ensuredJob.interviewer_name || "",
        publishScriptText: draftText,
        isLiveDraft: true,
      });

      draftArtifacts.push(await upsertDraftArtifact("inspiration_questions", inspirationText));
    }

    if (!finalize) {
      return jsonOk({
        job: updatedJobData,
        draftArtifacts,
        statusText,
      });
    }
  } catch (error) {
    if (!draftArtifacts.some((artifact) => artifact.kind === "publish_script")) {
      const fallbackPublishDraft = buildFallbackPublishDraft({
        title: ensuredJob.title || "",
        interviewerName: ensuredJob.interviewer_name || "",
        guestName: ensuredJob.guest_name || "",
        transcriptText: finalTranscriptText,
      });

      draftArtifacts.push(await upsertDraftArtifact("publish_script", fallbackPublishDraft));
    }

    if (!draftArtifacts.some((artifact) => artifact.kind === "quick_summary")) {
      draftArtifacts.push(
        await upsertDraftArtifact(
          "quick_summary",
          buildFallbackQuickSummary({
            title: ensuredJob.title || "",
            transcriptText: finalTranscriptText,
          })
        )
      );
    }

    if (finalTranscriptText.length >= 60 && !draftArtifacts.some((artifact) => artifact.kind === "inspiration_questions")) {
      draftArtifacts.push(await upsertDraftArtifact("inspiration_questions", buildFallbackInspirationDraft(finalTranscriptText)));
    }

    if (!finalize) {
      return jsonOk({
        job: updatedJobData,
        draftArtifacts,
        statusText,
        warning: getLiveDraftWarning(error),
      });
    }
  }

  let transcriptRow: TranscriptRow | null = null;
  const { data: existingTranscriptData } = await supabase
    .from("transcripts")
    .select("*")
    .eq("job_id", id)
    .maybeSingle();

  const existingTranscript = existingTranscriptData as TranscriptRow | null;

  if (existingTranscript) {
    const { data: updatedTranscriptData, error: transcriptUpdateError } = await admin
      .from("transcripts")
      .update({
        transcript_text: finalTranscriptText,
        raw: ({
          source: "live_capture",
          finalized_at: new Date().toISOString(),
          status_text: statusText,
          realtime_snapshot_text: transcriptText,
          diarization: diarizationRaw,
          speaker_transcript_text: speakerTranscriptText || null,
        } satisfies Record<string, unknown>) as Json,
      })
      .eq("id", existingTranscript.id)
      .select("*")
      .single();

    if (transcriptUpdateError || !updatedTranscriptData) {
      return jsonError("db_error", transcriptUpdateError?.message || "Failed to finalize transcript", { status: 500 });
    }

    transcriptRow = updatedTranscriptData as TranscriptRow;
  } else {
    const { data: createdTranscriptData, error: transcriptCreateError } = await admin
      .from("transcripts")
      .insert({
        user_id: userId,
        job_id: id,
        transcript_text: finalTranscriptText,
        raw: ({
          source: "live_capture",
          finalized_at: new Date().toISOString(),
          status_text: statusText,
          realtime_snapshot_text: transcriptText,
          diarization: diarizationRaw,
          speaker_transcript_text: speakerTranscriptText || null,
        } satisfies Record<string, unknown>) as Json,
      })
      .select("*")
      .single();

    if (transcriptCreateError || !createdTranscriptData) {
      return jsonError("db_error", transcriptCreateError?.message || "Failed to finalize transcript", { status: 500 });
    }

    transcriptRow = createdTranscriptData as TranscriptRow;
  }

  await admin
    .from("jobs")
    .update({
      transcript_id: transcriptRow.id,
      status: JOB_STATUS.completed,
      ended_at: new Date().toISOString(),
      live_transcript_snapshot: finalTranscriptText,
    })
    .eq("id", id);

  const { data: finalArtifactsData } = await admin
    .from("artifacts")
    .select("*")
    .eq("job_id", id)
    .in("kind", ["publish_script", "quick_summary", "inspiration_questions"])
    .order("updated_at", { ascending: false });

  const finalArtifacts = ((finalArtifactsData || []) as ArtifactRow[]).map((artifact) => ({
    ...artifact,
    title:
      artifact.status === "draft"
        ? getArtifactLabel(artifact.kind as "publish_script" | "quick_summary" | "inspiration_questions")
        : artifact.title,
    status: "ready",
    metadata: {
      ...((artifact.metadata as Record<string, string | null>) || {}),
      live_draft: "false",
      finalized_at: new Date().toISOString(),
      status_text: statusText,
    },
  }));

  for (const artifact of finalArtifacts) {
    await admin
      .from("artifacts")
      .update({
        title: artifact.title,
        status: artifact.status,
        metadata: artifact.metadata,
      })
      .eq("id", artifact.id);
  }

  const { data: finalizedJobData } = await admin
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  return jsonOk({
    job: finalizedJobData || updatedJobData,
    draftArtifacts: finalArtifacts,
    transcript: transcriptRow,
    statusText,
  });
}
