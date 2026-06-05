"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { LiveInterviewPanel } from "@/components/live-interview-panel";
import { KemoMark } from "@/components/kemo-mark";
import { formatLiveQuestionCoachPreview } from "@/lib/live/questionCoachPreview";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlanTier } from "@/lib/billing/plan";
import type {
  ArtifactKind,
  FavoriteRow,
  JobRow,
  ProjectRow,
  SourceRow,
  TermOccurrenceRow,
  TranscriptRow,
  WorkspaceArtifact,
} from "@/lib/workspace";
import {
  SUPPORTED_ARTIFACT_DEFINITIONS,
  getArtifactDefinition,
  type WorkspaceSection,
} from "./notebook-workspace.model";

function LocaleSegmentedControl({ locale }: { locale: string }) {
  const nextPath = (nextLocale: string) => `/${nextLocale}/app/jobs`;

  return (
    <div className="kw-language-segment" aria-label="Language">
      <Link className={locale === "zh" ? "active" : ""} href={nextPath("zh")} aria-current={locale === "zh" ? "true" : undefined}>
        中文
      </Link>
      <Link className={locale === "en" ? "active" : ""} href={nextPath("en")} aria-current={locale === "en" ? "true" : undefined}>
        EN
      </Link>
    </div>
  );
}

const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
const MEDIA_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".mov", ".mkv", ".avi", ".webm"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".srt", ".vtt"]);
const TEXT_PREVIEW_LIMIT = 16000;

const WORKSPACE_COPY = {
  en: {
    workspaceKicker: "Kemo.AI Research Workspace",
    brandSubtitle: "Research Workbench",
    newProject: "New Project",
    navProjects: "Projects",
    navJobs: "Jobs",
    navSources: "Sources",
    navArtifacts: "Artifacts",
    navSettings: "Settings",
    navHelp: "Help",
    navFeedback: "Feedback",
    projectsKicker: "Kemo.AI Research Workbench",
    projectsTitle: "Projects",
    projectsDescription: "Real projects, interview jobs, sources, and generated artifacts from your workspace.",
    readyStatus: "Ready",
    runningStatus: (count: number) => `${count} running`,
    noDescription: "No description yet.",
    jobsLabel: "Jobs",
    sourcesLabel: "Sources",
    artifactsLabel: "Artifacts",
    latestLabel: "Latest",
    noInterviewsYet: "No interviews yet",
    createProjectFirst: "Create a project before importing interviews or sources.",
    sourcePageTitle: "Data Sources",
    sourceName: "Source Name",
    type: "Type",
    lastSync: "Last Sync",
    status: "Status",
    sourceStatusReady: "Ready",
    sourceStatusFailed: "Failed",
    sourceStatusProcessing: "Processing",
    sourceTypeFallback: "Source",
    helpKicker: "Help & Feedback",
    helpTitle: "Help & Documentation",
    helpDescription: "Browse product guidance. Support tickets are disabled until a backend ticket API exists.",
    helpProjectTitle: "Setting up a new Project",
    helpProjectCopy: "Create a project, then import audio, live sessions, URLs, or text sources.",
    helpSourcesTitle: "Data Source Integrations",
    helpSourcesCopy: "Sources are imported through the project sources API and attached to the selected project.",
    helpArtifactsTitle: "Generated Artifacts",
    helpArtifactsCopy: "Artifacts are generated from a ready transcript and saved to the selected job.",
    helpPlanTitle: "Plan Limits",
    helpPlanCopy: (limit: number) => `Your current plan allows single files up to ${limit}MB.`,
    contactSupport: "Contact Support",
    submitFeedback: "Submit Feedback",
    disabled: "Disabled",
    topic: "Topic",
    bugReport: "Bug Report",
    featureRequest: "Feature Request",
    dataSourceInquiry: "Data Source Inquiry",
    description: "Description",
    supportPlaceholder: "Support ticket submission needs POST /api/support/tickets before this can be enabled.",
    submitTicket: "Submit Ticket",
    metaSeparator: " · ",
    startLive: "Start live session",
    recentConversations: "Recent conversations",
    artifacts: "Artifacts",
    liveNotes: "Live notes",
    liveNotesDescription: "Session notes generated from the current live transcript.",
    questionCoach: "Question coach",
    questionCoachDescription: "Follow-up prompts generated from recent transcript context.",
    noArtifacts: "No generated artifacts yet.",
    proCta: "Apply for Pro+",
    liveSession: "Live Session",
    ready: "Ready",
    start: "Start",
    recording: "Recording",
    completed: "Completed",
    paused: "Paused",
    pause: "Pause",
    stop: "Stop",
    liveTranscript: "Live Transcript",
    transcriptEmpty: "Start live capture to see transcript text here.",
    transcriptSpeaker: "Transcript",
    notesTab: "Live notes",
    coachTab: "Coach",
    autoExtraction: "Auto-Extraction",
    syncing: "Syncing",
    extractedNote: "Extracted note",
    featureArtifact: "Generated artifact",
    noLiveNotes: "No live notes have been generated yet.",
    suggestedFollowUps: "Suggested follow-ups based on recent context:",
    noCoachQuestions: "No coach questions have been generated yet.",
    manualNote: "Add manual note...",
    manualNoteSpeaker: "Manual note",
    manualNoteAdded: "Manual note added.",
    record: "Record",
    input: "Input",
    noConversationsTitle: "No conversations yet",
    noConversationsCopy: "Start a live session or import source material to create the first transcript.",
    termAccept: "Accept",
    termEdit: "Edit",
    termReject: "Reject",
    fileLabel: "File",
    formatLabel: "Format",
    sizeLabel: "Size",
    unknownFormat: "unknown",
    archivedFileNote: "The file has been archived as a project source. Text extraction is not available for this format yet.",
    unreadableFileNote: "The file was imported, but no readable text was found.",
    durationMinutes: (minutes: number) => `${minutes} mins`,
  },
  zh: {
    workspaceKicker: "Kemo.AI 研究工作台",
    brandSubtitle: "研究工作台",
    newProject: "新建项目",
    navProjects: "项目",
    navJobs: "任务",
    navSources: "资料来源",
    navArtifacts: "生成成果",
    navSettings: "设置",
    navHelp: "帮助",
    navFeedback: "反馈",
    projectsKicker: "Kemo.AI 研究工作台",
    projectsTitle: "项目",
    projectsDescription: "展示真实项目、访谈任务、资料来源和已生成成果。",
    readyStatus: "就绪",
    runningStatus: (count: number) => `${count} 个处理中`,
    noDescription: "暂无项目说明。",
    jobsLabel: "任务",
    sourcesLabel: "资料",
    artifactsLabel: "成果",
    latestLabel: "最近",
    noInterviewsYet: "暂无访谈",
    createProjectFirst: "请先创建项目，再导入访谈或资料。",
    sourcePageTitle: "资料来源",
    sourceName: "资料名称",
    type: "类型",
    lastSync: "最近同步",
    status: "状态",
    sourceStatusReady: "就绪",
    sourceStatusFailed: "失败",
    sourceStatusProcessing: "处理中",
    sourceTypeFallback: "资料",
    helpKicker: "帮助与反馈",
    helpTitle: "帮助与文档",
    helpDescription: "查看产品使用说明。当前后端尚未提供工单接口，因此反馈提交暂不可用。",
    helpProjectTitle: "创建新项目",
    helpProjectCopy: "先创建项目，再导入音频、实时访谈、URL 或文本资料。",
    helpSourcesTitle: "资料来源接入",
    helpSourcesCopy: "资料通过项目资料接口导入，并绑定到当前项目。",
    helpArtifactsTitle: "生成成果",
    helpArtifactsCopy: "成果基于已完成的转写文本生成，并保存到对应任务。",
    helpPlanTitle: "套餐限制",
    helpPlanCopy: (limit: number) => `当前套餐支持单个文件最大 ${limit}MB。`,
    contactSupport: "联系支持",
    submitFeedback: "提交反馈",
    disabled: "暂不可用",
    topic: "主题",
    bugReport: "问题反馈",
    featureRequest: "功能建议",
    dataSourceInquiry: "资料来源咨询",
    description: "描述",
    supportPlaceholder: "需要新增 POST /api/support/tickets 后才能启用工单提交。",
    submitTicket: "提交工单",
    metaSeparator: " · ",
    startLive: "开始实时访谈",
    recentConversations: "最近访谈",
    artifacts: "成果",
    liveNotes: "实时笔记",
    liveNotesDescription: "根据当前实时转写生成的会话笔记。",
    questionCoach: "追问助手",
    questionCoachDescription: "根据最近转写上下文生成追问建议。",
    noArtifacts: "还没有生成成果。",
    proCta: "申请 Pro+",
    liveSession: "实时访谈",
    ready: "准备就绪",
    start: "开始",
    recording: "录制中",
    completed: "已完成",
    paused: "已暂停",
    pause: "暂停",
    stop: "停止",
    liveTranscript: "实时转写",
    transcriptEmpty: "开始实时采集后，转写内容会显示在这里。",
    transcriptSpeaker: "转写",
    notesTab: "实时笔记",
    coachTab: "追问助手",
    autoExtraction: "自动提取",
    syncing: "同步中",
    extractedNote: "提取笔记",
    featureArtifact: "生成成果",
    noLiveNotes: "还没有生成实时笔记。",
    suggestedFollowUps: "基于最近上下文的建议追问：",
    noCoachQuestions: "还没有生成追问建议。",
    manualNote: "添加手动笔记...",
    manualNoteSpeaker: "手动笔记",
    manualNoteAdded: "手动笔记已添加。",
    record: "录音",
    input: "输入",
    noConversationsTitle: "还没有访谈",
    noConversationsCopy: "开始实时访谈或导入资料后，这里会出现真实转写记录。",
    termAccept: "接受",
    termEdit: "编辑",
    termReject: "拒绝",
    fileLabel: "文件",
    formatLabel: "格式",
    sizeLabel: "大小",
    unknownFormat: "未知",
    archivedFileNote: "该文件已作为项目资料归档，当前格式暂不支持文本提取。",
    unreadableFileNote: "文件已导入，但未读取到可预览文本。",
    durationMinutes: (minutes: number) => `${minutes} 分钟`,
  },
} as const;

