import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const DEFAULT_PROJECT_TITLE = "Kemo Notebook";

export const ARTIFACT_KINDS = [
  "publish_script",
  "roadshow_transcript",
  "meeting_minutes",
  "quick_summary",
  "key_insights",
  "inspiration_questions",
  "podcast_script",
  "podcast_audio",
  "mind_map",
  "ppt_outline",
  "ic_qa",
  "wechat_article",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
export type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];
export type FavoriteRow = Database["public"]["Tables"]["favorites"]["Row"];
export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
export type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
export type MemoRow = Database["public"]["Tables"]["memos"]["Row"];
export type WorkspaceArtifact = ArtifactRow & {
  isLegacy?: boolean;
};

export type ProjectSearchResult = {
  id: string;
  kind: "job" | "transcript" | "artifact" | "source";
  title: string;
  snippet: string | null;
  job_id: string | null;
  artifact_id: string | null;
  source_id: string | null;
};

type WorkspaceLocale = "zh" | "en";

const ARTIFACT_LABELS: Record<WorkspaceLocale, Record<ArtifactKind, string>> = {
  zh: {
    publish_script: "发布稿整理",
    roadshow_transcript: "路演整理稿",
    meeting_minutes: "会议纪要",
    quick_summary: "快速摘要",
    key_insights: "关键洞察",
    inspiration_questions: "灵感追问",
    podcast_script: "AI 播客脚本",
    podcast_audio: "AI 播客音频",
    mind_map: "思维导图",
    ppt_outline: "PPT 大纲",
    ic_qa: "IC 纪要",
    wechat_article: "公众号长文"
  },
  en: {
    publish_script: "Publish Script",
    roadshow_transcript: "Roadshow Transcript",
    meeting_minutes: "Meeting Minutes",
    quick_summary: "Quick Summary",
    key_insights: "Key Insights",
    inspiration_questions: "Follow-up Prompts",
    podcast_script: "AI Podcast Script",
    podcast_audio: "AI Podcast Audio",
    mind_map: "Mind Map",
    ppt_outline: "PPT Outline",
    ic_qa: "IC Memo",
    wechat_article: "WeChat Article"
  },
};

const ARTIFACT_DESCRIPTIONS: Record<WorkspaceLocale, Record<ArtifactKind, string>> = {
  zh: {
    publish_script: "按访谈与转写内容整理成可直接发布的成稿。",
    roadshow_transcript: "基于主稿整理成结构清晰的路演材料。",
    meeting_minutes: "自动输出结构化会议纪要。",
    quick_summary: "一屏掌握本轮内容的核心信息。",
    key_insights: "提炼值得行动的观点、判断与信号。",
    inspiration_questions: "为下一轮访谈补充追问方向。",
    podcast_script: "把内容改写成双人播客脚本。",
    podcast_audio: "基于播客脚本生成 TTS 音频。",
    mind_map: "整理主线、分支和人物关系。",
    ppt_outline: "输出可直接展开成 deck 的汇报大纲。",
    ic_qa: "面向投研场景生成 IC Q&A 纪要。",
    wechat_article: "输出适合公众号发布的长文。"
  },
  en: {
    publish_script: "Turn the session into a polished, publish-ready script.",
    roadshow_transcript: "Reshape the script into a structured roadshow transcript.",
    meeting_minutes: "Generate structured meeting minutes automatically.",
    quick_summary: "Get the core takeaways in a single screen.",
    key_insights: "Extract ideas, signals, and judgments worth acting on.",
    inspiration_questions: "Suggest strong follow-up angles for the next interview.",
    podcast_script: "Rewrite the material into a two-host podcast script.",
    podcast_audio: "Generate TTS audio from the podcast script.",
    mind_map: "Map the main threads, branches, and relationships.",
    ppt_outline: "Produce a deck-ready presentation outline.",
    ic_qa: "Generate an investment-committee style memo.",
    wechat_article: "Produce a long-form article for WeChat publishing."
  },
};

export function isArtifactKind(value: string): value is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(value);
}

export function getArtifactLabel(kind: ArtifactKind, locale: WorkspaceLocale = "zh") {
  return ARTIFACT_LABELS[locale][kind];
}

export function getArtifactDescription(kind: ArtifactKind, locale: WorkspaceLocale = "zh") {
  return ARTIFACT_DESCRIPTIONS[locale][kind];
}

export async function ensureDefaultProject(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ProjectRow> {
  const { data: existing } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return existing as ProjectRow;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: DEFAULT_PROJECT_TITLE,
      description: "Interview sources, transcripts, and studio outputs.",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to create default project");
  }

  return data as ProjectRow;
}

export function buildLegacyArtifacts({
  memo,
  transcript,
  job,
}: {
  memo: MemoRow | null;
  transcript: TranscriptRow | null;
  job: JobRow;
}): Array<Partial<ArtifactRow> & { id: string; kind: ArtifactKind }> {
  const artifacts: Array<Partial<ArtifactRow> & { id: string; kind: ArtifactKind }> = [];

  if (transcript?.transcript_text) {
    artifacts.push({
      id: `legacy-transcript-${job.id}`,
      kind: "quick_summary",
      title: "Transcript Snapshot",
      content: transcript.transcript_text,
      summary: transcript.transcript_text.slice(0, 160),
      status: "ready",
      created_at: transcript.created_at,
      updated_at: transcript.created_at,
    });
  }

  if (memo?.ic_qa_text) {
    artifacts.push({
      id: `legacy-ic-${job.id}`,
      kind: "ic_qa",
      title: getArtifactLabel("ic_qa"),
      content: memo.ic_qa_text,
      summary: memo.ic_qa_text.slice(0, 160),
      status: "ready",
      created_at: memo.created_at,
      updated_at: memo.created_at,
    });
  }

  if (memo?.wechat_article_text) {
    artifacts.push({
      id: `legacy-wechat-${job.id}`,
      kind: "wechat_article",
      title: getArtifactLabel("wechat_article"),
      content: memo.wechat_article_text,
      summary: memo.wechat_article_text.slice(0, 160),
      status: "ready",
      created_at: memo.created_at,
      updated_at: memo.created_at,
    });
  }

  return artifacts;
}
