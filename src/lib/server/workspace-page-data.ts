import "server-only";

import { requireUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import { isLocalPreviewEnabled } from "@/lib/local-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildLegacyArtifacts,
  type ArtifactRow,
  type FavoriteRow,
  type JobRow,
  type ProjectRow,
  type SourceRow,
  type TranscriptRow,
  type WorkspaceArtifact,
} from "@/lib/workspace";

type MemoRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  ic_qa_text: string | null;
  wechat_article_text: string | null;
  created_at: string;
};

type WorkspacePlan = Awaited<ReturnType<typeof getUserPlan>>;

export type WorkspacePageData = {
  userId: string;
  plan: WorkspacePlan;
  projects: ProjectRow[];
  jobs: JobRow[];
  transcripts: TranscriptRow[];
  favorites: FavoriteRow[];
  sources: SourceRow[];
  workspaceArtifacts: WorkspaceArtifact[];
};

const DEV_PREVIEW_USER_ID = "dev-preview-user";
const SUPABASE_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out while loading workspace data."));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function buildPreviewWorkspacePageData(locale: string): WorkspacePageData {
  const isZh = locale === "zh";
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const projectId = "preview-project";
  const fileJobId = "preview-job-file";
  const liveJobId = "preview-job-live";
  const transcriptId = "preview-transcript-file";

  const projects: ProjectRow[] = [
    {
      id: projectId,
      user_id: DEV_PREVIEW_USER_ID,
      title: isZh ? "Obsidian Core" : "Obsidian Core",
      description: isZh ? "本地预览项目，展示文件模式与实时模式的完整 UI。" : "Local preview project for file and live capture UI.",
      accent_color: "#00dcbf",
      created_at: at(300),
      updated_at: at(8),
    },
  ];

  const jobs: JobRow[] = [
    {
      id: fileJobId,
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      title: isZh ? "Q3 战略对齐会议" : "Q3 Strategy Alignment",
      guest_name: isZh ? "伦敦团队" : "London Hub",
      interviewer_name: "Kemo AI",
      status: "processing",
      error_message: null,
      audio_asset_id: null,
      transcript_id: transcriptId,
      memo_id: null,
      needs_review: false,
      source_type: "upload",
      capture_mode: "file",
      live_transcript_snapshot: null,
      started_at: at(16),
      ended_at: null,
      is_archived: false,
      created_at: at(18),
      updated_at: at(3),
    },
    {
      id: liveJobId,
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      title: isZh ? "实时访谈演示" : "Live Capture Demo",
      guest_name: isZh ? "面对面模式" : "Face-to-face Mode",
      interviewer_name: "Kemo AI",
      status: "processing",
      error_message: null,
      audio_asset_id: null,
      transcript_id: null,
      memo_id: null,
      needs_review: false,
      source_type: "live_capture",
      capture_mode: "live",
      live_transcript_snapshot: isZh
        ? "我们会先从产品发布节奏开始，再回到供应链波动和渠道反馈。"
        : "We will start with the launch cadence, then return to supply chain volatility and channel feedback.",
      started_at: at(42),
      ended_at: null,
      is_archived: false,
      created_at: at(42),
      updated_at: at(2),
    },
  ];

  const transcripts: TranscriptRow[] = [
    {
      id: transcriptId,
      user_id: DEV_PREVIEW_USER_ID,
      job_id: fileJobId,
      transcript_text: isZh
        ? "Speaker 1: 我们第三季度的重点仍然是国际化扩张。\nSpeaker 2: 先从 EMEA 的渠道效率开始，后面再补北美的投放效率。"
        : "Speaker 1: Our Q3 focus is still international expansion.\nSpeaker 2: Start with channel efficiency in EMEA, then revisit North America acquisition later.",
      raw: null,
      created_at: at(14),
    },
  ];

  const sources: SourceRow[] = [
    {
      id: "preview-source-upload",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: fileJobId,
      source_type: "upload",
      title: isZh ? "Q3_Strategy_Session.wav" : "Q3_Strategy_Session.wav",
      url: null,
      domain: null,
      raw_text: null,
      extracted_text: null,
      status: "ready",
      metadata: { sizeLabel: "142.4 MB", durationLabel: "01:42:08" },
      created_at: at(20),
      updated_at: at(18),
    },
    {
      id: "preview-source-url",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: null,
      source_type: "url",
      title: isZh ? "行业播客链接" : "Industry podcast link",
      url: "https://example.com/podcast/obsidian-core",
      domain: "example.com",
      raw_text: null,
      extracted_text: isZh ? "网页与播客内容已抓取，等待整理。" : "Web and podcast content fetched, waiting for synthesis.",
      status: "ready",
      metadata: null,
      created_at: at(55),
      updated_at: at(31),
    },
  ];

  const workspaceArtifacts: WorkspaceArtifact[] = [
    {
      id: "preview-artifact-summary",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: fileJobId,
      kind: "quick_summary",
      title: isZh ? "快速摘要" : "Quick Summary",
      content: isZh
        ? "核心结论：Q3 先聚焦 EMEA 渠道效率，再扩展北美增长动作。"
        : "Key takeaway: focus on EMEA channel efficiency in Q3, then expand North America growth efforts.",
      summary: isZh ? "一屏掌握会议重点。" : "One-screen summary of the session.",
      status: "ready",
      metadata: null,
      audio_url: null,
      is_favorite: true,
      created_at: at(12),
      updated_at: at(6),
    },
    {
      id: "preview-artifact-minutes",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: fileJobId,
      kind: "meeting_minutes",
      title: isZh ? "会议纪要" : "Meeting Minutes",
      content: isZh
        ? "1. 确认 EMEA 作为 Q3 主战场。\n2. 两周内补充北美投放复盘。\n3. 统一对外叙事口径。"
        : "1. Confirm EMEA as the primary Q3 front.\n2. Review North America acquisition within two weeks.\n3. Align the external narrative.",
      summary: isZh ? "结构化会议纪要已整理。" : "Structured meeting minutes prepared.",
      status: "ready",
      metadata: null,
      audio_url: null,
      is_favorite: false,
      created_at: at(10),
      updated_at: at(5),
    },
    {
      id: "preview-artifact-publish",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: fileJobId,
      kind: "publish_script",
      title: isZh ? "发布稿整理" : "Publish Script",
      content: isZh
        ? "第三季度，团队将围绕 EMEA 市场展开更聚焦的渠道优化和品牌叙事升级。"
        : "In Q3, the team will focus on tighter channel optimization and sharper brand narrative in EMEA.",
      summary: isZh ? "可继续润色的主稿草案。" : "A polished draft ready for refinement.",
      status: "draft",
      metadata: null,
      audio_url: null,
      is_favorite: false,
      created_at: at(8),
      updated_at: at(3),
    },
    {
      id: "preview-artifact-followup",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: liveJobId,
      kind: "inspiration_questions",
      title: isZh ? "灵感追问" : "Follow-up Prompts",
      content: isZh
        ? "1. 如果 EMEA 提前达标，北美预算会如何调整？\n2. 团队最担心的供应链变量是什么？"
        : "1. If EMEA reaches target early, how will North America budget shift?\n2. What supply-chain variable worries the team most?",
      summary: isZh ? "建议继续追问的两个方向。" : "Two strong follow-up directions.",
      status: "ready",
      metadata: null,
      audio_url: null,
      is_favorite: true,
      created_at: at(4),
      updated_at: at(2),
    },
  ];

  const favorites: FavoriteRow[] = [
    {
      id: "preview-favorite-summary",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: fileJobId,
      artifact_id: "preview-artifact-summary",
      item_type: "artifact",
      label: isZh ? "快速摘要" : "Quick Summary",
      excerpt: isZh ? "Q3 先聚焦 EMEA 渠道效率。" : "Q3 starts with EMEA channel efficiency.",
      created_at: at(6),
    },
    {
      id: "preview-favorite-live-job",
      user_id: DEV_PREVIEW_USER_ID,
      project_id: projectId,
      job_id: liveJobId,
      artifact_id: null,
      item_type: "job",
      label: isZh ? "实时访谈演示" : "Live Capture Demo",
      excerpt: isZh ? "面对面模式演示任务。" : "Face-to-face capture demo task.",
      created_at: at(3),
    },
  ];

  return {
    userId: DEV_PREVIEW_USER_ID,
    plan: {
      plan: "free",
      maxFileSizeMb: 50,
    },
    projects,
    jobs,
    transcripts,
    favorites,
    sources,
    workspaceArtifacts,
  };
}