function getWorkspaceCopy(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? WORKSPACE_COPY.zh : WORKSPACE_COPY.en;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error?: { message?: string } };

type TermDraft = {
  confirmedText: string;
  action: "accept" | "edit" | "reject";
};

type UploadState = "idle" | "working" | "done" | "error";

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function getJobDurationMinutes(job: JobRow) {
  if (!job.started_at || !job.ended_at) return null;
  const started = new Date(job.started_at).getTime();
  const ended = new Date(job.ended_at).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended) || ended <= started) return null;
  return Math.max(1, Math.round((ended - started) / 60000));
}

function getJobElapsed(job: JobRow | null) {
  if (!job?.started_at) return "00:00:00";
  const started = new Date(job.started_at).getTime();
  const ended = job.ended_at ? new Date(job.ended_at).getTime() : Date.now();
  if (Number.isNaN(started) || Number.isNaN(ended) || ended <= started) return "00:00:00";
  return formatClock((ended - started) / 1000);
}

function getTranscriptBlocks(text: string, fallbackSpeaker: string) {
  const chunks = text
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-8);

  return chunks.map((chunk, index) => {
    const match = chunk.match(/^([^:：]{1,32})[:：]\s*(.+)$/);
    return {
      speaker: match?.[1]?.trim() || fallbackSpeaker,
      text: match?.[2]?.trim() || chunk,
      speakerId: `S${(index % 2) + 1}`,
    };
  });
}

function getArtifactPreview(artifact: WorkspaceArtifact | null | undefined, fallback = "") {
  return artifact?.summary?.trim() || artifact?.content?.trim().slice(0, 220) || fallback;
}

function getArtifactIcon(kind: string) {
  if (kind === "live_meeting_editor" || kind === "meeting_minutes") return "edit_note";
  if (kind === "live_question_coach" || kind === "inspiration_questions") return "psychology";
  if (kind === "quick_summary") return "summarize";
  if (kind === "mind_map") return "account_tree";
  if (kind === "podcast_audio" || kind === "podcast_script") return "graphic_eq";
  return "description";
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, "_").replace(/_+/g, "_");
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function isMediaFile(file: File) {
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || MEDIA_EXTENSIONS.has(getFileExtension(file.name));
}

function isTextLikeFile(file: File) {
  return (
    file.type.startsWith("text/") ||
    file.type.includes("json") ||
    file.type.includes("xml") ||
    file.type.includes("yaml") ||
    TEXT_EXTENSIONS.has(getFileExtension(file.name))
  );
}

async function buildDocumentSourceText(file: File, copy: ReturnType<typeof getWorkspaceCopy>) {
  const summary = [
    `${copy.fileLabel}: ${file.name}`,
    `${copy.formatLabel}: ${file.type || getFileExtension(file.name) || copy.unknownFormat}`,
    `${copy.sizeLabel}: ${formatFileSize(file.size)}`,
  ].join("\n");
  if (!isTextLikeFile(file)) {
    return `${summary}\n\n${copy.archivedFileNote}`;
  }

  const text = (await file.text().catch(() => "")).replace(/\u0000/g, "").trim();
  return text ? `${summary}\n\n${text.slice(0, TEXT_PREVIEW_LIMIT)}` : `${summary}\n\n${copy.unreadableFileNote}`;
}

async function readApi<T>(response: Response) {
  const json = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!response.ok || !json) {
    throw new Error(response.statusText || "Request failed");
  }
  if (!json.ok) {
    throw new Error(json.error?.message || response.statusText || "Request failed");
  }
  return json.data;
}

function getJobTitle(job: JobRow | null, transcriptText = "", fallbackTitle: string, overviewTitle: string) {
  if (!job) return overviewTitle;
  const explicitTitle = job.title?.trim();
  if (explicitTitle) return explicitTitle;
  const fallback = transcriptText.replace(/\s+/g, " ").trim();
  if (fallback) return `${fallback.slice(0, 42)}${fallback.length > 42 ? "..." : ""}`;
  return fallbackTitle;
}

function getStatusTone(status: string | null | undefined) {
  if (status === "completed") return "ready";
  if (status === "failed") return "error";
  if (status === "needs_review") return "review";
  if (status === "queued" || status === "transcribing" || status === "summarizing" || status === "extracting_terms") return "running";
  return "idle";
}

function formatSourceStatus(status: string | null | undefined, copy: ReturnType<typeof getWorkspaceCopy>) {
  if (!status || status === "ready") return copy.sourceStatusReady;
  if (status === "failed") return copy.sourceStatusFailed;
  if (status === "processing" || status === "extracting") return copy.sourceStatusProcessing;
  return status;
}

function getArtifactText(artifact: WorkspaceArtifact | null) {
  return artifact?.content?.trim() || artifact?.summary?.trim() || "";
}

function getCoachCardTitle(artifact: WorkspaceArtifact, title: string) {
  if (artifact.kind !== "live_question_coach") return artifact.title;
  return title;
}

function getDisplayArtifactTitle(artifact: WorkspaceArtifact, fallbackTitle: string) {
  if (artifact.kind === "legacy") return artifact.title;
  return fallbackTitle;
}

function getDisplayArtifactText(artifact: WorkspaceArtifact, liveCoachPending: string) {
  if (artifact.kind === "live_question_coach") return formatLiveQuestionCoachPreview(artifact, liveCoachPending);
  return getArtifactText(artifact);
}

function getDisplayArtifactSummary(artifact: WorkspaceArtifact, liveCoachPending: string, description: string) {
  if (artifact.kind === "live_question_coach") return formatLiveQuestionCoachPreview(artifact, liveCoachPending);
  return artifact.summary?.trim() || getArtifactText(artifact).slice(0, 180) || description;
}

function getDownloadPath(artifact: WorkspaceArtifact) {
  if (artifact.isLegacy) return null;
  return `/api/artifacts/${artifact.id}/download`;
}

function getFavoriteUserId(favorites: FavoriteRow[], projects: ProjectRow[], jobs: JobRow[]) {
  return favorites[0]?.user_id || projects[0]?.user_id || jobs[0]?.user_id || "";
}

