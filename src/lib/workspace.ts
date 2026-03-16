import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const DEFAULT_PROJECT_TITLE = "Kemo Notebook";

export const ARTIFACT_KINDS = [
  "publish_script",
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

export function isArtifactKind(value: string): value is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(value);
}

export function getArtifactLabel(kind: ArtifactKind) {
  const labels: Record<ArtifactKind, string> = {
    publish_script: "发布稿整理",
    quick_summary: "快速摘要",
    key_insights: "关键洞察",
    inspiration_questions: "灵感追问",
    podcast_script: "AI 播客脚本",
    podcast_audio: "AI 播客音频",
    mind_map: "思维导图",
    ppt_outline: "PPT 总结",
    ic_qa: "IC 纪要",
    wechat_article: "公众号长文",
  };

  return labels[kind];
}

export function getArtifactDescription(kind: ArtifactKind) {
  const descriptions: Record<ArtifactKind, string> = {
    publish_script: "按照访谈编辑规范整理成可发布对话稿",
    quick_summary: "让用户快速 catch up 的一屏摘要",
    key_insights: "抽出可行动的判断、观点和信号",
    inspiration_questions: "为下一轮采访提供追问与发散方向",
    podcast_script: "将访谈素材改写为双人播客脚本",
    podcast_audio: "基于播客脚本生成 TTS 音频",
    mind_map: "结构化抽出主线、分支和人物关系",
    ppt_outline: "输出可直接制作为 deck 的章节大纲",
    ic_qa: "面向投资/研究语境的 Q&A 纪要",
    wechat_article: "面向传播的公众号成稿",
  };

  return descriptions[kind];
}

export async function ensureDefaultProject(
  supabase: SupabaseClient<Database>,
  userId: string
) : Promise<ProjectRow> {
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