export async function loadWorkspacePageData(locale: string): Promise<WorkspacePageData> {
  try {
    const user = await requireUser(locale);
    const supabase = await createSupabaseServerClient();
    const plan = await withTimeout(getUserPlan(supabase, user.id), SUPABASE_TIMEOUT_MS);

    const [{ data: projects }, { data: jobs }, { data: transcripts }, { data: memos }, { data: artifacts }, { data: favorites }, { data: sources }] =
      await withTimeout(
        Promise.all([
          supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
          supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("transcripts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("memos").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("artifacts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("favorites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("sources").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        ]),
        SUPABASE_TIMEOUT_MS
      );

    const projectRows = (projects || []) as ProjectRow[];
    const jobRows = (jobs || []) as JobRow[];
    const transcriptRows = (transcripts || []) as TranscriptRow[];
    const memoRows = (memos || []) as MemoRow[];
    const artifactRows = (artifacts || []) as ArtifactRow[];
    const favoriteRows = (favorites || []) as FavoriteRow[];
    const sourceRows = (sources || []) as SourceRow[];

    const legacyArtifacts: WorkspaceArtifact[] = jobRows.flatMap((job) => {
      const transcript = transcriptRows.find((item) => item.job_id === job.id) || null;
      const memo = memoRows.find((item) => item.job_id === job.id) || null;

      return buildLegacyArtifacts({
        job,
        transcript,
        memo,
      }).map((artifact) => ({
        user_id: user.id,
        project_id: job.project_id,
        job_id: job.id,
        metadata: null,
        audio_url: null,
        is_favorite: false,
        isLegacy: true,
        ...artifact,
      })) as WorkspaceArtifact[];
    });

    return {
      userId: user.id,
      plan,
      projects: projectRows,
      jobs: jobRows,
      transcripts: transcriptRows,
      favorites: favoriteRows,
      sources: sourceRows,
      workspaceArtifacts: [...(artifactRows as WorkspaceArtifact[]), ...legacyArtifacts],
    };
  } catch (error) {
    if (isLocalPreviewEnabled()) {
      console.warn("Falling back to preview workspace data because Supabase is unavailable.", error);
      return buildPreviewWorkspacePageData(locale);
    }

    throw error;
  }
}