export function NotebookWorkspace({
  locale,
  plan,
  projects,
  jobs,
  transcripts,
  artifacts,
  favorites,
  sources,
  termOccurrences = [],
  initialJobId = null,
  initialNewInterviewOpen = false,
}: {
  locale: string;
  plan: { plan: PlanTier; maxFileSizeMb: number };
  projects: ProjectRow[];
  jobs: JobRow[];
  transcripts: TranscriptRow[];
  artifacts: WorkspaceArtifact[];
  favorites: FavoriteRow[];
  sources: SourceRow[];
  termOccurrences?: TermOccurrenceRow[];
  initialJobId?: string | null;
  initialNewInterviewOpen?: boolean;
}) {
  const t = useTranslations();
  const copy = getWorkspaceCopy(locale);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialJob = initialJobId ? jobs.find((job) => job.id === initialJobId) || null : null;
  const initialProjectId = initialJob?.project_id || projects[0]?.id || null;

  const [projectState, setProjectState] = useState(projects);
  const [jobState, setJobState] = useState(jobs);
  const [artifactState, setArtifactState] = useState(artifacts);
  const [favoriteState, setFavoriteState] = useState(favorites);
  const [sourceState, setSourceState] = useState(sources);
  const [termState, setTermState] = useState(termOccurrences);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJob?.id || null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(initialNewInterviewOpen ? "live" : initialJob ? "jobs" : "projects");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [pendingArtifacts, setPendingArtifacts] = useState<string[]>([]);
  const [termDrafts, setTermDrafts] = useState<Record<string, TermDraft>>({});
  const [isSavingTerms, setIsSavingTerms] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState(false);
  const [jobTitleDraft, setJobTitleDraft] = useState("");
  const [liveTranscriptSnapshot, setLiveTranscriptSnapshot] = useState("");
  const [liveCaptureStatus, setLiveCaptureStatus] = useState(t("workspace.live.ready"));
  const [liveRuntimeState, setLiveRuntimeState] = useState<{ isRunning: boolean; pendingAction: "starting" | "stopping" | "pausing" | null; elapsedSeconds: number }>({
    isRunning: false,
    pendingAction: null,
    elapsedSeconds: 0,
  });
  const [manualNoteDraft, setManualNoteDraft] = useState("");

  useEffect(() => setProjectState(projects), [projects]);
  useEffect(() => setJobState(jobs), [jobs]);
  useEffect(() => setArtifactState(artifacts), [artifacts]);
  useEffect(() => setFavoriteState(favorites), [favorites]);
  useEffect(() => setSourceState(sources), [sources]);
  useEffect(() => setTermState(termOccurrences), [termOccurrences]);

  const userId = getFavoriteUserId(favoriteState, projectState, jobState);

  useEffect(() => {
    if (!userId) return;
    let unsubscribed = false;
    let timeout: number | null = null;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`workspace-jobs:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` }, () => {
        if (unsubscribed) return;
        if (timeout) window.clearTimeout(timeout);
        timeout = window.setTimeout(() => router.refresh(), 500);
      })
      .subscribe();

    return () => {
      unsubscribed = true;
      if (timeout) window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  const jobsByProject = useMemo(() => {
    const grouped = new Map<string, JobRow[]>();
    for (const project of projectState) {
      grouped.set(
        project.id,
        jobState
          .filter((job) => job.project_id === project.id)
          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      );
    }
    return grouped;
  }, [jobState, projectState]);

  const selectedProject = projectState.find((project) => project.id === selectedProjectId) || null;
  const selectedProjectJobs = selectedProjectId ? jobsByProject.get(selectedProjectId) || [] : [];
  const selectedJob = selectedJobId ? jobState.find((job) => job.id === selectedJobId) || null : null;
  const transcript = selectedJob ? transcripts.find((item) => item.job_id === selectedJob.id) || null : null;
  const transcriptText = selectedJob?.capture_mode === "live"
    ? liveTranscriptSnapshot || selectedJob.live_transcript_snapshot || transcript?.transcript_text || ""
    : selectedJob
      ? transcript?.transcript_text || selectedJob.live_transcript_snapshot || ""
      : liveTranscriptSnapshot;
  const selectedArtifacts = useMemo(
    () =>
      artifactState
        .filter((artifact) => artifact.job_id === selectedJob?.id)
        .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime()),
    [artifactState, selectedJob?.id]
  );
  const projectArtifacts = useMemo(
    () => artifactState.filter((artifact) => !selectedProjectId || artifact.project_id === selectedProjectId),
    [artifactState, selectedProjectId]
  );
  const projectSources = useMemo(
    () => sourceState.filter((source) => source.project_id === selectedProjectId),
    [selectedProjectId, sourceState]
  );
  const selectedSource = selectedSourceId ? sourceState.find((source) => source.id === selectedSourceId) || null : null;
  const previewArtifact = previewArtifactId ? artifactState.find((artifact) => artifact.id === previewArtifactId) || null : null;
  const pendingTerms = useMemo(
    () => termState.filter((term) => term.job_id === selectedJob?.id && term.status === "pending"),
    [selectedJob?.id, termState]
  );
  const favoriteArtifactIds = useMemo(() => new Set(favoriteState.map((favorite) => favorite.artifact_id).filter(Boolean) as string[]), [favoriteState]);
  const favoriteJobIds = useMemo(
    () => new Set(favoriteState.filter((favorite) => favorite.job_id && !favorite.artifact_id).map((favorite) => favorite.job_id) as string[]),
    [favoriteState]
  );
  const projectFavoriteItems = useMemo(
    () => favoriteState.filter((favorite) => !selectedProjectId || favorite.project_id === selectedProjectId),
    [favoriteState, selectedProjectId]
  );

  const currentTitle = selectedJob
    ? getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title"))
    : selectedProject?.title || t("workspace.overview.title");

  const statusLabel = useCallback((status: string | null | undefined) => {
    const key = status || "unknown";
    if (["pending", "queued", "transcribing", "extracting_terms", "needs_review", "summarizing", "completed", "failed"].includes(key)) {
      return t(`workspace.status.${key}`);
    }
    return status || t("workspace.status.unknown");
  }, [t]);

  const artifactLabel = useCallback((kind: string) => t(`workspace.artifacts.kind.${kind}.label`), [t]);
  const artifactShortLabel = useCallback((kind: string) => t(`workspace.artifacts.kind.${kind}.short`), [t]);
  const artifactDescription = useCallback((kind: string) => t(`workspace.artifacts.kind.${kind}.description`), [t]);

  useEffect(() => {
    if (!selectedProjectId && projectState[0]) {
      setSelectedProjectId(projectState[0].id);
    }
  }, [projectState, selectedProjectId]);

  useEffect(() => {
    if (!selectedJob) {
      setJobTitleDraft("");
      setEditingJobTitle(false);
      return;
    }
    if (editingJobTitle) {
      return;
    }
    setJobTitleDraft(getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")));
  }, [editingJobTitle, selectedJob?.id, selectedJob, transcriptText, t]);

  useEffect(() => {
    if (!pendingTerms.length) return;
    setTermDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const term of pendingTerms) {
        if (!next[term.id]) {
          next[term.id] = { confirmedText: term.term_text, action: "accept" };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [pendingTerms]);

  function selectJob(job: JobRow) {
    setSelectedProjectId(job.project_id);
    setSelectedJobId(job.id);
    setSelectedSourceId(null);
    setEditingJobTitle(false);
    setActiveSection("jobs");
  }

  function selectSource(source: SourceRow) {
    setSelectedProjectId(source.project_id);
    setSelectedSourceId(source.id);
    if (source.job_id) setSelectedJobId(source.job_id);
    setActiveSection("sources");
  }

  function clearNewInterviewQuery() {
    if (!initialNewInterviewOpen || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("new") !== "1") {
      return;
    }

    url.searchParams.delete("new");
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }

  function closeCaptureDialog() {
    setCaptureDialogOpen(false);
    clearNewInterviewQuery();
  }

  async function ensureProjectForCapture() {
    if (selectedProjectId) return selectedProjectId;

    setIsCreatingProject(true);
    setError(null);
    try {
      const data = await readApi<{ project: ProjectRow }>(
        await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      setProjectState((previous) => [data.project, ...previous.filter((project) => project.id !== data.project.id)]);
      setSelectedProjectId(data.project.id);
      setSelectedJobId(null);
      return data.project.id;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.createProjectFailed"));
      return null;
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function chooseLiveCapture() {
    const projectId = await ensureProjectForCapture();
    if (!projectId) return;
    setActiveSection("live");
    closeCaptureDialog();
  }

  function chooseUrlCapture() {
    setActiveSection("sources");
    closeCaptureDialog();
  }

  async function createProject() {
    const title = newProjectTitle.trim();
    if (!title) {
      setError(t("workspace.errors.projectTitleRequired"));
      return;
    }

    setIsCreatingProject(true);
    setError(null);
    try {
      const data = await readApi<{ project: ProjectRow }>(
        await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: newProjectDescription.trim() || null }),
        })
      );
      setProjectState((previous) => [data.project, ...previous.filter((project) => project.id !== data.project.id)]);
      setSelectedProjectId(data.project.id);
      setSelectedJobId(null);
      setProjectDialogOpen(false);
      setNewProjectTitle("");
      setNewProjectDescription("");
      setFeedback(t("workspace.feedback.projectCreated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.createProjectFailed"));
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function saveJobTitle() {
    if (!selectedJob) return;
    return saveJobTitleFor(selectedJob, jobTitleDraft, () => setEditingJobTitle(false));
  }

  async function saveJobTitleFor(job: JobRow, draftTitle: string, onSaved?: (job: JobRow) => void) {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setError(t("workspace.errors.titleRequired"));
      return;
    }

    try {
      const data = await readApi<{ job: JobRow }>(
        await fetch(`/api/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        })
      );
      setJobState((previous) => previous.map((job) => (job.id === data.job.id ? data.job : job)));
      onSaved?.(data.job);
      setFeedback(t("workspace.feedback.titleUpdated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.updateTitleFailed"));
    }
  }

  async function deleteJob(job: JobRow) {
    if (!window.confirm(t("workspace.confirm.deleteJob", { title: getJobTitle(job, "", t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")) }))) return;
    try {
      await readApi<{ removed: boolean }>(await fetch(`/api/jobs/${job.id}`, { method: "DELETE" }));
      setJobState((previous) => previous.filter((item) => item.id !== job.id));
      setArtifactState((previous) => previous.filter((item) => item.job_id !== job.id));
      setSourceState((previous) => previous.filter((item) => item.job_id !== job.id));
      setFavoriteState((previous) => previous.filter((item) => item.job_id !== job.id));
      setTermState((previous) => previous.filter((item) => item.job_id !== job.id));
      if (selectedJobId === job.id) setSelectedJobId(null);
      setFeedback(t("workspace.feedback.interviewDeleted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.deleteInterviewFailed"));
    }
  }

  async function runJob(job: JobRow) {
    setFeedback(t("workspace.feedback.jobQueued"));
    try {
      await readApi<{ queued: boolean }>(await fetch(`/api/jobs/${job.id}/run`, { method: "POST" }));
      setJobState((previous) => previous.map((item) => (item.id === job.id ? { ...item, status: "queued" } : item)));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.queueJobFailed"));
    }
  }

  function mergeArtifact(artifact: WorkspaceArtifact) {
    setArtifactState((previous) => [artifact, ...previous.filter((item) => item.id !== artifact.id)]);
  }

  async function generateArtifact(kind: ArtifactKind) {
    if (!selectedJob) return;
    if (!transcriptText.trim()) {
      setError(t("workspace.errors.transcriptNotReady"));
      return;
    }

    setPendingArtifacts((previous) => [...new Set([...previous, kind])]);
    setFeedback(t("workspace.feedback.artifactGenerating", { artifact: artifactLabel(kind) }));
    try {
      const data = await readApi<{ artifact: WorkspaceArtifact }>(
        await fetch(`/api/jobs/${selectedJob.id}/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, transcriptText }),
        })
      );
      mergeArtifact(data.artifact);
      setPreviewArtifactId(data.artifact.id);
      setFeedback(t("workspace.feedback.artifactUpdated", { artifact: artifactLabel(kind) }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.artifactGenerationFailed"));
    } finally {
      setPendingArtifacts((previous) => previous.filter((item) => item !== kind));
    }
  }

  async function generateCoreArtifacts() {
    for (const kind of ["quick_summary", "inspiration_questions", "publish_script"] as ArtifactKind[]) {
      await generateArtifact(kind);
    }
  }

  async function toggleArtifactFavorite(artifact: WorkspaceArtifact) {
    if (artifact.isLegacy) {
      setError(t("workspace.errors.legacyFavorite"));
      return;
    }

    const isFavorite = favoriteArtifactIds.has(artifact.id);
    const previous = favoriteState;
    if (isFavorite) {
      setFavoriteState((items) => items.filter((favorite) => favorite.artifact_id !== artifact.id));
    }

    try {
      if (isFavorite) {
        await readApi<{ removed: boolean }>(await fetch(`/api/favorites?artifactId=${artifact.id}`, { method: "DELETE" }));
        return;
      }

      const data = await readApi<{ favorite: FavoriteRow }>(
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactId: artifact.id,
            projectId: artifact.project_id,
            jobId: artifact.job_id,
            itemType: "artifact",
            label: getCoachCardTitle(artifact, t("workspace.live.questionCoachDraftTitle")),
            excerpt: getDisplayArtifactSummary(artifact, t("workspace.live.questionCoachPending"), artifactDescription(artifact.kind)),
          }),
        })
      );
      setFavoriteState((items) => [data.favorite, ...items.filter((favorite) => favorite.artifact_id !== artifact.id)]);
    } catch (caught) {
      setFavoriteState(previous);
      setError(caught instanceof Error ? caught.message : t("workspace.errors.favoriteUpdateFailed"));
    }
  }

  async function toggleJobFavorite(job: JobRow) {
    const isFavorite = favoriteJobIds.has(job.id);
    const previous = favoriteState;
    if (isFavorite) {
      setFavoriteState((items) => items.filter((favorite) => !(favorite.job_id === job.id && !favorite.artifact_id)));
    }

    try {
      if (isFavorite) {
        await readApi<{ removed: boolean }>(await fetch(`/api/favorites?jobId=${job.id}`, { method: "DELETE" }));
        return;
      }

      const relatedTranscript = transcripts.find((item) => item.job_id === job.id)?.transcript_text || job.live_transcript_snapshot || "";
      const data = await readApi<{ favorite: FavoriteRow }>(
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: job.project_id,
            jobId: job.id,
            itemType: "job",
            label: getJobTitle(job, relatedTranscript, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")),
            excerpt: relatedTranscript.replace(/\s+/g, " ").slice(0, 180) || null,
          }),
        })
      );
      setFavoriteState((items) => [data.favorite, ...items.filter((favorite) => !(favorite.job_id === job.id && !favorite.artifact_id))]);
    } catch (caught) {
      setFavoriteState(previous);
      setError(caught instanceof Error ? caught.message : t("workspace.errors.favoriteUpdateFailed"));
    }
  }

  async function submitTermReview() {
    if (!selectedJob || !pendingTerms.length) return;

    setIsSavingTerms(true);
    setError(null);
    try {
      await readApi<{ ok: boolean }>(
        await fetch(`/api/jobs/${selectedJob.id}/confirm-terms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            terms: pendingTerms.map((term) => {
              const draft = termDrafts[term.id] || { confirmedText: term.term_text, action: "accept" as const };
              return {
                id: term.id,
                termText: term.term_text,
                confirmedText: draft.confirmedText,
                action: draft.action,
                context: term.context || undefined,
              };
            }),
          }),
        })
      );
      setTermState((previous) => previous.map((term) => (term.job_id === selectedJob.id && term.status === "pending" ? { ...term, status: "confirmed" } : term)));
      setJobState((previous) => previous.map((job) => (job.id === selectedJob.id ? { ...job, status: "queued", needs_review: false } : job)));
      setFeedback(t("workspace.feedback.termsConfirmed"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.confirmTermsFailed"));
    } finally {
      setIsSavingTerms(false);
    }
  }

  async function importUrlSource() {
    if (!selectedProjectId) {
      setProjectDialogOpen(true);
      return;
    }
    if (!sourceUrl.trim()) {
      setError(t("workspace.errors.urlRequired"));
      return;
    }

    setUploadState("working");
    setError(null);
    try {
      const data = await readApi<{ source: SourceRow }>(
        await fetch(`/api/projects/${selectedProjectId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: sourceUrl.trim(),
            title: sourceTitle.trim() || null,
            sourceType: "url_import",
            jobId: selectedJob?.id || null,
          }),
        })
      );
      setSourceState((previous) => [data.source, ...previous.filter((source) => source.id !== data.source.id)]);
      setSelectedSourceId(data.source.id);
      setActiveSection("sources");
      setSourceUrl("");
      setSourceTitle("");
      setUploadState("done");
      setFeedback(t("workspace.feedback.sourceImported"));
    } catch (caught) {
      setUploadState("error");
      setError(caught instanceof Error ? caught.message : t("workspace.errors.sourceImportFailed"));
    }
  }

  async function handleFileUpload(file: File) {
    if (!selectedProjectId) {
      setProjectDialogOpen(true);
      return;
    }

    if (file.size > plan.maxFileSizeMb * 1024 * 1024) {
      setError(t("workspace.errors.fileLimit", { limit: plan.maxFileSizeMb, plan: plan.plan }));
      return;
    }

    setUploadState("working");
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("workspace.errors.notAuthenticated"));

      const safeFileName = sanitizeFileName(file.name);
      const storagePath = `${user.id}/uploads/${crypto.randomUUID()}-${safeFileName}`;
      const mimeType = file.type || "application/octet-stream";

      const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw new Error(t("workspace.errors.uploadFailed"));

      if (isMediaFile(file)) {
        const data = await readApi<{ jobId: string; job: JobRow }>(
          await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: file.name,
              projectId: selectedProjectId,
              sourceType: mimeType.startsWith("video/") ? "video_upload" : "audio_upload",
              captureMode: "upload",
              storagePath,
              fileName: file.name,
              fileSize: file.size,
              mimeType,
            }),
          })
        );
        setJobState((previous) => [data.job, ...previous.filter((job) => job.id !== data.job.id)]);
        setSelectedJobId(data.job.id);
        setActiveSection("jobs");
        await fetch(`/api/jobs/${data.jobId}/run`, { method: "POST" }).catch(() => null);
        setFeedback(t("workspace.feedback.interviewUploaded"));
      } else {
        const documentText = await buildDocumentSourceText(file, copy);
        const data = await readApi<{ source: SourceRow }>(
          await fetch(`/api/projects/${selectedProjectId}/sources`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: file.name,
              sourceType: "file_upload",
              rawText: documentText,
              extractedText: documentText,
              metadata: { storage_path: storagePath, file_name: file.name, file_size: file.size, mime_type: mimeType },
            }),
          })
        );
        setSourceState((previous) => [data.source, ...previous.filter((source) => source.id !== data.source.id)]);
        setSelectedSourceId(data.source.id);
        setActiveSection("sources");
        setFeedback(t("workspace.feedback.sourceImported"));
      }

      setUploadState("done");
      setCaptureDialogOpen(false);
    } catch (caught) {
      setUploadState("error");
      setError(caught instanceof Error ? caught.message : t("workspace.errors.uploadFailed"));
    }
  }

  const ensureLiveJob = useCallback(async () => {
    if (!selectedProjectId) {
      setProjectDialogOpen(true);
      return { jobId: null, statusText: t("workspace.errors.createProjectFirst") };
    }

    const reusableJob =
      selectedJob &&
      selectedJob.project_id === selectedProjectId &&
      selectedJob.capture_mode === "live" &&
      !["completed", "failed"].includes(selectedJob.status || "")
        ? selectedJob
        : null;

    if (reusableJob) {
      return { jobId: reusableJob.id, statusText: t("workspace.live.jobReady") };
    }

    try {
      const data = await readApi<{ jobId: string; job: JobRow }>(
        await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${t("workspace.live.defaultTitle")} ${new Date().toLocaleString(locale, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
            projectId: selectedProjectId,
            sourceType: "live_capture",
            captureMode: "live",
          }),
        })
      );
      setJobState((previous) => [data.job, ...previous.filter((job) => job.id !== data.job.id)]);
      setSelectedJobId(data.job.id);
      return { jobId: data.jobId, statusText: t("workspace.live.jobCreated") };
    } catch (caught) {
      return { jobId: null, statusText: caught instanceof Error ? caught.message : t("workspace.errors.createLiveJobFailed") };
    }
  }, [locale, selectedJob, selectedProjectId, t]);

  function handleLiveFinalized(payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string; statusText: string }) {
    if (payload.job) {
      const job = payload.job as JobRow;
      setJobState((previous) => [job, ...previous.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id);
    }
    if (Array.isArray(payload.draftArtifacts)) {
      for (const artifact of payload.draftArtifacts as WorkspaceArtifact[]) {
        mergeArtifact(artifact);
      }
    }
    setLiveTranscriptSnapshot(payload.transcriptText);
    setLiveCaptureStatus(payload.statusText);
    setFeedback(t("workspace.feedback.liveSaved"));
  }

  function handleLiveDraftSynced(payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string }) {
    if (payload.job) {
      const job = payload.job as JobRow;
      setJobState((previous) => [job, ...previous.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id);
    }
    if (Array.isArray(payload.draftArtifacts)) {
      for (const artifact of payload.draftArtifacts as WorkspaceArtifact[]) {
        mergeArtifact(artifact);
      }
    }
    setLiveTranscriptSnapshot(payload.transcriptText);
  }

  async function copyArtifact(artifact: WorkspaceArtifact) {
    const text = getDisplayArtifactText(artifact, t("workspace.live.questionCoachPending"));
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => null);
    setFeedback(t("workspace.feedback.artifactCopied"));
  }

  function triggerLivePanelAction(action: "start" | "pause" | "stop") {
    const control = document.querySelector<HTMLButtonElement>(`[data-kemo-live-action="${action}"]`);
    if (!control || control.disabled) return false;
    control.click();
    return true;
  }

  function handlePrimaryLiveControl() {
    if (liveRuntimeState.isRunning) {
      triggerLivePanelAction("pause");
      return;
    }
    triggerLivePanelAction("start");
  }

  function handleStopLiveControl() {
    if (liveRuntimeState.isRunning || liveRuntimeState.pendingAction) {
      if (triggerLivePanelAction("stop")) return;
    }
    setActiveSection("jobs");
  }

  function submitManualNote() {
    const note = manualNoteDraft.trim();
    if (!note) return;
    setLiveTranscriptSnapshot((current) => {
      const prefix = current.trim() ? `${current.trim()}\n` : "";
      return `${prefix}${copy.manualNoteSpeaker}: ${note}`;
    });
    setManualNoteDraft("");
    setFeedback(copy.manualNoteAdded);
  }

  function renderJobs() {
    if (selectedJob) {
      return <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto w-full"><div className="kw-content">{renderJobDetail()}</div></section>;
    }

    const recentRows = selectedProjectJobs.slice(0, 3).map((job, index) => {
      const jobTranscript = transcripts.find((item) => item.job_id === job.id)?.transcript_text || job.live_transcript_snapshot || "";
      const running = ["queued", "transcribing", "summarizing", "extracting_terms"].includes(job.status || "");
      const duration = getJobDurationMinutes(job);
      return {
        job,
        title: getJobTitle(job, jobTranscript, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")),
        meta: [formatDate(job.created_at, locale), duration ? copy.durationMinutes(duration) : null].filter(Boolean).join(copy.metaSeparator),
        icon: job.capture_mode === "live" ? "mic" : index === 1 ? "group" : "person",
        status: running ? statusLabel("transcribing") : statusLabel(job.status),
        running,
      };
    });

    return (
      <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col gap-stack-lg max-w-container-max mx-auto w-full border-r border-outline-variant md:border-transparent">
        <header className="flex flex-col gap-unit">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{copy.workspaceKicker}</p>
          <div className="flex justify-between items-end gap-stack-md">
            <h1 className="font-display-lg text-display-lg text-primary">{selectedProject?.title || t("workspace.overview.title")}</h1>
            <button className="bg-primary text-on-primary font-body-md text-body-md px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-surface-tint transition-colors" type="button" onClick={chooseLiveCapture}>
              <span className="material-symbols-outlined text-sm">play_arrow</span>
              {copy.startLive}
            </button>
          </div>
        </header>
        <div className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">{copy.recentConversations}</h2>
          {recentRows.length ? recentRows.map((row, index) => (
            <div
              className={`group flex items-center justify-between p-stack-md rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors bg-surface-container-lowest cursor-pointer ${row.running ? "opacity-70" : ""}`}
              key={`${row.title}-${index}`}
              onClick={() => selectJob(row.job)}
            >
              <div className="flex items-center gap-stack-md">
                <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined">{row.icon}</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md font-medium text-primary">{row.title}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">{row.meta}</span>
                </div>
              </div>
              <div className="flex items-center gap-stack-md">
                <span className={`px-2 py-1 rounded font-label-sm text-label-sm ${row.running ? "bg-surface-container text-on-surface-variant flex items-center gap-1" : "bg-surface-container-high text-on-primary-fixed-variant"}`}>
                  {row.running ? <span className="material-symbols-outlined text-[14px] animate-spin">sync</span> : null}
                  {row.status}
                </span>
                <button className="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity" type="button">
                  <span className="material-symbols-outlined">more_vert</span>
                </button>
              </div>
            </div>
          )) : <EmptyState title={copy.noConversationsTitle} copy={copy.noConversationsCopy} action={copy.startLive} onAction={chooseLiveCapture} />}
        </div>
      </section>
    );
  }

  function renderProjects() {
    const projectCards = projectState.map((project) => {
      const projectJobs = jobsByProject.get(project.id) || [];
      const projectSourceCount = sourceState.filter((source) => source.project_id === project.id).length;
      const projectArtifactCount = artifactState.filter((artifact) => artifact.project_id === project.id).length;
      const runningCount = projectJobs.filter((job) => ["queued", "transcribing", "extracting_terms", "summarizing"].includes(job.status || "")).length;
      const latestJob = projectJobs[0] || null;
      return { project, projectJobs, projectSourceCount, projectArtifactCount, runningCount, latestJob };
    });

    return (
      <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg flex flex-col gap-stack-lg max-w-container-max mx-auto w-full">
        <header className="flex flex-col gap-unit">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{copy.projectsKicker}</p>
          <div className="flex justify-between items-end gap-stack-md">
            <div>
              <h1 className="font-display-lg text-display-lg text-primary">{copy.projectsTitle}</h1>
              <p className="text-on-surface-variant">{copy.projectsDescription}</p>
            </div>
            <button className="bg-primary text-on-primary font-body-md text-body-md px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-surface-tint transition-colors" type="button" onClick={() => setProjectDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              {copy.newProject}
            </button>
          </div>
        </header>

        {projectCards.length ? (
          <div className="kw-project-card-grid">
            {projectCards.map(({ project, projectJobs, projectSourceCount, projectArtifactCount, runningCount, latestJob }) => (
              <button
                className={`kw-project-card ${selectedProjectId === project.id ? "active" : ""}`}
                key={project.id}
                type="button"
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedJobId(null);
                  setSelectedSourceId(null);
                  setActiveSection("jobs");
                }}
              >
                <div className="kw-project-card-head">
                  <div>
                    <span className="kw-kicker">{formatDate(project.updated_at || project.created_at, locale)}</span>
                    <h2>{project.title || "Untitled project"}</h2>
                  </div>
                  {runningCount ? <span className="kw-status-pill running">{copy.runningStatus(runningCount)}</span> : <span className="kw-status-pill ready">{copy.readyStatus}</span>}
                </div>
                <p>{project.description || copy.noDescription}</p>
                <dl className="kw-project-card-stats">
                  <div><dt>{copy.jobsLabel}</dt><dd>{projectJobs.length}</dd></div>
                  <div><dt>{copy.sourcesLabel}</dt><dd>{projectSourceCount}</dd></div>
                  <div><dt>{copy.artifactsLabel}</dt><dd>{projectArtifactCount}</dd></div>
                </dl>
                <small>{latestJob ? `${copy.latestLabel}: ${getJobTitle(latestJob, transcripts.find((item) => item.job_id === latestJob.id)?.transcript_text || latestJob.live_transcript_snapshot || "", t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title"))}` : copy.noInterviewsYet}</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={t("workspace.empty.noProjects")} copy={copy.createProjectFirst} action={copy.newProject} onAction={() => setProjectDialogOpen(true)} />
        )}
      </section>
    );
  }

  function renderJobDetail() {
    if (!selectedJob) return null;
    const isPendingRun = ["pending", "failed"].includes(selectedJob.status);
    const canGenerate = Boolean(transcriptText.trim());

    return (
      <div className="kw-page-stack">
        <div className="kw-job-hero">
          <div className="kw-breadcrumbs">
            <button type="button" onClick={() => setSelectedJobId(null)}>{t("workspace.nav.workspace")}</button>
            <ChevronRight />
            <span>{selectedProject?.title || t("workspace.context.project")}</span>
          </div>
          <div className="kw-job-title-row">
            <div>
              {editingJobTitle ? (
                <div className="kw-title-edit">
                  <input value={jobTitleDraft} onChange={(event) => setJobTitleDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveJobTitle()} />
                  <button type="button" className="kw-button primary" onClick={() => void saveJobTitle()}>{t("common.save")}</button>
                  <button type="button" className="kw-button ghost" onClick={() => setEditingJobTitle(false)}>{t("common.cancel")}</button>
                </div>
              ) : (
                <h1>{currentTitle}</h1>
              )}
              <p>{selectedJob.guest_name || selectedJob.source_type || t("workspace.fallbacks.interviewRecord")} 路 {formatDate(selectedJob.created_at, locale)}</p>
            </div>
            <div className="kw-action-row">
              <StatusPill status={selectedJob.status} label={statusLabel(selectedJob.status)} />
              <button type="button" className="kw-icon-button" title={t("workspace.actions.rename")} onClick={() => setEditingJobTitle(true)}><Pencil /></button>
              <button type="button" className={`kw-icon-button ${favoriteJobIds.has(selectedJob.id) ? "active" : ""}`} title={t("workspace.actions.favorite")} onClick={() => void toggleJobFavorite(selectedJob)}><Star /></button>
              <button type="button" className="kw-icon-button danger" title={t("workspace.actions.delete")} onClick={() => void deleteJob(selectedJob)}><Trash2 /></button>
            </div>
          </div>
        </div>

        {selectedJob.error_message ? <div className="kw-alert error">{selectedJob.error_message}</div> : null}

        {pendingTerms.length ? renderTermReview() : null}

        <section className="kw-split">
          <div className="kw-card kw-transcript-card">
            <div className="kw-card-head">
              <div>
                <p className="kw-kicker">{t("workspace.transcript.kicker")}</p>
                <h2>{transcriptText ? t("workspace.transcript.readyTitle") : t("workspace.transcript.waitingTitle")}</h2>
              </div>
              {isPendingRun ? (
                <button type="button" className="kw-button secondary" onClick={() => void runJob(selectedJob)}>
                  <RefreshCw /> {t("workspace.actions.queue")}
                </button>
              ) : null}
            </div>
            {transcriptText ? (
              <pre className="kw-transcript">{transcriptText}</pre>
            ) : (
              <EmptyState title={t("workspace.transcript.emptyTitle")} copy={t("workspace.transcript.emptyCopy")} action={isPendingRun ? t("workspace.actions.queueJob") : undefined} onAction={isPendingRun ? () => void runJob(selectedJob) : undefined} />
            )}
          </div>

          <div className="kw-card">
            <div className="kw-card-head">
              <div>
                <p className="kw-kicker">{t("workspace.artifacts.kicker")}</p>
                <h2>{t("workspace.artifacts.generateTitle")}</h2>
              </div>
              <button type="button" className="kw-button primary" disabled={!canGenerate || pendingArtifacts.length > 0} onClick={() => void generateCoreArtifacts()}>
                <Sparkles /> {t("workspace.actions.coreSet")}
              </button>
            </div>
            <div className="kw-artifact-actions">
              {SUPPORTED_ARTIFACT_DEFINITIONS.map((definition) => {
                const artifact = selectedArtifacts.find((item) => item.kind === definition.kind);
                const pending = pendingArtifacts.includes(definition.kind);
                return (
                  <button key={definition.kind} type="button" className={`kw-artifact-action ${definition.accent}`} disabled={!canGenerate || pending} onClick={() => artifact ? setPreviewArtifactId(artifact.id) : void generateArtifact(definition.kind)}>
                    <span>{artifactShortLabel(definition.kind)}</span>
                    <small>{pending ? t("workspace.actions.generating") : artifact ? t("workspace.actions.open") : t("workspace.actions.generate")}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderTermReview() {
    return (
      <section className="kw-card kw-review-card">
        <div className="kw-card-head">
          <div>
            <p className="kw-kicker">{t("workspace.review.kicker")}</p>
            <h2>{t("workspace.review.title")}</h2>
          </div>
          <button type="button" className="kw-button primary" disabled={isSavingTerms} onClick={() => void submitTermReview()}>
            {isSavingTerms ? <Loader2 className="spin" /> : <CheckCircle2 />} {t("workspace.review.confirm")}
          </button>
        </div>
        <div className="kw-term-list">
          {pendingTerms.map((term) => {
            const draft = termDrafts[term.id] || { confirmedText: term.term_text, action: "accept" as const };
            return (
              <div className="kw-term-row" key={term.id}>
                <div>
                  <strong>{term.term_text}</strong>
                  {term.context ? <p>{term.context}</p> : null}
                </div>
                <input
                  value={draft.confirmedText}
                  disabled={draft.action === "reject"}
                  onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: { ...draft, confirmedText: event.target.value, action: "edit" } }))}
                />
                <select value={draft.action} onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: { ...draft, action: event.target.value as TermDraft["action"] } }))}>
                  <option value="accept">{copy.termAccept}</option>
                  <option value="edit">{copy.termEdit}</option>
                  <option value="reject">{copy.termReject}</option>
                </select>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderLive() {
    const liveTitle = selectedJob
      ? getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.live.title"))
      : selectedProject?.title || t("workspace.live.title");
    const hasLiveActivity = liveRuntimeState.elapsedSeconds > 0 || Boolean(selectedJob?.capture_mode === "live" && (transcriptText.trim() || selectedJob.status !== "pending"));
    const liveStatus = selectedJob?.status === "completed"
      ? copy.completed
      : selectedJob?.status === "failed"
        ? statusLabel(selectedJob.status)
        : liveRuntimeState.isRunning
          ? copy.recording
          : !hasLiveActivity || liveCaptureStatus === t("workspace.live.ready")
            ? copy.ready
            : copy.paused;
    const liveElapsed = liveRuntimeState.isRunning || liveRuntimeState.elapsedSeconds > 0 ? formatClock(liveRuntimeState.elapsedSeconds) : getJobElapsed(selectedJob);
    const primaryLiveIcon = liveRuntimeState.isRunning ? "pause" : "play_arrow";
    const primaryLiveLabel = liveRuntimeState.isRunning ? copy.pause : copy.start;
    const transcriptBlocks = getTranscriptBlocks(transcriptText, copy.transcriptSpeaker);
    const liveNotesArtifact = selectedArtifacts.find((artifact) => artifact.kind === "live_meeting_editor" || artifact.kind === "quick_summary");
    const coachArtifact = selectedArtifacts.find((artifact) => artifact.kind === "live_question_coach" || artifact.kind === "inspiration_questions");
    const liveNoteText = getArtifactPreview(liveNotesArtifact, copy.noLiveNotes);
    const coachSourceText = getArtifactPreview(coachArtifact, "");
    const coachText = coachSourceText || copy.noCoachQuestions;
    const coachSuggestions = coachSourceText
      .split(/\n+/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 2);

    const hiddenLivePanel = (
      <div className="hidden">
        <LiveInterviewPanel
          key={selectedProjectId || "live"}
          compact
          disabled={!selectedProjectId}
          disabledReason={t("workspace.errors.createProjectFirst")}
          isCompleted={selectedJob?.capture_mode === "live" && selectedJob.status === "completed"}
          onEnsureJob={ensureLiveJob}
          onTranscriptChange={setLiveTranscriptSnapshot}
          onStatusChange={setLiveCaptureStatus}
          onRuntimeStateChange={setLiveRuntimeState}
          onFinalized={handleLiveFinalized}
          onDraftSynced={handleLiveDraftSynced}
          onFinalizeStarted={() => setFeedback(t("workspace.feedback.finalizingLive"))}
          onFinalizeSettled={(payload) => {
            if (!payload.success) setError(payload.statusText);
          }}
        />
      </div>
    );

    return (
      <div className="kemo-reference-live dark bg-background text-on-background font-body-md min-h-screen flex flex-col overflow-hidden">
        <header className="h-16 border-b border-outline-variant flex items-center justify-between px-gutter shrink-0 bg-surface z-20">
          <div className="flex items-center gap-4">
            <span className="font-headline-md text-headline-md font-semibold text-primary">Kemo.AI</span>
            <div className="h-4 w-px bg-outline-variant mx-2" />
            <div className="flex items-center gap-2 text-error">
              <div className="w-2 h-2 rounded-full bg-error pulse-dot" />
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold">{liveStatus}</span>
            </div>
            <span className="font-body-md text-body-md text-on-surface-variant ml-2">{copy.liveSession}: {liveTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono-code text-mono-code text-on-surface-variant">{liveElapsed}</span>
            <button className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-surface-variant transition-colors text-primary" type="button" onClick={handlePrimaryLiveControl} disabled={Boolean(liveRuntimeState.pendingAction)} title={primaryLiveLabel}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{primaryLiveIcon}</span>
            </button>
            <button className="h-10 px-6 rounded-full bg-error text-on-error font-label-sm text-label-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2" type="button" onClick={handleStopLiveControl} disabled={liveRuntimeState.pendingAction === "stopping"}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
              {copy.stop}
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          <section className="flex-1 flex flex-col border-r border-outline-variant bg-surface relative">
            <div className="h-12 border-b border-outline-variant flex items-center px-gutter shrink-0 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
              <h2 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{copy.liveTranscript}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-gutter py-stack-md flex flex-col gap-stack-lg pb-32" id="transcript-container">
              {transcriptBlocks.length ? transcriptBlocks.map((block, index) => (
                <div className={`flex gap-4 max-w-3xl ${index === transcriptBlocks.length - 1 && selectedJob?.status !== "completed" ? "opacity-80" : ""}`} key={`${block.speaker}-${index}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${block.speakerId === "S2" ? "bg-primary-container border-outline-variant text-on-primary-container" : "bg-surface-variant border-outline-variant"}`}>
                    <span className="font-label-sm text-label-sm text-primary">{block.speakerId}</span>
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-label-sm text-label-sm text-on-surface font-medium">{block.speaker}</span>
                    </div>
                    <p className="font-body-lg text-body-lg text-on-surface leading-relaxed">
                      {block.text}
                      {index === transcriptBlocks.length - 1 && selectedJob?.status !== "completed" ? <span className="inline-block w-2 h-4 bg-primary animate-pulse align-middle ml-1" /> : null}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="flex gap-4 max-w-3xl">
                  <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center shrink-0 border border-outline-variant">
                    <span className="font-label-sm text-label-sm text-primary">S1</span>
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-label-sm text-label-sm text-on-surface font-medium">{copy.transcriptSpeaker}</span>
                    </div>
                    <p className="font-body-lg text-body-lg text-on-surface leading-relaxed text-on-surface-variant">{copy.transcriptEmpty}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-surface to-transparent pointer-events-none flex items-end justify-center pb-4 px-gutter">
              <div className="flex items-end gap-[2px] h-12" id="waveform">
                {Array.from({ length: 60 }, (_, index) => {
                  const inSpeechRange = index > 20 && index < 40;
                  const height = inSpeechRange ? 40 + ((index * 17) % 50) : 10 + ((index * 11) % 30);
                  const delay = -((index * 37) % 120) / 100;
                  return (
                    <div
                      className={`w-1 rounded-t-sm waveform-bar ${inSpeechRange ? "bg-primary/80" : "bg-primary/40"}`}
                      key={index}
                      style={{ height: `${height}%`, animationDelay: `${delay}s` }}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="w-96 flex flex-col bg-surface-container-low shrink-0 relative">
            <div className="h-12 border-b border-outline-variant flex px-4 shrink-0 bg-surface-container-low sticky top-0 z-10">
              <button className="px-4 h-full border-b-2 border-primary text-primary font-label-sm text-label-sm font-semibold flex items-center gap-2" type="button">
                <span className="material-symbols-outlined text-[18px]">notes</span>
                {copy.notesTab}
              </button>
              <button className="px-4 h-full border-b-2 border-transparent text-on-surface-variant hover:text-on-surface transition-colors font-label-sm text-label-sm flex items-center gap-2" type="button">
                <span className="material-symbols-outlined text-[18px]">psychology</span>
                {copy.coachTab}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-body-md text-body-md font-medium text-on-surface">{copy.autoExtraction}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider font-mono-code">{copy.syncing}</span>
                </div>
                <div className="bg-surface border border-outline-variant rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-secondary">
                    <span className="material-symbols-outlined text-[16px]">push_pin</span>
                    <span className="font-label-sm text-label-sm">{liveNotesArtifact?.title || copy.extractedNote}</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface">{liveNoteText}</p>
                  <div className="text-[12px] text-on-surface-variant font-mono-code mt-1">{liveNotesArtifact ? formatDate(liveNotesArtifact.updated_at || liveNotesArtifact.created_at, locale) : liveStatus}</div>
                </div>
                <div className="bg-surface border border-outline-variant rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-secondary">
                    <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                    <span className="font-label-sm text-label-sm">{coachArtifact?.title || copy.featureArtifact}</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface">{coachText}</p>
                  <div className="text-[12px] text-on-surface-variant font-mono-code mt-1">{coachArtifact ? formatDate(coachArtifact.updated_at || coachArtifact.created_at, locale) : liveStatus}</div>
                </div>
              </div>
              <div className="h-px bg-outline-variant w-full my-2" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">temp_preferences_custom</span>
                  <h3 className="font-body-md text-body-md font-medium text-primary">{copy.questionCoach}</h3>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">{copy.suggestedFollowUps}</p>
                <div className="flex flex-col gap-2 mt-2">
                  {coachSuggestions.map((suggestion, index) => (
                    <button className={`${index === 0 ? "bg-primary/5 hover:bg-primary/10 border-primary/20 group" : "bg-surface border-outline-variant hover:border-outline"} text-left border rounded-lg p-3 transition-colors`} key={`${suggestion}-${index}`} type="button">
                      <p className={`font-body-md text-body-md ${index === 0 ? "text-on-surface group-hover:text-primary" : "text-on-surface-variant"}`}>{suggestion}</p>
                    </button>
                  ))}
                  {!coachSuggestions.length ? <p className="font-body-md text-body-md text-on-surface-variant">{copy.noCoachQuestions}</p> : null}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-outline-variant bg-surface-container-low shrink-0">
              <div className="relative">
                <input className="w-full bg-surface border-b border-outline-variant focus:border-primary focus:ring-0 px-0 py-2 text-on-surface font-body-md text-body-md placeholder-on-surface-variant bg-transparent" placeholder={copy.manualNote} type="text" value={manualNoteDraft} onChange={(event) => setManualNoteDraft(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") submitManualNote();
                }} />
                <button className="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors" type="button" onClick={submitManualNote}>
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          </aside>
        </main>
        {hiddenLivePanel}
      </div>
    );
  }

  function renderSources() {
    return (
      <div className="kw-page-stack">
        <div className="kw-page-heading">
          <div>
            <p className="kw-kicker">{t("workspace.sources.kicker")}</p>
            <h1>{copy.sourcePageTitle}</h1>
            <p>{t("workspace.sources.connected", { count: projectSources.length, project: selectedProject?.title || t("workspace.context.thisProject") })}</p>
          </div>
          <button type="button" className="kw-button primary" onClick={() => setCaptureDialogOpen(true)}><Upload /> {t("workspace.actions.import")}</button>
        </div>
        <div className="kw-source-layout">
          <div className="kw-source-table">
            <div className="kw-source-table-head">
              <span>{copy.sourceName}</span>
              <span>{copy.type}</span>
              <span>{copy.lastSync}</span>
              <span>{copy.status}</span>
            </div>
            {projectSources.length ? projectSources.map((source) => (
              <button key={source.id} type="button" className={`kw-source-table-row ${selectedSourceId === source.id ? "active" : ""}`} onClick={() => selectSource(source)}>
                <span className="kw-source-name"><BookOpen /> <span>{source.title || source.url || t("workspace.sources.importedSource")}</span><small>{source.domain || source.url || source.source_type}</small></span>
                <span>{source.source_type || copy.sourceTypeFallback}</span>
                <span>{formatDate(source.updated_at || source.created_at, locale)}</span>
                <span><span className={`kw-mini-status ${source.status || "ready"}`}>{formatSourceStatus(source.status, copy)}</span></span>
              </button>
            )) : <EmptyState title={t("workspace.sources.emptyTitle")} copy={t("workspace.sources.emptyCopy")} action={t("workspace.actions.importSource")} onAction={() => setCaptureDialogOpen(true)} />}
          </div>
          <div className="kw-card kw-source-inspector">
            <div className="kw-card-head">
              <div>
                <p className="kw-kicker">{selectedSource?.source_type || t("workspace.sources.preview")}</p>
                <h2>{selectedSource?.title || t("workspace.sources.selectSource")}</h2>
              </div>
              {selectedSource?.status ? <span className={`kw-mini-status ${selectedSource.status}`}>{selectedSource.status}</span> : null}
            </div>
            {selectedSource ? (
              <pre className="kw-source-preview">{selectedSource.extracted_text || selectedSource.raw_text || selectedSource.url || t("workspace.sources.noContent")}</pre>
            ) : (
              <p className="kw-muted">{t("workspace.sources.helper")}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderHelp() {
    return (
      <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg max-w-[880px] mx-auto w-full">
        <div className="kw-page-stack">
          <div className="kw-page-heading">
            <div>
              <p className="kw-kicker">{copy.helpKicker}</p>
              <h1>{copy.helpTitle}</h1>
              <p>{copy.helpDescription}</p>
            </div>
          </div>

          <section className="kw-help-grid">
            {[
              [copy.helpProjectTitle, copy.helpProjectCopy],
              [copy.helpSourcesTitle, copy.helpSourcesCopy],
              [copy.helpArtifactsTitle, copy.helpArtifactsCopy],
              [copy.helpPlanTitle, copy.helpPlanCopy(plan.maxFileSizeMb)],
            ].map(([title, body]) => (
              <article className="kw-card" key={title}>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </section>

          <section className="kw-card">
            <div className="kw-card-head">
              <div>
                <p className="kw-kicker">{copy.contactSupport}</p>
                <h2>{copy.submitFeedback}</h2>
              </div>
              <span className="kw-mini-status">{copy.disabled}</span>
            </div>
            <div className="kw-form-stack">
              <label>{copy.topic}<select disabled><option>{copy.bugReport}</option><option>{copy.featureRequest}</option><option>{copy.dataSourceInquiry}</option></select></label>
              <label>{copy.description}<textarea disabled placeholder={copy.supportPlaceholder} /></label>
              <button type="button" className="kw-button secondary full" disabled>{copy.submitTicket}</button>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderArtifacts() {
    const visibleArtifacts = selectedJob ? selectedArtifacts : projectArtifacts;
    return (
      <div className="kw-page-stack">
        <div className="kw-page-heading">
          <div>
            <p className="kw-kicker">{t("workspace.artifacts.explorerKicker")}</p>
            <h1>{selectedJob ? getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")) : t("workspace.artifacts.allTitle")}</h1>
            <p>{t("workspace.artifacts.generatedOutputs", { count: visibleArtifacts.length })}</p>
          </div>
          {selectedJob ? <button type="button" className="kw-button primary" disabled={!transcriptText.trim()} onClick={() => void generateCoreArtifacts()}><Sparkles /> {t("workspace.actions.generate")}</button> : null}
        </div>
        {visibleArtifacts.length ? (
          <div className="kw-artifact-grid">
            {visibleArtifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} favorite={favoriteArtifactIds.has(artifact.id)} pending={pendingArtifacts.includes(artifact.kind)} onOpen={() => setPreviewArtifactId(artifact.id)} onFavorite={() => void toggleArtifactFavorite(artifact)} label={artifactShortLabel(artifact.kind)} title={artifactLabel(artifact.kind)} description={artifactDescription(artifact.kind)} dateLabel={formatDate(artifact.updated_at || artifact.created_at, locale)} favoriteLabel={t("workspace.actions.favorite")} liveCoachPending={t("workspace.live.questionCoachPending")} />)}
          </div>
        ) : (
          <EmptyState title={t("workspace.artifacts.emptyTitle")} copy={selectedJob ? t("workspace.artifacts.emptyJobCopy") : t("workspace.artifacts.emptyProjectCopy")} />
        )}
      </div>
    );
  }

  function renderFavorites() {
    return (
      <div className="kw-page-stack">
        <div className="kw-page-heading">
          <div>
            <p className="kw-kicker">{t("workspace.favorites.kicker")}</p>
            <h1>{t("workspace.favorites.title")}</h1>
            <p>{t("workspace.favorites.savedItems", { count: projectFavoriteItems.length })}</p>
          </div>
        </div>
        {projectFavoriteItems.length ? (
          <div className="kw-favorite-list">
            {projectFavoriteItems.map((favorite) => (
              <button key={favorite.id} type="button" className="kw-favorite-row" onClick={() => {
                if (favorite.job_id) {
                  const job = jobState.find((item) => item.id === favorite.job_id);
                  if (job) selectJob(job);
                }
                if (favorite.artifact_id) setPreviewArtifactId(favorite.artifact_id);
              }}>
                <Star />
                <span>{favorite.label || t("workspace.favorites.savedItem")}</span>
                <small>{favorite.excerpt || favorite.item_type}</small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={t("workspace.favorites.emptyTitle")} copy={t("workspace.favorites.emptyCopy")} />
        )}
      </div>
    );
  }

  function renderActiveSection() {
    if (activeSection === "projects") return renderProjects();
    if (activeSection === "jobs") return renderJobs();
    if (activeSection === "sources") return <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto w-full"><div className="kw-content">{renderSources()}</div></section>;
    if (activeSection === "artifacts") return <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto w-full"><div className="kw-content">{renderArtifacts()}</div></section>;
    if (activeSection === "favorites") return <section className="flex-1 max-md:flex-none overflow-y-auto max-md:overflow-visible px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto w-full"><div className="kw-content">{renderFavorites()}</div></section>;
    if (activeSection === "help") return renderHelp();
    return renderProjects();
  }

  if (activeSection === "live") return renderLive();

  const sidebarSourceArtifacts = (selectedJob ? selectedArtifacts : projectArtifacts).slice(0, 2);
  const sidebarArtifactKinds = new Set(sidebarSourceArtifacts.map((artifact) => artifact.kind));
  const sidebarFeatureCards = [
    {
      key: "feature-live-notes",
      icon: "edit_note",
      title: copy.liveNotes,
      description: copy.liveNotesDescription,
      hidden: sidebarArtifactKinds.has("live_meeting_editor") || sidebarArtifactKinds.has("quick_summary"),
      onClick: () => {
        if (selectedJob && transcriptText.trim()) {
          void generateArtifact("quick_summary");
          return;
        }
        setActiveSection("artifacts");
      },
    },
    {
      key: "feature-question-coach",
      icon: "psychology",
      title: copy.questionCoach,
      description: copy.questionCoachDescription,
      hidden: sidebarArtifactKinds.has("live_question_coach") || sidebarArtifactKinds.has("inspiration_questions"),
      onClick: () => {
        if (selectedJob && transcriptText.trim()) {
          void generateArtifact("inspiration_questions");
          return;
        }
        setActiveSection("artifacts");
      },
    },
  ];
  const sidebarCards = [
    ...sidebarSourceArtifacts.map((artifact) => ({
      key: artifact.id,
      icon: getArtifactIcon(artifact.kind),
      title: artifactLabel(artifact.kind),
      description: getDisplayArtifactSummary(artifact, t("workspace.live.questionCoachPending"), artifactDescription(artifact.kind)),
      onClick: () => setPreviewArtifactId(artifact.id),
    })),
    ...sidebarFeatureCards.filter((card) => !card.hidden),
  ].slice(0, 2);
  const navItems: Array<{ id: WorkspaceSection; label: string; icon: string; href?: string }> = [
    { id: "projects", label: copy.navProjects, icon: "folder_open" },
    { id: "jobs", label: copy.navJobs, icon: "work_outline" },
    { id: "sources", label: copy.navSources, icon: "database" },
    { id: "artifacts", label: copy.navArtifacts, icon: "auto_awesome" },
    { id: "settings", label: copy.navSettings, icon: "settings", href: `/${locale}/app/settings` },
  ];
  const footerNavItems: Array<{ id: WorkspaceSection; label: string; icon: string }> = [
    { id: "help", label: copy.navHelp, icon: "help_outline" },
    { id: "favorites", label: copy.navFeedback, icon: "chat_bubble_outline" },
  ];

  return (
    <div className="kemo-reference-workspace light flex h-screen overflow-hidden bg-background text-on-background">
      <nav className="kw-designer-nav">
        <Link className="kw-designer-brand" href={`/${locale}/app/jobs`} onClick={() => setActiveSection("projects")}>
          <span className="kw-designer-avatar"><KemoMark /></span>
          <span><strong>Kemo.AI</strong><small>{copy.brandSubtitle}</small></span>
        </Link>
        <button className="kw-designer-new" type="button" onClick={() => setProjectDialogOpen(true)}>
          <span className="material-symbols-outlined">add</span>
          {copy.newProject}
        </button>
        <div className="kw-designer-nav-list">
          {navItems.map((item) => item.href ? (
            <Link className={`kw-designer-nav-item ${activeSection === item.id ? "active" : ""}`} href={item.href} key={item.id}>
              <span className="material-symbols-outlined" style={activeSection === item.id ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
              {item.label}
            </Link>
          ) : (
            <button className={`kw-designer-nav-item ${activeSection === item.id ? "active" : ""}`} type="button" key={item.id} onClick={() => {
              if (item.id === "jobs") setSelectedJobId(null);
              setActiveSection(item.id);
            }}>
              <span className="material-symbols-outlined" style={activeSection === item.id ? { fontVariationSettings: "'FILL' 1" } : undefined}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="kw-designer-footer-nav">
          <LocaleSegmentedControl locale={locale} />
          {footerNavItems.map((item) => (
            <button className={`kw-designer-nav-item ${activeSection === item.id ? "active" : ""}`} type="button" key={item.id} onClick={() => setActiveSection(item.id)}>
              <span className="material-symbols-outlined">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="ml-[280px] flex-1 flex flex-col md:flex-row h-full overflow-hidden max-md:overflow-y-auto">
        {renderActiveSection()}
        <aside className="kw-designer-inspector">
          <div className="kw-designer-inspector-head">
            <h3><span className="material-symbols-outlined">auto_awesome</span>{copy.artifacts}</h3>
            <button type="button" className="kw-icon-button" onClick={() => router.refresh()} title={t("workspace.actions.refresh")}><RefreshCw /></button>
          </div>
          <div className="flex flex-col gap-stack-sm flex-1">
            {sidebarCards.map((card) => (
              <button className="bg-surface-container-lowest p-stack-md rounded-lg border border-outline-variant hover:shadow-sm transition-shadow cursor-pointer text-left" type="button" onClick={card.onClick} key={card.key}>
                <div className="flex items-center gap-2 mb-unit text-primary">
                  <span className="material-symbols-outlined text-sm">{card.icon}</span>
                  <span className="font-body-md text-body-md font-medium">{card.title}</span>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant line-clamp-2">{card.description || copy.noArtifacts}</p>
              </button>
            ))}
          </div>
          <div className="mt-auto pt-stack-md">
            <Link className="bg-surface-container-lowest border border-outline-variant rounded-lg p-stack-sm flex items-center justify-between cursor-pointer hover:bg-surface-container-high transition-colors" href={`/${locale}/app/settings`}>
              <span className="font-label-sm text-label-sm text-primary">{copy.proCta}</span>
              <span className="material-symbols-outlined text-sm text-on-surface-variant">arrow_forward</span>
            </Link>
          </div>
        </aside>
      </main>

      {(feedback || error) ? (
        <div className={`kw-toast ${error ? "error" : ""}`}>
          <span>{error || feedback}</span>
          <button type="button" onClick={() => { setFeedback(null); setError(null); }}><X /></button>
        </div>
      ) : null}

      {projectDialogOpen ? (
        <Modal title={t("workspace.projectDialog.title")} closeLabel={t("common.close")} onClose={() => setProjectDialogOpen(false)}>
          <div className="kw-form-stack">
            <label>{t("workspace.projectDialog.titleLabel")}<input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} placeholder={t("workspace.projectDialog.titlePlaceholder")} /></label>
            <label>{t("workspace.projectDialog.descriptionLabel")}<textarea value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder={t("workspace.projectDialog.descriptionPlaceholder")} /></label>
            <button type="button" className="kw-button primary full" disabled={isCreatingProject} onClick={() => void createProject()}>{isCreatingProject ? <Loader2 className="spin" /> : <Plus />} {t("workspace.projectDialog.create")}</button>
          </div>
        </Modal>
      ) : null}

      {captureDialogOpen ? (
        <Modal title={t("workspace.captureDialog.title")} closeLabel={t("common.close")} onClose={closeCaptureDialog}>
          <div className="kw-capture-grid">
            <button type="button" onClick={chooseLiveCapture}><Mic /><strong>{t("workspace.captureDialog.liveTitle")}</strong><span>{t("workspace.captureDialog.liveCopy")}</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()}><Upload /><strong>{t("workspace.captureDialog.uploadTitle")}</strong><span>{t("workspace.captureDialog.uploadCopy")}</span></button>
            <button type="button" onClick={chooseUrlCapture}><BookOpen /><strong>{t("workspace.captureDialog.urlTitle")}</strong><span>{t("workspace.captureDialog.urlCopy")}</span></button>
          </div>
          <div className="kw-form-stack">
            <label>{t("workspace.captureDialog.sourceTitle")}<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder={t("workspace.captureDialog.optional")} /></label>
            <label>URL<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." /></label>
            <button type="button" className="kw-button secondary full" disabled={uploadState === "working"} onClick={() => void importUrlSource()}>{uploadState === "working" ? <Loader2 className="spin" /> : <BookOpen />} {t("workspace.actions.importUrl")}</button>
          </div>
          <input ref={fileInputRef} className="hidden" type="file" accept="audio/*,video/*,.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) void handleFileUpload(file);
          }} />
        </Modal>
      ) : null}

      {previewArtifact ? (
        <Modal title={getDisplayArtifactTitle(previewArtifact, artifactLabel(previewArtifact.kind))} closeLabel={t("common.close")} wide onClose={() => setPreviewArtifactId(null)}>
          <div className="kw-preview-layout">
            <article className="kw-preview-document">
              <p className="kw-kicker">{artifactLabel(previewArtifact.kind)}</p>
              <h2>{getDisplayArtifactTitle(previewArtifact, artifactLabel(previewArtifact.kind))}</h2>
              {previewArtifact.audio_url ? <audio controls src={previewArtifact.audio_url} className="kw-audio" /> : null}
              <pre>{getDisplayArtifactText(previewArtifact, t("workspace.live.questionCoachPending")) || t("workspace.artifacts.noContent")}</pre>
            </article>
            <aside className="kw-preview-meta">
              <StatusPill status={previewArtifact.status} label={statusLabel(previewArtifact.status)} />
              <p>{getDisplayArtifactSummary(previewArtifact, t("workspace.live.questionCoachPending"), artifactDescription(previewArtifact.kind))}</p>
              <button type="button" className="kw-button secondary full" onClick={() => void copyArtifact(previewArtifact)}><Copy /> {t("common.copy")}</button>
              {getDownloadPath(previewArtifact) ? <a className="kw-button primary full" href={getDownloadPath(previewArtifact) || "#"}><Download /> {t("workspace.actions.downloadDocx")}</a> : null}
              <button type="button" className={`kw-button secondary full ${favoriteArtifactIds.has(previewArtifact.id) ? "active" : ""}`} onClick={() => void toggleArtifactFavorite(previewArtifact)}><Star /> {favoriteArtifactIds.has(previewArtifact.id) ? t("workspace.actions.favorited") : t("workspace.actions.favorite")}</button>
            </aside>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function StatusPill({ status, label }: { status: string | null | undefined; label: string }) {
  return <span className={`kw-status-pill ${getStatusTone(status)}`}>{label}</span>;
}

function EmptyState({ title, copy, action, onAction }: { title: string; copy: string; action?: string; onAction?: () => void }) {
  return (
    <div className="kw-empty-state">
      <Archive />
      <h3>{title}</h3>
      <p>{copy}</p>
      {action && onAction ? <button type="button" className="kw-button primary" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

function ArtifactCard({
  artifact,
  favorite,
  pending,
  onOpen,
  onFavorite,
  label,
  title,
  description,
  dateLabel,
  favoriteLabel,
  liveCoachPending,
}: {
  artifact: WorkspaceArtifact;
  favorite: boolean;
  pending: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  label: string;
  title: string;
  description: string;
  dateLabel: string;
  favoriteLabel: string;
  liveCoachPending: string;
}) {
  const definition = getArtifactDefinition(artifact.kind);
  return (
    <div className={`kw-artifact-card ${definition.accent}`}>
      <button type="button" onClick={onOpen}>
        <div>
          <span>{label}</span>
          {pending ? <Loader2 className="spin" /> : <FileText />}
        </div>
        <h3>{getDisplayArtifactTitle(artifact, title)}</h3>
        <p>{getDisplayArtifactSummary(artifact, liveCoachPending, description)}</p>
        <small>{dateLabel}</small>
      </button>
      <button type="button" className={`kw-icon-button ${favorite ? "active" : ""}`} onClick={onFavorite} title={favoriteLabel}><Star /></button>
    </div>
  );
}

function Modal({ title, children, onClose, wide = false, closeLabel }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; closeLabel: string }) {
  return (
    <div className="kw-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`kw-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="kw-icon-button" onClick={onClose} title={closeLabel}><X /></button>
        </header>
        {children}
      </section>
    </div>
  );
}


