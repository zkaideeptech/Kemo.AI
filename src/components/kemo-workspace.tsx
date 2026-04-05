"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Bot,
  ChevronDown,
  ClipboardList,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  Lightbulb,
  Link2,
  Loader2,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  NotebookText,
  Plus,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  ScreenShare,
  ScrollText,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User,
  type LucideIcon,
} from "lucide-react";

import { AgentChatPanel } from "@/components/agent-chat-panel";
import { DashboardStatsPanel } from "@/components/dashboard-stats-panel";
import { FocusInterviewModal } from "@/components/focus-interview-modal";

import { LiveInterviewPanel, type CaptureMode } from "@/components/live-interview-panel";
import { KemoMark } from "@/components/kemo-mark";
import { NewJobForm, type NewJobStarterPreference } from "@/components/new-job-form";
import {
  WorkspaceLineGlyph,
} from "@/components/workspace-line-art";
import { WorkspaceThemeSwitcher, useWorkspaceResolvedTheme } from "@/components/workspace-theme-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getArtifactLabel,
  type ArtifactKind,
  type FavoriteRow,
  type JobRow,
  type ProjectSearchResult,
  type ProjectRow,
  type SourceRow,
  type TranscriptRow,
  type WorkspaceArtifact,
} from "@/lib/workspace";
import type { PlanTier } from "@/lib/billing/plan";

export type KemoWorkspaceLanding = "agent" | "dashboard" | "interview" | "workspace" | "capture" | "processing" | "library";
type WorkspaceTone = "light" | "dark";

type ClarificationQuestion = {
  question: string;
  context: string;
};

type ParsedArtifactContent = {
  body: string;
  clarificationItems: ClarificationQuestion[];
};

const PRIMARY_ARTIFACT_KINDS = ["publish_script", "quick_summary", "inspiration_questions"] as const;
const PRIMARY_ARTIFACT_DISPLAY_ORDER = ["inspiration_questions", "quick_summary", "publish_script"] as const;
const LIVE_SKILL_KINDS: ArtifactKind[] = ["inspiration_questions", "publish_script"];
const FILE_MODE_SKILL_KINDS: ArtifactKind[] = [
  "quick_summary",
  "meeting_minutes",
  "publish_script",
  "inspiration_questions",
  "podcast_audio",
];
const EMPTY_ARTIFACT_KIND_SET: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>();

type PrimaryArtifactKind = (typeof PRIMARY_ARTIFACT_KINDS)[number];
type PrimaryArtifactProgressRun = {
  mode: "manual" | "finalizing";
  stepIndex: number;
};

type PrimaryArtifactProgressSnapshot = {
  label: string;
  tone: "idle" | "draft" | "queued" | "running" | "ready";
  stage: 0 | 1 | 2 | 3;
  stageLabel: string;
};

const TASK_ARTIFACT_ORDER: ArtifactKind[] = [
  "publish_script",
  "quick_summary",
  "inspiration_questions",
  "key_insights",
  "mind_map",
  "ppt_outline",
  "podcast_script",
  "podcast_audio",
  "roadshow_transcript",
  "meeting_minutes",
  "ic_qa",
  "wechat_article",
];

const MOCK_SCROLLING_TEXTS = [
  "正在提取会议核心信息...",
  "分析讲话者意图与关键指征...",
  "正在匹配业务相关术语库...",
  "正在梳理上下文时间线...",
  "智能排版计算与语义融合...",
  "准备输出最终纪要与执行项..."
];

function ProcessingMarquee() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % MOCK_SCROLLING_TEXTS.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="mt-3 text-[11px] font-medium tracking-[0.08em] opacity-80 text-[#798e88] transition-opacity duration-300">
      {MOCK_SCROLLING_TEXTS[index]}
    </div>
  );
}

function getArtifactOrder(kind: ArtifactKind) {
  const index = TASK_ARTIFACT_ORDER.indexOf(kind);
  return index === -1 ? TASK_ARTIFACT_ORDER.length : index;
}

function sortWorkspaceArtifacts(entries: WorkspaceArtifact[]) {
  return [...entries].sort((left, right) => {
    const kindDelta = getArtifactOrder(left.kind as ArtifactKind) - getArtifactOrder(right.kind as ArtifactKind);
    if (kindDelta !== 0) {
      return kindDelta;
    }

    return new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime();
  });
}

function getJobTimestamp(job: JobRow) {
  return new Date(job.updated_at || job.created_at).getTime();
}

function extractTaggedSection(content: string, tag: string) {
  const pattern = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "i");
  const match = content.match(pattern);
  return match?.[1]?.trim() || "";
}

function parseClarificationItems(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-+\s*/, ""))
    .map((line) => {
      const match = line.match(/^\u95ee\u9898\uff1a(.+?)(?:\uff5c\u7ebf\u7d22\uff1a(.+))?$/);
      if (!match) {
        return {
          question: line.trim(),
          context: "",
        } satisfies ClarificationQuestion;
      }

      return {
        question: match[1].trim(),
        context: (match[2] || "").trim(),
      } satisfies ClarificationQuestion;
    })
    .filter(Boolean) as ClarificationQuestion[];
}

function parseLegacyClarificationContent(content: string): ClarificationQuestion[] {
  const segments = content.split(/\u8bf7\u786e\u8ba4[:\uFF1A]/);
  if (segments.length < 2) {
    return [];
  }

  const context = segments[0]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" / ");
  const questionLines = segments[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^\d+[.\u3001]\s*(.+)$/)?.[1]?.trim() || "")
    .filter(Boolean);

  return questionLines.map((question) => ({
    question,
    context,
  }));
}

function parseArtifactContent(content: string): ParsedArtifactContent {
  const clarificationBlock = extractTaggedSection(content, "\u5f85\u786e\u8ba4\u9879");
  const bodyBlock = extractTaggedSection(content, "\u8349\u6848\u7248\u6b63\u6587");
  const clarificationItems = clarificationBlock
    ? parseClarificationItems(clarificationBlock)
    : parseLegacyClarificationContent(content);

  if (bodyBlock) {
    return {
      body: bodyBlock,
      clarificationItems,
    };
  }

  const cleanedContent = content
    .replace(/\[\u5f85\u786e\u8ba4\u9879\][\s\S]*?\[\/\u5f85\u786e\u8ba4\u9879\]/i, "")
    .replace(/\[\u8349\u6848\u7248\u6b63\u6587\]|\[\/\u8349\u6848\u7248\u6b63\u6587\]/gi, "")
    .replace(/\u8bf7\u786e\u8ba4[:\uFF1A][\s\S]*$/i, "")
    .trim();

  return {
    body: cleanedContent,
    clarificationItems,
  };
}

const PRIMARY_ARTIFACT_CONFIG: Record<
  PrimaryArtifactKind,
  {
    icon: LucideIcon;
    eyebrow: string;
    spotlight: string;
    placeholder: string;
  }
> = {
  publish_script: {
    icon: NotebookText,
    eyebrow: "\u4e3b\u7a3f",
    spotlight: "\u53ef\u76f4\u63a5\u5b9a\u7a3f\u7684\u53d1\u5e03\u7a3f\u8349\u7a3f",
    placeholder: "\u7b49\u5f85\u751f\u6210",
  },
  quick_summary: {
    icon: Sparkles,
    eyebrow: "\u6458\u8981",
    spotlight: "\u8fd9\u8f6e\u8bbf\u8c08\u7684\u4e3b\u7ed3\u8bba\u4e0e\u91cd\u70b9",
    placeholder: "\u7b49\u5f85\u751f\u6210",
  },
  inspiration_questions: {
    icon: MessagesSquare,
    eyebrow: "\u8ffd\u95ee",
    spotlight: "\u4e0b\u4e00\u8f6e\u91c7\u8bbf\u8be5\u8ffd\u95ee\u4ec0\u4e48",
    placeholder: "\u7b49\u5f85\u751f\u6210",
  },
};

function isPrimaryArtifactKind(kind: string): kind is PrimaryArtifactKind {
  return PRIMARY_ARTIFACT_KINDS.includes(kind as PrimaryArtifactKind);
}

const FILE_SKILL_ITEMS: Array<{
  kind: ArtifactKind;
  icon: LucideIcon;
  title: string;
  note: string;
  accent?: boolean;
}> = [
  {
    kind: "quick_summary",
    icon: Sparkles,
    title: "\u5feb\u901f\u6458\u8981",
    note: "\u4e00\u5c4f\u7406\u89e3\u672c\u8f6e\u8bbf\u8c08",
  },
  {
    kind: "meeting_minutes",
    icon: ClipboardList,
    title: "\u4f1a\u8bae\u7eaa\u8981",
    note: "\u4e00\u952e\u6574\u7406\u4f1a\u8bae\u8981\u70b9",
  },
  {
    kind: "inspiration_questions",
    icon: Lightbulb,
    title: "\u7075\u611f\u8ffd\u95ee",
    note: "\u7ee7\u7eed\u6316\u63d8\u53ef\u8bbf\u8c08\u65b9\u5411",
  },
  {
    kind: "podcast_audio",
    icon: AudioLines,
    title: "AI \u64ad\u5ba2\u97f3\u9891",
    note: "\u811a\u672c -> \u97f3\u9891",
  },
  {
    kind: "publish_script",
    icon: ScrollText,
    title: "\u6b63\u5f0f\u4e3b\u7a3f",
    note: "\u4e00\u952e\u751f\u6210\u7ec8\u7248\u4f53\u9762\u9605\u8bfb\u7a3f",
    accent: true,
  },
];

const SECONDARY_SKILL_ITEMS = FILE_SKILL_ITEMS.filter(
  (item) => !PRIMARY_ARTIFACT_DISPLAY_ORDER.includes(item.kind as PrimaryArtifactKind)
);

void SECONDARY_SKILL_ITEMS;

export function KemoWorkspace({
  locale,
  landing = "workspace",
  plan,
  projects,
  jobs,
  transcripts,
  artifacts,
  favorites,
  sources,
  initialJobId = null,
  initialNewInterviewOpen = false,
}: {
  locale: string;
  landing?: KemoWorkspaceLanding;
  plan: { plan: PlanTier; maxFileSizeMb: number };
  projects: ProjectRow[];
  jobs: JobRow[];
  transcripts: TranscriptRow[];
  artifacts: WorkspaceArtifact[];
  favorites: FavoriteRow[];
  sources: SourceRow[];
  initialJobId?: string | null;
  initialNewInterviewOpen?: boolean;
}) {
  const initialJobProjectId = initialJobId
    ? jobs.find((job) => job.id === initialJobId)?.project_id || null
    : null;
  const initialInterviewDraftMode =
    initialJobId ? null : (landing === "capture" || landing === "interview") ? "live" : landing === "processing" ? "file" : null;
  const initialCenterSection =
    initialNewInterviewOpen || initialInterviewDraftMode ? "interview" : "tasks";
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [liveTranscriptExpanded, setLiveTranscriptExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [darkRailHovered, setDarkRailHovered] = useState(false);
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [centerSection, setCenterSection] = useState<"interview" | "tasks" | "sources">(initialCenterSection);
  const [interviewDraftMode, setInterviewDraftMode] = useState<"live" | "file" | null>(initialInterviewDraftMode);
  const [preferredCaptureMode, setPreferredCaptureMode] = useState<CaptureMode>("mic");
  const [preferredFileEntry, setPreferredFileEntry] = useState<NewJobStarterPreference>(
    (landing === "processing" || landing === "dashboard") ? "upload" : "selection"
  );
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newSourceOpen, setNewSourceOpen] = useState(false);
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});
  const [projectState, setProjectState] = useState(projects);
  const [jobState, setJobState] = useState(jobs);
  const [artifactState, setArtifactState] = useState(artifacts);
  const [favoriteState, setFavoriteState] = useState(favorites);
  const [sourceState, setSourceState] = useState(sources);
  const [selectedProjectId, setSelectedProjectId] = useState(initialJobProjectId || null);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId || null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activePrimaryKind, setActivePrimaryKind] = useState<PrimaryArtifactKind>("publish_script");
  const [selectedSkillKind, setSelectedSkillKind] = useState<ArtifactKind | null>(null);
  const [openedSkillKinds, setOpenedSkillKinds] = useState<ArtifactKind[]>([]);
  const [collapsedSkillKinds, setCollapsedSkillKinds] = useState<Partial<Record<ArtifactKind, boolean>>>({});
  const [swipedProjectId, setSwipedProjectId] = useState<string | null>(null);
  const [, setSwipedJobId] = useState<string | null>(null);
  const [openJobMenuId, setOpenJobMenuId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(initialJobProjectId ? [initialJobProjectId] : []);
  const [projectResults, setProjectResults] = useState<ProjectSearchResult[]>([]);
  const [isProjectSearching, setIsProjectSearching] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingJobId, setRenamingJobId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isImportingSource, setIsImportingSource] = useState(false);
  const [liveTranscriptSnapshot, setLiveTranscriptSnapshot] = useState("");
  const [liveCaptureStatus, setLiveCaptureStatus] = useState("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
  const [, setStudioFeedback] = useState<string | null>(null);
  const [pendingArtifactKinds, setPendingArtifactKinds] = useState<ArtifactKind[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [isLoadingClarifications, setIsLoadingClarifications] = useState(false);
  const [isSavingClarifications, setIsSavingClarifications] = useState(false);
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
  const [processSkillsOpen, setProcessSkillsOpen] = useState(false);
  const [skillDialogJobId, setSkillDialogJobId] = useState<string | null>(null);
  const [skillDialogVariant, setSkillDialogVariant] = useState<"light" | "dark">("light");
  const [skillDialogFocusKind, setSkillDialogFocusKind] = useState<ArtifactKind | null>(null);
  const [processingModalOpen, setProcessingModalOpen] = useState(false);
  const [primaryProgressRuns, setPrimaryProgressRuns] = useState<Partial<Record<PrimaryArtifactKind, PrimaryArtifactProgressRun>>>({});
  const [expandedLiveCards, setExpandedLiveCards] = useState<Record<string, boolean>>({});
  const [liveSkillDeckCollapsed, setLiveSkillDeckCollapsed] = useState(false);
  const sidebarSearchInputRef = useRef<HTMLInputElement>(null);
  const liveDraftSyncRef = useRef<{
    inFlight: boolean;
    lastLength: number;
    timer: number | null;
  }>({
    inFlight: false,
    lastLength: 0,
    timer: null,
  });
  const inspirationRefreshRef = useRef<{
    inFlight: boolean;
    lastRequestedAt: number;
    timer: number | null;
  }>({
    inFlight: false,
    lastRequestedAt: 0,
    timer: null,
  });

  const jobsByProject = useMemo(() => {
    const grouped = new Map<string, JobRow[]>();
    for (const project of projectState) {
      grouped.set(
        project.id,
        jobState
          .filter((job) => job.project_id === project.id)
          .sort((left, right) => getJobTimestamp(right) - getJobTimestamp(left))
      );
    }
    return grouped;
  }, [jobState, projectState]);
  const jobsByRecency = useMemo(
    () => [...jobState].sort((left, right) => getJobTimestamp(right) - getJobTimestamp(left)),
    [jobState]
  );

  const selectedProject = projectState.find((project) => project.id === selectedProjectId) || null;
  const selectedJob = jobState.find((job) => job.id === selectedJobId && job.project_id === selectedProjectId) || null;
  const selectedJobPrimaryId = selectedJob?.id || null;
  const selectedJobPrimaryMode = selectedJob?.capture_mode || null;
  const selectedJobPrimaryStatus = selectedJob?.status || null;
  const transcript = transcripts.find((item) => item.job_id === selectedJob?.id) || null;

  const selectedArtifacts = useMemo(
    () => sortWorkspaceArtifacts(artifactState.filter((artifact) => artifact.job_id === selectedJob?.id)),
    [artifactState, selectedJob?.id]
  );
  const selectedPublishArtifact =
    selectedArtifacts.find((artifact) => artifact.kind === "publish_script") || null;
  const selectedTaskArtifacts = selectedArtifacts;
  const primaryArtifactsByKind = useMemo(
    () =>
      PRIMARY_ARTIFACT_KINDS.reduce((collection, kind) => {
        collection[kind] = selectedTaskArtifacts.find((artifact) => artifact.kind === kind) || null;
        return collection;
      }, {} as Record<PrimaryArtifactKind, WorkspaceArtifact | null>),
    [selectedTaskArtifacts]
  );
  const parsedPublishArtifact = useMemo(
    () => (selectedPublishArtifact ? parseArtifactContent(selectedPublishArtifact.content || "") : null),
    [selectedPublishArtifact]
  );
  const projectSources = sourceState.filter((source) => source.project_id === selectedProjectId);
  const selectedSource = projectSources.find((source) => source.id === selectedSourceId) || null;
  const favoriteArtifactIds = new Set(
    favoriteState.map((favorite) => favorite.artifact_id).filter(Boolean) as string[]
  );
  const favoriteJobIds = new Set(
    favoriteState
      .filter((favorite) => favorite.job_id && !favorite.artifact_id)
      .map((favorite) => favorite.job_id) as string[]
  );
  const previewArtifact = previewArtifactId
    ? artifactState.find((artifact) => artifact.id === previewArtifactId) || null
    : null;
  const parsedPreviewArtifact = useMemo(
    () => (previewArtifact?.kind === "publish_script" ? parseArtifactContent(previewArtifact.content || "") : null),
    [previewArtifact]
  );
  const transcriptContent =
    transcript?.transcript_text ||
    selectedJob?.live_transcript_snapshot ||
    liveTranscriptSnapshot ||
    "";
  const spotlightJob = selectedJob || jobsByRecency[0] || null;
  const spotlightProject =
    selectedProject ||
    (spotlightJob?.project_id ? projectState.find((project) => project.id === spotlightJob.project_id) || null : null);
  const homeJob = jobsByRecency.find((job) => job.capture_mode !== "live") || spotlightJob;
  const homeProject =
    (homeJob?.project_id ? projectState.find((project) => project.id === homeJob.project_id) || null : null) ||
    spotlightProject;
  const spotlightArtifacts = useMemo(
    () =>
      artifactState
        .filter((artifact) => artifact.job_id === spotlightJob?.id)
        .sort((left, right) => {
          const kindDelta = getArtifactOrder(left.kind as ArtifactKind) - getArtifactOrder(right.kind as ArtifactKind);
          if (kindDelta !== 0) {
            return kindDelta;
          }

          return new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime();
        }),
    [artifactState, spotlightJob?.id]
  );
  const spotlightTranscript = transcripts.find((item) => item.job_id === spotlightJob?.id) || null;
  const spotlightTranscriptContent =
    spotlightTranscript?.transcript_text ||
    spotlightJob?.live_transcript_snapshot ||
    liveTranscriptSnapshot ||
    "";
  const spotlightSource =
    selectedSource ||
    sourceState.find((source) => source.job_id === spotlightJob?.id) ||
    sourceState.find((source) => source.project_id === spotlightProject?.id) ||
    null;
  const spotlightSummaryArtifact =
    spotlightArtifacts.find((artifact) => artifact.kind === "quick_summary") || null;
  const spotlightMinutesArtifact =
    spotlightArtifacts.find((artifact) => artifact.kind === "meeting_minutes") || null;
  const spotlightPublishArtifact =
    spotlightArtifacts.find((artifact) => artifact.kind === "publish_script") || null;
  const hasStarted = Boolean(transcriptContent.trim() || Object.values(primaryArtifactsByKind).some(Boolean));
  const hasSelectedProject = Boolean(selectedProjectId);
  const isZh = locale !== "en";
  const localeKey = isZh ? "zh" : "en";
  const ui = {
    workspace: isZh ? "\u4e0a\u4f20\u5f55\u97f3" : "Upload Audio",
    capture: isZh ? "\u5b9e\u65f6\u5f55\u97f3" : "Capture",
    process: isZh ? "\u8fdb\u7a0b" : "Process",
    library: isZh ? "\u9996\u9875" : "Home",
    projects: isZh ? "\u9879\u76ee" : "Projects",
    newProject: isZh ? "\u65b0\u5efa\u9879\u76ee" : "New Project",
    newAnalysis: isZh ? "\u65b0\u5efa\u5206\u6790" : "New Analysis",
    searchWorkspace: isZh ? "\u641c\u7d22\u5de5\u4f5c\u533a" : "Search Workspace",
    searchInProject: isZh ? "\u5728\u5f53\u524d\u9879\u76ee\u5185\u641c\u7d22" : "Search inside current project",
    selectProjectFirst: isZh ? "\u8bf7\u5148\u9009\u62e9\u9879\u76ee" : "Select a project first",
    searching: isZh ? "\u641c\u7d22\u4e2d" : "Searching",
    resultCount: (count: number) => (isZh ? `\u627e\u5230 ${count} \u6761` : `${count} results`),
    expandWorkspace: isZh ? "\u5c55\u5f00\u5de5\u4f5c\u533a" : "Expand workspace",
    collapseWorkspace: isZh ? "\u6536\u8d77\u5de5\u4f5c\u533a" : "Collapse workspace",
    settings: isZh ? "\u8bbe\u7f6e" : "Settings",
    sessions: isZh ? "\u573a\u4f1a" : "sessions",
    noSessions: isZh ? "\u6682\u65e0\u4f1a\u8bdd" : "No sessions yet.",
    noMatches: isZh ? "\u5f53\u524d\u9879\u76ee\u4e2d\u6682\u65e0\u5339\u914d\u7ed3\u679c\u3002" : "No matches in this project yet.",
    typeToSearch: isZh
      ? "\u8f93\u5165\u81f3\u5c11\u4e24\u4e2a\u5b57\u7b26\u540e\uff0c\u53ef\u641c\u7d22\u4efb\u52a1\u3001\u6765\u6e90\u4e0e\u8f93\u51fa\u3002"
      : "Type at least two characters to search jobs, sources, and outputs.",
    createFirstProject: isZh
      ? "\u5148\u521b\u5efa\u7b2c\u4e00\u4e2a\u9879\u76ee\uff0c\u7136\u540e\u5f00\u59cb\u7ba1\u7406\u6765\u6e90\u3001\u4f1a\u8bdd\u548c AI \u8f93\u51fa\u3002"
      : "Create your first project to start capturing sessions, sources, and AI outputs.",
    emptyActivity: isZh
      ? "\u8fd8\u6ca1\u6709\u9879\u76ee\u6d3b\u52a8\uff0c\u5148\u521b\u5efa\u6216\u5bfc\u5165\u4e00\u6b21\u5185\u5bb9\u5427\u3002"
      : "No project activity yet. Create or import a session to get started.",
    fileIngress: isZh ? "\u6587\u4ef6\u5f52\u6863" : "File Ingestion",
    initializeWorkspace: isZh ? "\u5bfc\u5165\u6765\u6e90\u5e76\u5f00\u59cb\u6574\u7406" : "Import Sources and Start Processing",
    workspaceSubtitle: isZh
      ? "\u5de5\u4f5c\u533a\u4e13\u6ce8\u4e8e\u4e0a\u4f20\u6587\u4ef6\u4e0e URL \u6765\u6e90\u3002\u5bfc\u5165\u540e\u53ef\u76f4\u63a5\u67e5\u770b\u5bf9\u8bdd\u7a3f\u3001\u4f1a\u8bae\u7eaa\u8981\u548c\u6280\u80fd\u7ed3\u679c\u3002"
      : "Workspace is focused on uploaded files and URLs. Import a source, then review transcript, minutes, and skill outputs.",
    sourceOptions: isZh ? "\u6587\u4ef6\u4e0e URL \u6765\u6e90" : "File and URL Sources",
    transcriptPanel: isZh ? "\u5bf9\u8bdd\u7a3f" : "Transcript",
    transcriptEmpty: isZh
      ? "\u5bfc\u5165\u6587\u4ef6\u6216 URL \u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5bf9\u8bdd\u7a3f\u548c\u6765\u6e90\u9884\u89c8\u3002"
      : "The transcript and source preview will appear here after import.",
    minutesPanel: isZh ? "\u4f1a\u8bae\u7eaa\u8981" : "Meeting Minutes",
    minutesEmpty: isZh
      ? "\u6587\u4ef6\u6a21\u5f0f\u5904\u7406\u5b8c\u6210\u540e\uff0c\u4f1a\u8bae\u7eaa\u8981\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002"
      : "Meeting minutes will appear here after file-mode processing completes.",
    skillDeck: isZh ? "\u6280\u80fd\u5361" : "Skills",
    processSkills: isZh ? "\u67e5\u770b\u6280\u80fd\u8fdb\u5ea6" : "Open Skill Progress",
    processTitle: isZh ? "\u5904\u7406\u8fdb\u7a0b" : "Processing Sequence",
    processSubtitle: isZh
      ? "\u5728\u8fd9\u91cc\u67e5\u770b\u8f6c\u5199\u3001\u6574\u7406\u548c skill \u751f\u6210\u7684\u5b9e\u65f6\u8fdb\u5ea6\u3002"
      : "Track transcription, synthesis, and skill progress here.",
    closeProcess: isZh ? "\u5173\u95ed\u8fdb\u7a0b" : "Close Process",
    libraryTitle: isZh ? "\u4e2a\u4eba\u9996\u9875" : "Personal Home",
    librarySubtitle: isZh
      ? "\u5728\u4e00\u4e2a\u5730\u65b9\u770b\u5b8c\u4e0a\u4f20\u6570\u636e\u3001\u8fdb\u5c55\u3001\u5206\u6790\u4e0e AI \u5165\u53e3\u3002"
      : "See uploads, progress, insights, and AI entry points in one place.",
    homeOverview: isZh ? "\u4e0a\u4f20\u603b\u89c8" : "Upload Overview",
    homeInsights: isZh ? "\u6570\u636e\u5206\u6790" : "Insights",
    homeAgent: isZh ? "AI \u5165\u53e3" : "AI Entry",
    homeFavorites: isZh ? "\u6536\u85cf\u8282\u70b9" : "Favorites",
    homePulse: isZh ? "\u672c\u5468\u52a8\u6001" : "Weekly Pulse",
    askFiles: isZh ? "\u95ee\u7b54" : "Ask",
    summarizeFiles: isZh ? "\u6c47\u603b" : "Summarize",
    focusFiles: isZh ? "\u627e\u91cd\u70b9" : "Find Focus",
    totalProjects: isZh ? "\u9879\u76ee" : "Projects",
    totalSessions: isZh ? "\u4efb\u52a1" : "Sessions",
    totalSources: isZh ? "\u6587\u4ef6" : "Sources",
    totalFavorites: isZh ? "\u6536\u85cf" : "Favorites",
    latestDrop: isZh ? "\u6700\u65b0\u5bfc\u5165" : "Latest Drop",
    activeFiles: isZh ? "\u6fc0\u6d3b\u6587\u4ef6" : "Active Files",
    outputReady: isZh ? "\u5df2\u51c6\u5907" : "Output Ready",
    currentSession: isZh ? "\u5f53\u524d\u4efb\u52a1" : "Current Session",
    sessionStatus: isZh ? "\u4efb\u52a1\u72b6\u6001" : "Session Status",
    transcriptSnippet: isZh ? "\u8f6c\u5199\u6458\u5f55" : "Transcript Snippet",
    minuteSnapshot: isZh ? "\u7eaa\u8981\u6458\u5f55" : "Minutes Snapshot",
    sourceSnapshot: isZh ? "\u6765\u6e90\u6458\u5f55" : "Source Snapshot",
    noSessionSelected: isZh ? "\u8fd8\u672a\u9009\u62e9\u5f53\u524d\u4efb\u52a1" : "No session selected yet",
    noTranscriptYet: isZh ? "\u8fd8\u6ca1\u6709\u8f6c\u5199\u5185\u5bb9" : "No transcript yet",
    noMinutesYet: isZh ? "\u7eaa\u8981\u8fd8\u672a\u751f\u6210" : "Minutes are not ready yet",
    noSourceTextYet: isZh ? "\u6765\u6e90\u5185\u5bb9\u8fd8\u672a\u51c6\u5907\u597d" : "Source content is not ready yet",
    progressOrbit: isZh ? "\u8fdb\u7a0b\u753b\u5e03" : "Process Canvas",
    syncPoint: isZh ? "\u540c\u6b65\u70b9" : "Sync Point",
    stillProcessing: isZh ? "\u6b63\u5728\u8fd0\u884c" : "In Flight",
    liveModule: isZh ? "\u5f55\u97f3\u94fe\u8def" : "Capture Chain",
    compactState: isZh ? "\u5f53\u524d\u72b6\u6001" : "Current State",
    chooseProject: isZh ? "\u9009\u9879\u76ee" : "Pick Project",
    homeEmpty: isZh ? "\u8fd8\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u9996\u9875\u6570\u636e\uff0c\u5148\u5bfc\u5165\u4e00\u6761\u5f55\u97f3\u5427\u3002" : "No home data yet. Import a recording to begin.",
    recentActivity: isZh ? "\u6700\u8fd1\u6d3b\u52a8" : "Recent Activity",
    activeProject: isZh ? "\u5f53\u524d\u9879\u76ee" : "Active Project",
    sourceEntity: isZh ? "\u6765\u6e90\u5b9e\u4f53" : "Source Entity",
    metadata: isZh ? "\u5143\u6570\u636e" : "Metadata",
    status: isZh ? "\u72b6\u6001" : "Status",
    source: isZh ? "\u6765\u6e90" : "Source",
    updated: isZh ? "\u66f4\u65b0" : "Updated",
    engineStats: isZh ? "\u5f15\u64ce\u72b6\u6001" : "Engine Stats",
    outputPreview: isZh ? "\u5b9e\u65f6\u8f93\u51fa\u9884\u89c8" : "Live Output Preview",
    openWorkspace: isZh ? "\u6253\u5f00\u5de5\u4f5c\u533a" : "Open Workspace",
    sourceArchive: isZh ? "\u6765\u6e90\u5e93" : "Source Archive",
    emptyLibrary: isZh
      ? "\u8fd8\u6ca1\u6709\u6536\u85cf\u5185\u5bb9\uff0c\u5148\u5728\u5de5\u4f5c\u533a\u6216\u8fdb\u7a0b\u9875\u6536\u85cf\u7ed3\u679c\u5427\u3002"
      : "No saved items yet. Favorite sessions or outputs first.",
    noProject: isZh ? "\u8bf7\u5148\u521b\u5efa\u9879\u76ee" : "Create a project first",
    fileMode: isZh ? "\u6587\u4ef6\u6a21\u5f0f" : "File Mode",
    liveMode: isZh ? "\u5b9e\u65f6\u6a21\u5f0f" : "Live Mode",
    liveSession: isZh ? "\u5b9e\u65f6\u4f1a\u8bdd" : "Live Session",
    liveCaptureSession: isZh ? "\u5b9e\u65f6\u5f55\u97f3\u4f1a\u8bdd" : "Live Capture Session",
    projectNotSelected: isZh ? "\u8fd8\u672a\u9009\u62e9\u9879\u76ee" : "Project not selected yet",
    skillModalTitle: isZh ? "\u6280\u80fd\u8fdb\u5ea6" : "Skill Progress",
    skillModalDesc: isZh
      ? "\u6839\u636e\u5f53\u524d\u6a21\u5f0f\u67e5\u770b\u4e0d\u540c skill \u7684\u751f\u6210\u7ed3\u679c\u548c\u8fdb\u5ea6\u3002"
      : "Inspect progress and outputs for the current mode's skills.",
    noSourceSelected: isZh ? "\u5c1a\u672a\u9009\u62e9\u6765\u6e90" : "No source selected",
    noArtifactsYet: isZh ? "\u8fd8\u6ca1\u6709\u6280\u80fd\u8f93\u51fa" : "No skill output yet",
    drafts: isZh ? "\u8349\u7a3f" : "Drafts",
    archive: isZh ? "\u5f52\u6863" : "Archive",
    searchFiles: isZh ? "\u641c\u7d22\u6587\u4ef6..." : "Search files...",
    ingestionQueue: isZh ? "\u5f85\u5904\u7406\u961f\u5217" : "Ingestion Queue",
    uploadSourceHint: isZh
      ? "\u5c06\u6587\u4ef6\u6216 URL \u5bfc\u5165\u5230\u5f53\u524d\u9879\u76ee\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u5904\u7406\u8fdb\u5ea6\u3002"
      : "Upload a file or import a URL into the current project to see processing here.",
    pending: isZh ? "\u5f85\u5904\u7406" : "Pending",
    moduleStatus: isZh ? "KEMO-AI-X1 \u6a21\u5757" : "Module: KEMO-AI-X1",
    uploadStage: isZh ? "\u4e0a\u4f20" : "Uploading",
    transcribeStage: isZh ? "\u8f6c\u5199" : "Transcribing",
    synthesizeStage: isZh ? "\u751f\u6210" : "Synthesizing",
    compute: isZh ? "\u7b97\u529b" : "Compute",
    latency: isZh ? "\u5ef6\u8fdf" : "Latency",
    outputPreviewEmpty: isZh
      ? "\u5185\u5bb9\u751f\u6210\u540e\uff0c\u8fd9\u91cc\u4f1a\u51fa\u73b0\u8f93\u51fa\u9884\u89c8\u3002"
      : "Output preview will appear here once content is available.",
    deleteProject: isZh ? "\u5220\u9664\u9879\u76ee" : "Delete project",
    deleteSession: isZh ? "\u5220\u9664\u4f1a\u8bdd" : "Delete session",
    favorite: isZh ? "\u6536\u85cf" : "Favorite",
    unfavorite: isZh ? "\u53d6\u6d88\u6536\u85cf" : "Unfavorite",
    importSourceTitle: isZh ? "\u5bfc\u5165\u7f51\u9875\u6765\u6e90" : "Import Web Source",
    importSourceDesc: isZh
      ? "\u7c98\u8d34\u7f51\u9875\u94fe\u63a5\uff0c\u6293\u53d6\u5185\u5bb9\u5e76\u5f52\u6863\u5230\u5f53\u524d\u9879\u76ee\u3002"
      : "Paste a webpage link, ingest the content, and archive it into the current project.",
    sourceTitleOptional: isZh ? "\u6765\u6e90\u6807\u9898\uff08\u53ef\u9009\uff09" : "Source Title (Optional)",
    sourceTitlePlaceholder: isZh ? "\u53ef\u7559\u7a7a\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u63d0\u53d6\u6807\u9898" : "Leave blank to let the system extract a title",
    importSourceAction: isZh ? "\u5bfc\u5165\u6765\u6e90" : "Import Source",
    projectDialogTitle: isZh ? "\u65b0\u5efa\u9879\u76ee" : "New Project",
    projectDialogDesc: isZh
      ? "\u5148\u521b\u5efa\u4e00\u4e2a\u9879\u76ee\uff0c\u518d\u628a\u5f55\u97f3\u3001\u6765\u6e90\u548c\u8f93\u51fa\u5f52\u6863\u8fdb\u6765\u3002"
      : "Create a project first, then archive recordings, sources, and outputs into it.",
    projectName: isZh ? "\u9879\u76ee\u540d\u79f0" : "Project Name",
    projectNamePlaceholder: isZh ? "\u4f8b\u5982\uff1a\u65b0\u54c1\u53d1\u5e03\u4f1a" : "Example: Product Launch",
    projectDescription: isZh ? "\u9879\u76ee\u8bf4\u660e\uff08\u53ef\u9009\uff09" : "Project Description (Optional)",
    projectDescriptionPlaceholder: isZh ? "\u8bb0\u5f55\u8bbf\u8c08\u5bf9\u8c61\u3001\u76ee\u6807\u6216\u80cc\u666f" : "Document the subject, goal, or context",
    createProjectAction: isZh ? "\u521b\u5efa\u9879\u76ee" : "Create Project",
    noContent: isZh ? "\u6682\u65e0\u5185\u5bb9" : "No content yet",
  };
  const projectLockedReason = ui.noProject;
  const pendingArtifactKindSet = new Set(pendingArtifactKinds);
  const canSubmitClarifications = Boolean(
    selectedJob &&
      parsedPublishArtifact?.clarificationItems.length &&
      parsedPublishArtifact.clarificationItems.every((item) => (clarificationAnswers[item.question] || "").trim())
  );

  const startPrimaryProgress = useCallback((kinds: PrimaryArtifactKind[], mode: PrimaryArtifactProgressRun["mode"]) => {
    setPrimaryProgressRuns((prev) => {
      const next = { ...prev };
      kinds.forEach((kind, index) => {
        next[kind] = {
          mode,
          stepIndex: mode === "finalizing" ? index : 0,
        };
      });
      return next;
    });
  }, []);

  const clearPrimaryProgress = useCallback((kinds?: PrimaryArtifactKind[]) => {
    setPrimaryProgressRuns((prev) => {
      if (!kinds) {
        return {};
      }

      const next = { ...prev };
      kinds.forEach((kind) => {
        delete next[kind];
      });
      return next;
    });
  }, []);

  const primaryProgressByKind = useMemo(() => {
    const snapshots = {} as Record<PrimaryArtifactKind, PrimaryArtifactProgressSnapshot>;

    PRIMARY_ARTIFACT_KINDS.forEach((kind) => {
      const artifact = primaryArtifactsByKind[kind];
      const run = primaryProgressRuns[kind];

      if (run) {
        if (run.mode === "manual") {
          snapshots[kind] = {
            label: artifact ? "\u66f4\u65b0\u4e2d" : "\u751f\u6210\u4e2d",
            tone: "running",
            stage: 2,
            stageLabel: "\u5904\u7406\u4e2d",
          };
          return;
        }

        if (run.stepIndex > 0) {
          snapshots[kind] = {
            label: "\u6392\u961f\u4e2d",
            tone: "queued",
            stage: 1,
            stageLabel: "\u5f85\u5904\u7406",
          };
          return;
        }

        snapshots[kind] = {
          label: "\u751f\u6210\u4e2d",
          tone: "running",
          stage: 2,
          stageLabel: "\u5904\u7406\u4e2d",
        };
        return;
      }

      if (!artifact) {
        snapshots[kind] = {
          label: "\u5f85\u751f\u6210",
          tone: "idle",
          stage: 0,
          stageLabel: "\u672a\u5f00\u59cb",
        };
        return;
      }

      if (artifact.status === "draft") {
        snapshots[kind] = {
          label: "\u5b9e\u65f6\u8349\u7a3f",
          tone: "draft",
          stage: 1,
          stageLabel: "\u8349\u7a3f",
        };
        return;
      }

      snapshots[kind] = {
        label: "\u5df2\u5b9a\u7a3f",
        tone: "ready",
        stage: 3,
        stageLabel: "\u5df2\u5b8c\u6210",
      };
    });

    return snapshots;
  }, [primaryArtifactsByKind, primaryProgressRuns]);

  const requestArtifact = useCallback(async (kind: ArtifactKind, transcriptOverride?: string) => {
    if (!selectedJob) {
      return null;
    }

    if (isPrimaryArtifactKind(kind)) {
      startPrimaryProgress([kind], "manual");
    }

    const transcriptText = transcriptOverride ?? liveTranscriptSnapshot ?? transcriptContent ?? "";
    setPendingArtifactKinds((prev) => Array.from(new Set([...prev, kind])));
    setStudioFeedback(`${getArtifactLabel(kind, localeKey)}\u751f\u6210\u4e2d`);
    setCenterSection("tasks");

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          transcriptText,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setStudioFeedback(json?.error?.message || "\u751f\u6210\u5931\u8d25");
        return null;
      }

      const nextArtifact = json.data.artifact as WorkspaceArtifact;
      mergeArtifactsIntoState([nextArtifact]);
      setStudioFeedback(`${getArtifactLabel(kind, localeKey)}\u5df2\u66f4\u65b0`);
      setCenterSection("tasks");
      return nextArtifact;
    } catch {
      setStudioFeedback("\u751f\u6210\u5931\u8d25");
      return null;
    } finally {
      setPendingArtifactKinds((prev) => prev.filter((item) => item !== kind));
      if (isPrimaryArtifactKind(kind)) {
        clearPrimaryProgress([kind]);
      }
    }
  }, [clearPrimaryProgress, liveTranscriptSnapshot, localeKey, selectedJob, startPrimaryProgress, transcriptContent]);

  useEffect(() => {
    if (selectedJob?.capture_mode !== "live" || selectedJob.status === "completed") {
      return;
    }

    if (liveCaptureStatus.includes("\u6b63\u5728\u6574\u7406\u6700\u7ec8\u6587\u7a3f")) {
      return;
    }

    const transcriptText = liveTranscriptSnapshot.trim();
    if (transcriptText.length < 80) {
      return;
    }

    const syncState = liveDraftSyncRef.current;
    if (syncState.inFlight || transcriptText.length - syncState.lastLength < 80) {
      return;
    }

    if (syncState.timer !== null) {
      window.clearTimeout(syncState.timer);
    }

    syncState.timer = window.setTimeout(() => {
      syncState.timer = null;
      syncState.inFlight = true;
      setPendingArtifactKinds((prev) => Array.from(new Set([...prev, "publish_script", "quick_summary"])));

      void (async () => {
        const res = await fetch(`/api/jobs/${selectedJob.id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptText,
            statusText: liveCaptureStatus,
            finalize: false,
            includeInspiration: false,
          }),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok && Array.isArray(json.data?.draftArtifacts)) {
          const nextArtifacts = json.data.draftArtifacts as WorkspaceArtifact[];
          mergeArtifactsIntoState(nextArtifacts);
          setStudioFeedback("\u5b9e\u65f6\u8349\u7a3f\u5df2\u66f4\u65b0");
          syncState.lastLength = transcriptText.length;
        }
      })().finally(() => {
        syncState.inFlight = false;
        setPendingArtifactKinds((prev) =>
          prev.filter((kind) => !["publish_script", "quick_summary"].includes(kind))
        );
      });
    }, 1200);

    return () => {
      if (syncState.timer !== null) {
        window.clearTimeout(syncState.timer);
        syncState.timer = null;
      }
    };
  }, [liveCaptureStatus, liveTranscriptSnapshot, selectedJob?.capture_mode, selectedJob?.id, selectedJob?.status]);

  useEffect(() => {
    if (selectedJob?.capture_mode !== "live" || selectedJob.status === "completed") {
      return;
    }

    if (liveCaptureStatus.includes("\u6b63\u5728\u6574\u7406\u6700\u7ec8\u6587\u7a3f")) {
      return;
    }

    const transcriptText = liveTranscriptSnapshot.trim();
    if (transcriptText.length < 120) {
      return;
    }

    const inspirationState = inspirationRefreshRef.current;
    if (inspirationState.inFlight) {
      return;
    }

    const existingInspiration = selectedTaskArtifacts.find((artifact) => artifact.kind === "inspiration_questions");
    const isFirstRound = !existingInspiration;
    const elapsed = Date.now() - inspirationState.lastRequestedAt;
    const intervalMs = 60000;

    if (isFirstRound) {
      if (inspirationState.timer !== null) {
        window.clearTimeout(inspirationState.timer);
      }
      inspirationState.timer = window.setTimeout(() => {
        inspirationState.timer = null;
        inspirationState.inFlight = true;
        inspirationState.lastRequestedAt = Date.now();
        setPendingArtifactKinds((prev) => Array.from(new Set([...prev, "inspiration_questions"])));

        void requestArtifact("inspiration_questions", transcriptText)
          .then((artifact) => {
            if (artifact) setStudioFeedback(`灵感追问已首次生成 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
          })
          .finally(() => {
            inspirationState.inFlight = false;
          });
      }, 800);

      return () => {
        if (inspirationState.timer !== null) {
          window.clearTimeout(inspirationState.timer);
          inspirationState.timer = null;
        }
      };
    }

    if (elapsed >= intervalMs) {
      if (inspirationState.timer !== null) {
        window.clearTimeout(inspirationState.timer);
      }
      inspirationState.timer = window.setTimeout(() => {
        inspirationState.timer = null;
        inspirationState.inFlight = true;
        inspirationState.lastRequestedAt = Date.now();
        setPendingArtifactKinds((prev) => Array.from(new Set([...prev, "inspiration_questions", "quick_summary", "meeting_minutes"])));

        Promise.all([
          requestArtifact("inspiration_questions", transcriptText),
          requestArtifact("quick_summary", transcriptText),
          requestArtifact("meeting_minutes", transcriptText),
        ])
          .then(() => {
            setStudioFeedback(`智能分析已滚动刷新 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
          })
          .finally(() => {
            inspirationState.inFlight = false;
          });
      }, 0);
    }
  }, [liveCaptureStatus, liveTranscriptSnapshot, requestArtifact, selectedJob?.capture_mode, selectedJob?.id, selectedJob?.status, selectedTaskArtifacts]);

  useEffect(() => {
    if (!projectState.length) {
      setSelectedProjectId(null);
      return;
    }

    if (!projectState.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projectState, selectedProjectId]);

  useEffect(() => {
    if (landing === "workspace" || landing === "dashboard" || landing === "agent" || selectedProjectId) {
      return;
    }

    const fallbackJob = jobsByRecency[0] || null;
    if (fallbackJob?.project_id) {
      setSelectedProjectId(fallbackJob.project_id);
      setSelectedJobId(fallbackJob.id);
      return;
    }

    if (projectState[0]?.id) {
      setSelectedProjectId(projectState[0].id);
    }
  }, [jobsByRecency, landing, projectState, selectedProjectId]);

  useEffect(() => {
    setExpandedProjectIds((prev) => prev.filter((projectId) => projectState.some((project) => project.id === projectId)));
  }, [projectState]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setExpandedProjectIds((prev) => (prev.includes(selectedProjectId) ? prev : [selectedProjectId, ...prev]));
  }, [selectedProjectId]);

  useEffect(() => {
    if (collapsed) {
      setSidebarSearchOpen(false);
      setSwipedProjectId(null);
    }
  }, [collapsed]);

  useEffect(() => {
    if (!swipedProjectId) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (!target.closest(".workspace-sidebar-project-swipe-shell")) {
        setSwipedProjectId(null);
      }
    };

    window.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [swipedProjectId]);

  useEffect(() => {
    if (sidebarSearchOpen) {
      window.requestAnimationFrame(() => {
        sidebarSearchInputRef.current?.focus();
      });
    }
  }, [sidebarSearchOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    void fetch("/api/live/audio/health", {
      method: "GET",
      cache: "no-store",
    }).catch(() => {
      // ignore warmup failures
    });
  }, []);

  useEffect(() => {
    if (!selectedProjectId || search.trim().length < 2) {
      setProjectResults([]);
      return;
    }

    let ignore = false;
    const timer = window.setTimeout(async () => {
      setIsProjectSearching(true);

      try {
        const res = await fetch(`/api/projects/${selectedProjectId}/search?q=${encodeURIComponent(search.trim())}`);
        const json = await res.json();

        if (!ignore && res.ok && json.ok) {
          setProjectResults(json.data.results || []);
        }
      } catch {
        if (!ignore) {
          setProjectResults([]);
        }
      } finally {
        if (!ignore) {
          setIsProjectSearching(false);
        }
      }
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [search, selectedProjectId]);

  useEffect(() => {
    setStudioFeedback(null);
  }, [selectedJobId, selectedProjectId]);

  useEffect(() => {
    setSelectedSkillKind(null);
    setOpenedSkillKinds([]);
    setCollapsedSkillKinds({});
    setSwipedJobId(null);
  }, [selectedJobId, selectedProjectId]);

  useEffect(() => {
    liveDraftSyncRef.current.lastLength = 0;
    liveDraftSyncRef.current.inFlight = false;
    if (liveDraftSyncRef.current.timer !== null) {
      window.clearTimeout(liveDraftSyncRef.current.timer);
      liveDraftSyncRef.current.timer = null;
    }
    inspirationRefreshRef.current.lastRequestedAt = 0;
    inspirationRefreshRef.current.inFlight = false;
    if (inspirationRefreshRef.current.timer !== null) {
      window.clearTimeout(inspirationRefreshRef.current.timer);
      inspirationRefreshRef.current.timer = null;
    }
    setPendingArtifactKinds([]);
    clearPrimaryProgress();
    setPreviewArtifactId(null);
  }, [clearPrimaryProgress, selectedJobId]);

  useEffect(() => {
    const syncState = liveDraftSyncRef.current;
    const inspirationState = inspirationRefreshRef.current;
    return () => {
      if (syncState.timer !== null) {
        window.clearTimeout(syncState.timer);
      }
      if (inspirationState.timer !== null) {
        window.clearTimeout(inspirationState.timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedJob?.id) {
      setClarificationAnswers({});
      return;
    }

    let ignore = false;
    setIsLoadingClarifications(true);

    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${selectedJob.id}/clarifications`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);

        if (!ignore && res.ok && json?.ok) {
          const nextAnswers = Object.fromEntries(
            (json.data?.items || []).map((item: { question?: string; answer?: string }) => [
              item.question || "",
              item.answer || "",
            ])
          ) as Record<string, string>;
          setClarificationAnswers(nextAnswers);
        }
      } finally {
        if (!ignore) {
          setIsLoadingClarifications(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [selectedJob?.id]);

  useEffect(() => {
    if (selectedJob?.capture_mode !== "live" || selectedJob.status === "completed") {
      return;
    }

    if (liveCaptureStatus.includes("\u6b63\u5728\u6574\u7406\u6700\u7ec8\u6587\u7a3f")) {
      return;
    }

    const transcriptText = liveTranscriptSnapshot.trim();
    if (transcriptText.length < 80) {
      return;
    }

    const syncState = liveDraftSyncRef.current;
    if (syncState.inFlight || transcriptText.length - syncState.lastLength < 80) {
      return;
    }

    if (syncState.timer !== null) {
      window.clearTimeout(syncState.timer);
    }

    syncState.timer = window.setTimeout(() => {
      syncState.timer = null;
      syncState.inFlight = true;
      setPendingArtifactKinds((prev) => Array.from(new Set([...prev, "publish_script", "quick_summary"])));

      void (async () => {
        const res = await fetch(`/api/jobs/${selectedJob.id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptText,
            statusText: liveCaptureStatus,
            finalize: false,
            includeInspiration: false,
          }),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok && Array.isArray(json.data?.draftArtifacts)) {
          const nextArtifacts = json.data.draftArtifacts as WorkspaceArtifact[];
          mergeArtifactsIntoState(nextArtifacts);
          setStudioFeedback("\u5b9e\u65f6\u8349\u7a3f\u5df2\u66f4\u65b0");
          syncState.lastLength = transcriptText.length;
        }
      })().finally(() => {
        syncState.inFlight = false;
        setPendingArtifactKinds((prev) =>
          prev.filter((kind) => !["publish_script", "quick_summary"].includes(kind))
        );
      });
    }, 1200);

    return () => {
      if (syncState.timer !== null) {
        window.clearTimeout(syncState.timer);
        syncState.timer = null;
      }
    };
  }, [liveCaptureStatus, liveTranscriptSnapshot, selectedJob?.capture_mode, selectedJob?.id, selectedJob?.status]);

  useEffect(() => {
    if (selectedJob?.capture_mode !== "live" || selectedJob.status === "completed") {
      return;
    }

    if (liveCaptureStatus.includes("\u6b63\u5728\u6574\u7406\u6700\u7ec8\u6587\u7a3f")) {
      return;
    }

    const transcriptText = liveTranscriptSnapshot.trim();
    if (transcriptText.length < 120) {
      return;
    }

    const inspirationState = inspirationRefreshRef.current;
    if (inspirationState.inFlight) {
      return;
    }

    const existingInspiration = selectedTaskArtifacts.find((artifact) => artifact.kind === "inspiration_questions");
    const isFirstRound = !existingInspiration;
    const elapsed = Date.now() - inspirationState.lastRequestedAt;
    const delay = isFirstRound ? 800 : Math.max(0, 120000 - elapsed);

    if (inspirationState.timer !== null) {
      window.clearTimeout(inspirationState.timer);
    }

    inspirationState.timer = window.setTimeout(() => {
      inspirationState.timer = null;
      inspirationState.inFlight = true;
      inspirationState.lastRequestedAt = Date.now();
      setPendingArtifactKinds((prev) => Array.from(new Set([...prev, "inspiration_questions"])));

      void requestArtifact("inspiration_questions", transcriptText)
        .then((artifact) => {
          if (artifact) {
            setStudioFeedback(`\u7075\u611f\u8ffd\u95ee\u5df2\u5237\u65b0 \u00b7 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
          }
        })
        .finally(() => {
          inspirationState.inFlight = false;
        });
    }, delay);

    return () => {
      if (inspirationState.timer !== null) {
        window.clearTimeout(inspirationState.timer);
        inspirationState.timer = null;
      }
    };
  }, [liveCaptureStatus, liveTranscriptSnapshot, requestArtifact, selectedJob?.capture_mode, selectedJob?.id, selectedJob?.status, selectedTaskArtifacts]);

  useEffect(() => {
    const projectJobs = selectedProjectId ? jobsByProject.get(selectedProjectId) || [] : [];
    if (!selectedProjectId || !projectJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !projectJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(projectJobs[0]?.id || null);
    }
  }, [jobsByProject, selectedJobId, selectedProjectId]);

  useEffect(() => {
    const nextSources = sourceState.filter((source) => source.project_id === selectedProjectId);
    if (!selectedProjectId || !nextSources.length) {
      setSelectedSourceId(null);
      return;
    }

    if (!nextSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(null);
    }
  }, [selectedProjectId, selectedSourceId, sourceState]);

  useEffect(() => {
    if (!initialNewInterviewOpen) {
      return;
    }

    if (!hasSelectedProject) {
      setCenterSection("interview");
      setNewProjectOpen(true);
      return;
    }

    setInterviewDraftMode(null);
    setCenterSection("interview");
  }, [hasSelectedProject, initialNewInterviewOpen]);

  useEffect(() => {
    if (parsedPublishArtifact?.clarificationItems.length) {
      setCenterSection("tasks");
    }
  }, [parsedPublishArtifact]);

  useEffect(() => {
    if (!selectedJobPrimaryId) {
      setActivePrimaryKind("publish_script");
      return;
    }

    const isLive = selectedJobPrimaryMode === "live" && selectedJobPrimaryStatus !== "completed";
    setActivePrimaryKind(isLive ? "quick_summary" : "publish_script");
  }, [selectedJobPrimaryId, selectedJobPrimaryMode, selectedJobPrimaryStatus]);

  useEffect(() => {
    if (!selectedJobId || !selectedJob || ["completed", "failed"].includes(selectedJob.status || "")) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const [jobRes, artifactRes] = await Promise.all([
            fetch(`/api/jobs/${selectedJobId}`, {
              method: "GET",
              cache: "no-store",
            }),
            fetch(`/api/jobs/${selectedJobId}/artifacts`, {
              method: "GET",
              cache: "no-store",
            }),
          ]);

          const jobJson = await jobRes.json().catch(() => null);
          const artifactJson = await artifactRes.json().catch(() => null);

          if (jobRes.ok && jobJson?.ok && jobJson.data?.job) {
            const refreshedJob = jobJson.data.job as JobRow;
            setJobState((prev) => prev.map((job) => (job.id === refreshedJob.id ? refreshedJob : job)));
          }

          if (artifactRes.ok && artifactJson?.ok && Array.isArray(artifactJson.data?.artifacts)) {
            mergeArtifactsIntoState(artifactJson.data.artifacts as WorkspaceArtifact[]);
          }
        } catch {
          // ignore background sync failures
        }
      })();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [selectedJob, selectedJobId]);

  async function createProject() {
    if (!newProjectTitle.trim()) {
      setProjectError("\u9879\u76ee\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a");
      return;
    }

    setIsCreatingProject(true);
    setProjectError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newProjectTitle.trim(),
        description: newProjectDescription.trim() || null,
      }),
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      setProjectError(json?.error?.message || "\u521b\u5efa\u9879\u76ee\u5931\u8d25");
      setIsCreatingProject(false);
      return;
    }

    setProjectState((prev) => [json.data.project, ...prev]);
    setSelectedProjectId(json.data.project.id);
    setSelectedJobId(null);
    setSelectedSourceId(null);
    setCenterSection(centerSection === "interview" || Boolean(interviewDraftMode) ? "interview" : "tasks");
    setNewProjectTitle("");
    setNewProjectDescription("");
    setNewProjectOpen(false);
    setIsCreatingProject(false);
  }

  async function deleteProject(project: ProjectRow) {
    const confirmed = window.confirm(`\u5220\u9664\u300c${project.title}\u300d\u4ee5\u53ca\u8be5\u9879\u76ee\u4e0b\u7684\u5168\u90e8\u5f55\u97f3\u548c\u8f93\u51fa\uff1f`);
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      window.alert(json?.error?.message || "\u5220\u9664\u9879\u76ee\u5931\u8d25");
      return;
    }

    const remainingProjects = projectState.filter((item) => item.id !== project.id);
    const nextProjectId = selectedProjectId === project.id ? remainingProjects[0]?.id ?? null : selectedProjectId;

    setProjectState(remainingProjects);
    setJobState((prev) => prev.filter((item) => item.project_id !== project.id));
    setSourceState((prev) => prev.filter((item) => item.project_id !== project.id));
    setArtifactState((prev) => prev.filter((item) => item.project_id !== project.id));
    setFavoriteState((prev) => prev.filter((item) => item.project_id !== project.id));
    setExpandedProjectIds((prev) => prev.filter((item) => item !== project.id));
    setSwipedProjectId(null);
    setSwipedJobId(null);

    if (selectedProjectId === project.id) {
      setSelectedProjectId(nextProjectId);
      setSelectedJobId(null);
      setSelectedSourceId(null);
      setCenterSection("tasks");
      setLiveTranscriptSnapshot("");
      setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
      setSidebarSearchOpen(false);
      setSearch("");
      setProjectResults([]);
      return;
    }

    if (selectedSource?.project_id === project.id) {
      setSelectedSourceId(null);
    }
  }

  async function importSource(url: string, title?: string, sourceType = "url") {
    if (!selectedProjectId) {
      setSourceError(projectLockedReason);
      setNewProjectOpen(true);
      return;
    }

    setIsImportingSource(true);
    setSourceError(null);

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title,
          sourceType,
          jobId: selectedJob?.id || null,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setSourceError(json?.error?.message || "\u5bfc\u5165\u6765\u6e90\u5931\u8d25");
        return;
      }

      setSourceState((prev) => [json.data.source, ...prev.filter((item) => item.id !== json.data.source.id)]);
      setSelectedSourceId(json.data.source.id);
      setCenterSection("sources");
      setSourceUrl("");
      setSourceTitle("");
      setNewSourceOpen(false);
    } catch {
      setSourceError("\u5bfc\u5165\u6765\u6e90\u5931\u8d25");
    } finally {
      setIsImportingSource(false);
    }
  }

  function mergeArtifactsIntoState(nextArtifacts: WorkspaceArtifact[]) {
    setArtifactState((prev) => {
      const merged = [...prev];
      for (const artifact of nextArtifacts) {
        const index = merged.findIndex((item) => item.id === artifact.id);
        if (index >= 0) {
          merged[index] = artifact;
        } else {
          merged.unshift(artifact);
        }
      }
      return merged;
    });
  }

  async function generateArtifact(kind: ArtifactKind) {
    await requestArtifact(kind);
  }

  async function submitClarifications() {
    if (!selectedJob || !parsedPublishArtifact?.clarificationItems.length || !canSubmitClarifications) {
      return;
    }

    setIsSavingClarifications(true);
    setStudioFeedback("\u6b63\u5728\u786e\u8ba4\u5e76\u91cd\u751f\u6210\u53d1\u5e03\u7a3f");

    try {
      const items = parsedPublishArtifact.clarificationItems.map((item) => ({
        question: item.question,
        answer: clarificationAnswers[item.question]?.trim() || "",
        context: item.context,
      }));

      const saveRes = await fetch(`/api/jobs/${selectedJob.id}/clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const saveJson = await saveRes.json().catch(() => null);

      if (!saveRes.ok || !saveJson?.ok) {
        setStudioFeedback(saveJson?.error?.message || "\u786e\u8ba4\u4fe1\u606f\u4fdd\u5b58\u5931\u8d25");
        return;
      }

      const transcriptText = liveTranscriptSnapshot || transcriptContent || "";
      await requestArtifact("publish_script", transcriptText);
      await Promise.all([
        requestArtifact("quick_summary", transcriptText),
        requestArtifact("inspiration_questions", transcriptText),
      ]);
      setStudioFeedback("\u786e\u8ba4\u5df2\u5199\u5165\uff0c\u53d1\u5e03\u7a3f\u4e0e\u8ffd\u95ee\u5df2\u5237\u65b0");
    } finally {
      setIsSavingClarifications(false);
    }
  }

  async function toggleFavorite(artifact: WorkspaceArtifact) {
    const isFavorite = favoriteArtifactIds.has(artifact.id);

    if (isFavorite) {
      await fetch(`/api/favorites?artifactId=${artifact.id}`, { method: "DELETE" });
      setFavoriteState((prev) => prev.filter((favorite) => favorite.artifact_id !== artifact.id));
      return;
    }

    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactId: artifact.id,
        projectId: artifact.project_id,
        jobId: artifact.job_id,
        itemType: "artifact",
        label: artifact.title,
        excerpt: artifact.summary,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) return;

    setFavoriteState((prev) => [json.data.favorite, ...prev]);
  }

  async function handleRenameProject(projectId: string, newTitle: string) {
    if (!newTitle.trim()) {
      setRenamingProjectId(null);
      return;
    }
    
    // Optimistic update
    setProjectState((prev) => prev.map((p) => (p.id === projectId ? { ...p, title: newTitle.trim() } : p)));
    setRenamingProjectId(null);
    
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
    } catch (e) {
      // Rollback might be needed in a rigorous app, but for now we ignore
      console.error(e);
    }
  }

  async function handleRenameJob(jobId: string, newTitle: string) {
    if (!newTitle.trim()) {
      setRenamingJobId(null);
      return;
    }
    
    setJobState((prev) => prev.map((j) => (j.id === jobId ? { ...j, title: newTitle.trim() } : j)));
    setRenamingJobId(null);
    
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleJobFavorite(job: JobRow) {
    const isFavorite = favoriteJobIds.has(job.id);

    if (isFavorite) {
      setFavoriteState((prev) => prev.filter((favorite) => !(favorite.job_id === job.id && !favorite.artifact_id)));
      setSwipedJobId(null);
      fetch(`/api/favorites?jobId=${job.id}`, { method: "DELETE" }).catch(console.error);
      return;
    }

    const transcriptText =
      transcripts.find((item) => item.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const excerpt = transcriptText.replace(/\s+/g, " ").trim().slice(0, 160) || null;

    const optimisticId = `temp-job-${job.id}`;
    setFavoriteState((prev) => [{ id: optimisticId, created_at: new Date().toISOString(), user_id: "", project_id: job.project_id, job_id: job.id, artifact_id: null, item_type: "job", label: getJobDisplayTitle(job), excerpt }, ...prev]);
    setSwipedJobId(null);

    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: job.project_id,
        jobId: job.id,
        artifactId: null,
        itemType: "job",
        label: getJobDisplayTitle(job),
        excerpt,
      }),
    });

    const json = await res.json();
    if (res.ok && json.ok) {
      setFavoriteState((prev) => prev.map(f => f.id === optimisticId ? json.data.favorite : f));
    }
    setSwipedJobId(null);
  }

  async function deleteJob(job: JobRow) {
    const confirmed = window.confirm(`\u5220\u9664\u300c${getJobDisplayTitle(job)}\u300d\u4ee5\u53ca\u8be5\u5f55\u97f3\u4e0b\u7684\u8f6c\u5199\u3001\u6765\u6e90\u548c\u8f93\u51fa\uff1f`);
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      window.alert(json?.error?.message || "\u5220\u9664\u5f55\u97f3\u5931\u8d25");
      return;
    }

    setJobState((prev) => prev.filter((item) => item.id !== job.id));
    setArtifactState((prev) => prev.filter((item) => item.job_id !== job.id));
    setSourceState((prev) => prev.filter((item) => item.job_id !== job.id));
    setFavoriteState((prev) => prev.filter((item) => item.job_id !== job.id));
    setSwipedJobId(null);

    if (selectedSource?.job_id === job.id) {
      setSelectedSourceId(null);
    }

    if (selectedJobId === job.id) {
      setSelectedJobId(null);
      setCenterSection("tasks");
      setLiveTranscriptSnapshot("");
      setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
    }
  }

  function jumpToSearchResult(result: ProjectSearchResult) {
    setInterviewDraftMode(null);
    if (result.source_id) {
      setSelectedSourceId(result.source_id);
      setCenterSection("sources");
    }
    if (result.job_id) {
      setSelectedJobId(result.job_id);
      setCenterSection("tasks");
    }
  }

  function handleJobCreated(job: JobRow) {
    const shouldStayInLiveFlow = interviewDraftMode === "live" && job.capture_mode === "live";
    setJobState((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
    setSelectedProjectId(job.project_id);
    setSelectedJobId(job.id);
    setCenterSection(shouldStayInLiveFlow ? "interview" : "tasks");
    setInterviewDraftMode(shouldStayInLiveFlow ? "live" : null);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
  }

  function handleSourceImported(source: SourceRow) {
    setSourceState((prev) => [source, ...prev.filter((item) => item.id !== source.id)]);
    setSelectedProjectId(source.project_id);
    setSelectedSourceId(source.id);
    setSelectedJobId(source.job_id || null);
    setCenterSection("sources");
    setInterviewDraftMode(null);
  }

  function handleLiveFinalized(payload: {
    job?: unknown;
    draftArtifacts?: unknown[];
    transcriptText: string;
    statusText: string;
  }) {
    if (payload.job) {
      const job = payload.job as JobRow;
      setJobState((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
      setSelectedJobId(job.id);
    }

    if (Array.isArray(payload.draftArtifacts) && payload.draftArtifacts.length) {
      const nextArtifacts = payload.draftArtifacts as WorkspaceArtifact[];
      mergeArtifactsIntoState(nextArtifacts);
      setStudioFeedback("\u4e3b\u7ed3\u679c\u5df2\u5b9a\u7a3f");
    }

    if (centerSection !== "interview") {
      setCenterSection("tasks");
      setInterviewDraftMode(null);
    }
    setPendingArtifactKinds((prev) => prev.filter((kind) => !isPrimaryArtifactKind(kind)));
    clearPrimaryProgress([...PRIMARY_ARTIFACT_KINDS]);
    setLiveTranscriptSnapshot(payload.transcriptText);
    setLiveCaptureStatus(payload.statusText);
  }

  function handleLiveFinalizeStarted(payload: { jobId: string | null; transcriptText: string; statusText: string }) {
    if (!payload.jobId) {
      return;
    }

    setPendingArtifactKinds((prev) => Array.from(new Set([...prev, ...PRIMARY_ARTIFACT_KINDS])));
    startPrimaryProgress([...PRIMARY_ARTIFACT_KINDS], "finalizing");
    if (centerSection !== "interview") {
      setCenterSection("tasks");
    }
    setStudioFeedback("\u6b63\u5728\u5b9a\u7a3f\u53d1\u5e03\u7a3f\u3001\u6458\u8981\u4e0e\u7075\u611f\u63d0\u95ee");
    // NOTE: artifact generation is now handled entirely by the streaming
    // finalize endpoint in /api/jobs/[id]/live — no need for separate
    // requestArtifact() calls here. The streaming events will update the
    // UI progress via onFinalized / onFinalizeSettled callbacks.
  }


  function handleLiveFinalizeSettled(payload: { success: boolean; statusText: string }) {
    if (payload.success) {
      return;
    }

    setPendingArtifactKinds((prev) => prev.filter((kind) => !isPrimaryArtifactKind(kind)));
    clearPrimaryProgress([...PRIMARY_ARTIFACT_KINDS]);
    setStudioFeedback(payload.statusText);
  }

  async function ensureLiveJob() {
    console.log(`[KemoWorkspace] ensureLiveJob called. selectedProjectId=${selectedProjectId} selectedJob?.id=${selectedJob?.id} selectedJob?.capture_mode=${selectedJob?.capture_mode} selectedJob?.status=${selectedJob?.status}`);
    if (!selectedProjectId) {
      console.warn(`[KemoWorkspace] ensureLiveJob: no selectedProjectId, opening new project dialog`);
      setNewProjectOpen(true);
      return { jobId: null, statusText: projectLockedReason };
    }

    const reusableJob =
      selectedJob &&
      selectedJob.project_id === selectedProjectId &&
      selectedJob.capture_mode === "live" &&
      !["completed", "failed"].includes(selectedJob.status || "")
        ? selectedJob
        : null;

    if (reusableJob) {
      console.log(`[KemoWorkspace] ensureLiveJob: reusing existing job ${reusableJob.id}`);
      return { jobId: reusableJob.id, statusText: "\u5df2\u63a5\u5165\u5f53\u524d\u5b9e\u65f6\u8bbf\u8c08" };
    }

    console.log(`[KemoWorkspace] ensureLiveJob: creating new job for project ${selectedProjectId}`);
    const title = `\u5b9e\u65f6\u8bbf\u8c08 ${new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          projectId: selectedProjectId,
          sourceType: "live_capture",
          captureMode: "live",
        }),
      });
      const json = await res.json();
      console.log(`[KemoWorkspace] ensureLiveJob: POST /api/jobs response ok=${res.ok} json.ok=${json.ok}`);

      if (!res.ok || !json.ok) {
        console.error(`[KemoWorkspace] ensureLiveJob: failed to create job:`, json?.error);
        return { jobId: null, statusText: json?.error?.message || "\u65e0\u6cd5\u521b\u5efa\u5b9e\u65f6\u8bbf\u8c08" };
      }

      const createdJob = json.data.job as JobRow;
      console.log(`[KemoWorkspace] ensureLiveJob: created job ${createdJob.id}`);
      handleJobCreated(createdJob);
      return { jobId: createdJob.id, statusText: "\u5df2\u521b\u5efa\u5b9e\u65f6\u8bbf\u8c08" };
    } catch (err) {
      console.error(`[KemoWorkspace] ensureLiveJob: exception:`, err);
      return { jobId: null, statusText: err instanceof Error ? err.message : "\u521b\u5efa\u5b9e\u65f6\u8bbf\u8c08\u5f02\u5e38" };
    }
  }

  async function handleLiveInterviewUploadFile(file: File) {
    const { jobId, statusText } = await ensureLiveJob();
    if (!jobId) {
      window.alert(`\u521b\u5efa\u4efb\u52a1\u5931\u8d25: ${statusText}`);
      return;
    }

    setLiveCaptureStatus("\u6b63\u5728\u4e0a\u4f20\u6587\u4ef6...");
    setStudioFeedback("\u6b63\u5728\u4e0a\u4f20\u9644\u4ef6\u5e76\u5206\u914d\u79bb\u7ebf\u4efb\u52a1...");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      
      const res = await fetch(`/api/jobs/${jobId}/upload`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        window.alert(json?.error?.message || "\u4e0a\u4f20\u5904\u7406\u5931\u8d25");
        setLiveCaptureStatus("\u4e0a\u4f20\u5931\u8d25");
        return;
      }
      
      const updatedJob = json.data.job as JobRow;
      setJobState((prev) => [updatedJob, ...prev.filter((j) => j.id !== updatedJob.id)]);
      setLiveCaptureStatus("\u6587\u4ef6\u5df2\u4e0a\u4f20\uff0c\u540e\u53f0\u6b63\u5728\u79bb\u7ebf\u5168\u81ea\u52a8\u5904\u7406");
      setInterviewDraftMode(null);
      setCenterSection("tasks");
    } catch (err) {
      window.alert("\u4e0a\u4f20\u5f02\u5e38\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5");
      setLiveCaptureStatus("\u4e0a\u4f20\u5f02\u5e38");
    }
  }

  function toggleProjectExpanded(projectId: string) {
    setSwipedProjectId(null);
    setExpandedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((item) => item !== projectId) : [...prev, projectId]
    );
  }

  function activateProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedJobId(null);
    setSelectedSourceId(null);
    setCenterSection("tasks");
    setInterviewDraftMode(null);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
    setSidebarSearchOpen(false);
    setExpandedProjectIds((prev) => (prev.includes(projectId) ? prev : [...prev, projectId]));
    setSwipedProjectId(null);
    setSwipedJobId(null);
  }

  function activateProjectJob(projectId: string, jobId: string) {
    setSelectedProjectId(projectId);
    setSelectedJobId(jobId);
    setSelectedSourceId(null);
    setCenterSection("tasks");
    setInterviewDraftMode(null);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
    setSidebarSearchOpen(false);
    setSwipedProjectId(null);
    setSwipedJobId(null);
  }

  async function openNewInterviewForProject(projectId: string) {
    if (!expandedProjectIds.includes(projectId)) {
      setExpandedProjectIds((prev) => [...prev, projectId]);
    }
    setSelectedProjectId(projectId);
    
    // Create a new blank live job unit
    const title = `\u5b9e\u65f6\u8bbf\u8c08`;

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          projectId: projectId,
          sourceType: "live_capture",
          captureMode: "live",
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok && json.data?.job) {
        handleJobCreated(json.data.job);
        setSelectedJobId(json.data.job.id);
      }
    } catch (e) {
      console.error(e);
    }
    
    setSelectedSourceId(null);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
    setInterviewDraftMode("live");
    setCenterSection("interview");
  }

  function openLiveStarter(mode: CaptureMode = "mic") {
    setPreferredCaptureMode(mode);
    if (!hasSelectedProject) {
      setInterviewDraftMode("live");
      setCenterSection("interview");
      setNewProjectOpen(true);
      return;
    }

    setSelectedJobId(null);
    setSelectedSourceId(null);
    setInterviewDraftMode("live");
    setCenterSection("interview");
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
  }

  function openFileStarter(entry: NewJobStarterPreference = "selection") {
    setPreferredFileEntry(entry);
    if (!hasSelectedProject) {
      setInterviewDraftMode("file");
      setCenterSection("interview");
      setNewProjectOpen(true);
      return;
    }

    setSelectedJobId(null);
    setSelectedSourceId(null);
    setInterviewDraftMode("file");
    setCenterSection("interview");
  }

  function getJobDisplayTitle(job: JobRow) {
    const transcriptText =
      transcripts.find((item) => item.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const normalized = transcriptText.replace(/\s+/g, " ").trim();
    const summary = normalized ? `${normalized.slice(0, 32)}${normalized.length > 32 ? "\u2026" : ""}` : null;
    const title = (job.title || "").trim();

    if (title) {
      return title;
    }

    if (summary) {
      return summary;
    }

    return "\u672a\u547d\u540d\u8bbf\u8c08";
  }

  function getArtifactDownloadPath(artifact: WorkspaceArtifact) {
    const metadata = artifact.metadata as Record<string, unknown> | null;
    const metadataPath = typeof metadata?.download_path === "string" ? metadata.download_path : null;
    if (metadataPath) return metadataPath;
    if (artifact.kind === "roadshow_transcript" || artifact.kind === "meeting_minutes") {
      return `/api/artifacts/${artifact.id}/download`;
    }
    return null;
  }

  function openArtifactPreview(artifact: WorkspaceArtifact | null) {
    if (!artifact) {
      return;
    }

    setPreviewArtifactId(artifact.id);
  }

  function getArtifactBody(artifact: WorkspaceArtifact | null) {
    if (!artifact) {
      return "";
    }

    return artifact.kind === "publish_script"
      ? parseArtifactContent(artifact.content || "").body
      : artifact.content || "";
  }

  function getArtifactHeadline(artifact: WorkspaceArtifact | null) {
    if (!artifact) {
      return "";
    }

    const candidates = [artifact.summary || "", getArtifactBody(artifact)]
      .flatMap((text) => text.split("\n"))
      .map((line) =>
        line
          .replace(/^#+\s*/, "")
          .replace(/^[-*]\s*/, "")
          .replace(/^\d+[.\u3001]\s*/, "")
          .replace(/\*\*/g, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
      .filter((line) => !["\u603b\u89c8\uff1a", "\u91cd\u70b9\uff1a", "\u5f85\u786e\u8ba4\u9879", "\u8349\u6848\u7248\u6b63\u6587"].includes(line));

    const headline = candidates.find((line) => line.length >= 8) || candidates[0] || artifact.title;
    return headline.length > 48 ? `${headline.slice(0, 48)}\u2026` : headline;
  }

  function getArtifactUpdatedLabel(artifact: WorkspaceArtifact | null) {
    if (!artifact) {
      return "\u7b49\u5f85\u672c\u8f6e\u751f\u6210";
    }

    return new Date(artifact.updated_at || artifact.created_at).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function shareArtifact(artifact: WorkspaceArtifact) {
    const title = getArtifactHeadline(artifact);
    const body = getArtifactBody(artifact).trim();
    const text = [title, body].filter(Boolean).join("\n\n");

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title,
          text,
        });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStudioFeedback(`\u5df2\u590d\u5236\u300c${title}\u300d\u5185\u5bb9\uff0c\u53ef\u76f4\u63a5\u8f6c\u53d1`);
        return;
      }
    } catch {
      // clipboard fallback continues below
    }

    setStudioFeedback("\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u76f4\u63a5\u8f6c\u53d1");
  }

  function renderProgressSnapshot(progress: PrimaryArtifactProgressSnapshot, key: string, compact = false) {
    return (
      <div className={`workspace-progress-block ${compact ? "workspace-progress-block-compact" : ""}`}>
        {!compact ? (
          <div className="workspace-progress-meta">
            <span>{progress.label}</span>
            <span>{progress.stageLabel}</span>
          </div>
        ) : null}
        <div className="workspace-progress-track workspace-progress-track-steps" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={`${key}-${step}`}
              className={[
                "workspace-progress-step",
                `workspace-progress-step-index-${step}`,
                progress.stage >= step ? "workspace-progress-step-active" : "",
                progress.stage >= step && progress.tone !== "idle" ? `workspace-progress-step-${progress.tone}` : "",
                progress.stage === step && progress.tone !== "ready" ? "workspace-progress-step-current" : "",
              ].filter(Boolean).join(" ")}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderPrimaryProgress(kind: PrimaryArtifactKind, compact = false) {
    return renderProgressSnapshot(primaryProgressByKind[kind], kind, compact);
  }

  function getArtifactProgressSnapshot(
    artifact: WorkspaceArtifact | null,
    isPending: boolean
  ): PrimaryArtifactProgressSnapshot {
    if (isPending) {
      return {
        label: "\u751f\u6210\u4e2d",
        tone: "running",
        stage: 2,
        stageLabel: "\u5904\u7406\u4e2d",
      };
    }

    if (!artifact) {
      return {
        label: "\u5f85\u751f\u6210",
        tone: "idle",
        stage: 0,
        stageLabel: "\u672a\u5f00\u59cb",
      };
    }

    if (artifact.status === "draft") {
      return {
        label: "\u5b9e\u65f6\u8349\u7a3f",
        tone: "draft",
        stage: 1,
        stageLabel: "\u8349\u7a3f",
      };
    }

    return {
      label: "\u5df2\u5b8c\u6210",
      tone: "ready",
      stage: 3,
      stageLabel: "\u5df2\u5b8c\u6210",
    };
  }

  function getSkillProgressSnapshot(
    kind: ArtifactKind,
    options?: {
      artifacts?: WorkspaceArtifact[];
      pendingKinds?: ReadonlySet<ArtifactKind>;
      useSelectedPrimaryProgress?: boolean;
    }
  ): PrimaryArtifactProgressSnapshot {
    const artifacts = options?.artifacts ?? selectedArtifacts;
    const pendingKinds = options?.pendingKinds ?? pendingArtifactKindSet;
    const useSelectedPrimaryProgress = options?.useSelectedPrimaryProgress ?? true;

    if (isPrimaryArtifactKind(kind) && useSelectedPrimaryProgress) {
      return primaryProgressByKind[kind];
    }

    const artifact = artifacts.find((candidate) => candidate.kind === kind) || null;
    const isPending = pendingKinds.has(kind);

    return getArtifactProgressSnapshot(artifact, isPending);
  }

  function renderArtifactCard(artifact: WorkspaceArtifact) {
    const parsedArtifact = artifact.kind === "publish_script"
      ? parseArtifactContent(artifact.content || "")
      : null;
    const isRefreshing = pendingArtifactKindSet.has(artifact.kind as ArtifactKind);
    const primaryKind = isPrimaryArtifactKind(artifact.kind) ? artifact.kind : null;
    const accentFillClass = isDarkTheme ? darkAccentFillClass : lightAccentFillClass;

    return (
      <section key={artifact.id} className="workspace-task-card">
        <header className="workspace-task-card-head">
          <div className="workspace-card-title-row">
            {isRefreshing ? (
              <Loader2 className="workspace-card-title-icon animate-spin" />
            ) : (
              <Bot className="workspace-card-title-icon" />
            )}
            <div className="min-w-0">
              <h4 className="workspace-heading text-[1rem]">{artifact.title}</h4>
              <p className="workspace-muted-copy">
                {isRefreshing ? "\u66f4\u65b0\u4e2d" : artifact.status === "draft" ? "\u5b9e\u65f6\u8349\u7a3f" : artifact.status || artifact.kind}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void shareArtifact(artifact)}
              className="workspace-inline-action"
              aria-label={`\u8f6c\u53d1${artifact.title}`}
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleFavorite(artifact)}
              className="workspace-inline-action"
              aria-label={favoriteArtifactIds.has(artifact.id) ? `\u53d6\u6d88\u6536\u85cf${artifact.title}` : `\u6536\u85cf${artifact.title}`}
            >
              <Star className={`h-4 w-4 ${favoriteArtifactIds.has(artifact.id) ? accentFillClass : ""}`} />
            </button>
          </div>
        </header>

        {primaryKind ? renderPrimaryProgress(primaryKind) : null}

        {artifact.kind === "publish_script" && parsedArtifact?.clarificationItems.length ? (
          <section className="workspace-clarification-card">
            <div className="workspace-clarification-head">
              <div>
                <p className="workspace-kicker">\u5f85\u786e\u8ba4</p>
                <h5 className="workspace-heading text-[0.96rem]">\u5148\u5728\u8fd9\u91cc\u786e\u8ba4\uff0c\u518d\u91cd\u751f\u6210\u6b63\u6587</h5>
              </div>
              <span className="workspace-status-pill">{parsedArtifact.clarificationItems.length} \u9879</span>
            </div>
            <div className="workspace-clarification-grid">
              {parsedArtifact.clarificationItems.map((item, index) => (
                <label key={item.question} className="workspace-clarification-field">
                  <span className="workspace-clarification-label">{index + 1}. {item.question}</span>
                  {item.context ? (
                    <span className="workspace-clarification-context">{item.context}</span>
                  ) : null}
                  <Textarea
                    value={clarificationAnswers[item.question] || ""}
                    onChange={(event) =>
                      setClarificationAnswers((prev) => ({
                        ...prev,
                        [item.question]: event.target.value,
                      }))
                    }
                    className="workspace-clarification-input"
                    placeholder={"\u8bf7\u8865\u5145\u4e8b\u5b9e\u3001\u89c2\u70b9\u6216\u5f85\u786e\u8ba4\u4fe1\u606f"}
                    rows={2}
                  />
                </label>
              ))}
            </div>
            <div className="workspace-clarification-actions">
              <Button
                type="button"
                onClick={() => void submitClarifications()}
                disabled={!canSubmitClarifications || isSavingClarifications}
                className="workspace-primary-button"
              >
                {isSavingClarifications ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {"\u786e\u8ba4\u5e76\u91cd\u65b0\u751f\u6210"}
              </Button>
              <p className="workspace-muted-copy">
                {isLoadingClarifications ? "\u6b63\u5728\u6574\u7406\u5f85\u786e\u8ba4\u9879\uff0c\u8bf7\u7a0d\u5019" : "\u786e\u8ba4\u540e\u4f1a\u5237\u65b0\u53d1\u5e03\u7a3f\u3001\u6458\u8981\u548c\u8ffd\u95ee"}
              </p>
            </div>
          </section>
        ) : null}

        <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
          {(artifact.kind === "publish_script" ? parsedArtifact?.body : artifact.content) || "\u6682\u65e0\u5185\u5bb9"}
        </div>
        <div className="workspace-artifact-footer">
          <span className="workspace-muted-copy">{getArtifactUpdatedLabel(artifact)}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="workspace-chip-button" onClick={() => openArtifactPreview(artifact)}>
              <ExternalLink className="h-3.5 w-3.5" />
              {"\u67e5\u770b\u5168\u6587"}
            </button>
            {getArtifactDownloadPath(artifact) ? (
              <a href={getArtifactDownloadPath(artifact) || undefined} className="workspace-chip-button">
                <Download className="h-3.5 w-3.5" />
                {"\u5bfc\u51fa docx"}
              </a>
            ) : null}
          </div>
        </div>
        {artifact.audio_url ? (
          <audio controls className="mt-2 w-full">
            <source src={artifact.audio_url} />
          </audio>
        ) : null}
      </section>
    );
  }

  function getSkillDisplay(kind: ArtifactKind) {
    if (isPrimaryArtifactKind(kind)) {
      return {
        title: getArtifactLabel(kind, localeKey),
        icon: PRIMARY_ARTIFACT_CONFIG[kind].icon,
      };
    }

    const item = FILE_SKILL_ITEMS.find((candidate) => candidate.kind === kind);
    return {
      title: item?.title || getArtifactLabel(kind, localeKey),
      icon: item?.icon || Sparkles,
    };
  }

  function toggleExpandedPanel(panelId: string) {
    setExpandedPanels((prev) => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));
  }

  function openInlineAction(job: JobRow | null, kind: ArtifactKind) {
    if (!job) {
      return;
    }

    if (job.project_id) {
      activateProjectJob(job.project_id, job.id);
    } else {
      setSelectedJobId(job.id);
    }

    setCenterSection("tasks");
    setSelectedSkillKind(kind);
    setOpenedSkillKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
    setCollapsedSkillKinds((prev) => ({ ...prev, [kind]: false }));

    if (isPrimaryArtifactKind(kind)) {
      setActivePrimaryKind(kind as PrimaryArtifactKind);
    }

    if (selectedJob?.id === job.id) {
      const hasArtifact = selectedArtifacts.some((artifact) => artifact.kind === kind);
      if (!hasArtifact && !pendingArtifactKindSet.has(kind)) {
        void generateArtifact(kind);
      }
    }

    setSkillDialogFocusKind(kind);
    openSkillDialogForJob(job.id);
  }

  function renderInlineActionBar(job: JobRow | null, options?: { homeMode?: boolean; className?: string }) {
    if (!job) {
      return null;
    }

    const actionKinds = job.capture_mode === "live"
      ? (["quick_summary", "publish_script", "inspiration_questions"] as ArtifactKind[])
      : (["meeting_minutes", "quick_summary", "publish_script", "inspiration_questions"] as ArtifactKind[]);

    return (
      <section className={`${workspacePanelClass} p-4 ${options?.className || ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={workspaceEyebrowClass}>{ui.skillDeck}</p>
            <p className={`mt-1 text-xs ${workspaceMutedCopyClass}`}>{getJobDisplayTitle(job)}</p>
          </div>
          <button
            type="button"
            onClick={() => openSkillDialogForJob(job.id)}
            className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${workspaceGhostButtonClass}`}
          >
            {ui.processSkills}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {actionKinds.map((kind) => {
            const { title, icon: Icon } = getSkillDisplay(kind);
            const isPending = selectedJob?.id === job.id && pendingArtifactKindSet.has(kind);
            const isActive = selectedSkillKind === kind;

            return (
              <button
                key={`inline-action-${job.id}-${kind}`}
                type="button"
                onClick={() => options?.homeMode ? focusHomeAction(kind, isPrimaryArtifactKind(kind)) : openInlineAction(job, kind)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                  isActive
                    ? (isDarkTheme
                        ? "border-[#48F9DB]/30 bg-white/[0.05] text-white"
                        : "border-[#d8c0ab] bg-white/90 text-[#1a1c1c]")
                    : workspaceGhostButtonClass
                }`}
              >
                {isPending ? (
                  <Loader2 className={`h-4 w-4 animate-spin ${workspaceButtonTextClass}`} />
                ) : (
                  <Icon className={`h-4 w-4 ${isActive ? workspaceButtonTextClass : workspaceSoftTextClass}`} />
                )}
                <span>{title}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderExpandablePanel({
    id,
    eyebrow,
    title,
    body,
    emptyCopy,
    meta,
    className = "",
  }: {
    id: string;
    eyebrow: string;
    title: string;
    body: string;
    emptyCopy: string;
    meta?: string;
    className?: string;
  }) {
    const isExpanded = Boolean(expandedPanels[id]);
    const hasBody = Boolean(body?.trim());
    const clampStyle: CSSProperties = isExpanded
      ? {}
      : {
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 7,
          overflow: "hidden",
        };

    return (
      <section className={`${workspacePanelClass} p-6 ${className}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={workspaceEyebrowClass}>{eyebrow}</p>
            <h3 className={`mt-2 truncate text-lg font-bold ${workspaceStrongTextClass}`} title={title}>
              {title}
            </h3>
          </div>
          {meta ? (
            <span className={`shrink-0 text-xs ${workspaceMutedCopyClass}`}>
              {meta}
            </span>
          ) : null}
        </div>
        <div className={`${workspaceSubtlePanelClass} mt-4 p-5`}>
          <p style={clampStyle} className={`whitespace-pre-wrap text-sm leading-7 ${workspaceBodyTextClass}`}>
            {hasBody ? body : emptyCopy}
          </p>
          {hasBody && body.length > 180 ? (
            <button
              type="button"
              onClick={() => toggleExpandedPanel(id)}
              className={`mt-4 text-xs font-black uppercase tracking-[0.18em] ${workspaceButtonTextClass}`}
            >
              {isExpanded ? (localeKey === "zh" ? "收起" : "Collapse") : (localeKey === "zh" ? "展开" : "Expand")}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  function renderPageStatusStrip({
    label,
    title,
    detail,
    action,
    showThemeSwitcher = true,
  }: {
    label: string;
    title: string;
    detail?: string;
    action?: ReactNode;
    showThemeSwitcher?: boolean;
  }) {
    return (
      <section className={`${workspacePanelClass} px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={workspaceEyebrowClass}>{label}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className={`truncate text-lg font-bold ${workspaceStrongTextClass}`}>{title}</h1>
              {detail ? (
                <span className={`truncate text-xs uppercase tracking-[0.18em] ${workspaceMutedCopyClass}`}>{detail}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {action}
            {showThemeSwitcher ? <WorkspaceThemeSwitcher /> : null}
          </div>
        </div>
      </section>
    );
  }

  function renderProcessTicker() {
    return null;
  }


  function renderSkillOutputCard(
    kind: ArtifactKind,
    options?: {
      artifacts?: WorkspaceArtifact[];
      pendingKinds?: ReadonlySet<ArtifactKind>;
      theme?: WorkspaceTone;
      useSelectedPrimaryProgress?: boolean;
    }
  ) {
    const artifacts = options?.artifacts ?? selectedArtifacts;
    const theme = options?.theme ?? "light";
    const accentTextClass = theme === "dark" ? darkAccentTextClass : lightAccentTextClass;
    const accentFillClass = theme === "dark" ? darkAccentFillClass : lightAccentFillClass;
    const themeCardClass = theme === "dark"
      ? "border-white/8 bg-white/[0.03] text-[#e5e2e3] shadow-[0_24px_72px_rgba(0,0,0,0.2)]"
      : "border-[#eadfce] bg-[#fffdf9] text-[#1a1c1c]";
    const themePreviewClass = theme === "dark"
      ? "border border-white/6 bg-black/20 text-[#c2ccca]"
      : "border border-[#eadfce] bg-[#fff8f0] text-[#5f5e60]";
    const themeActionClass = theme === "dark"
      ? "border-white/10 bg-white/[0.03] text-[#c7d2cf] hover:border-[#00dcbf]/24 hover:text-[#48F9DB]"
      : "border-[#eadfce] bg-[#fff8f0] text-[#7c6f66] hover:border-[#d8c0ab] hover:text-[#8a5a3c]";
    const artifact = artifacts.find((candidate) => candidate.kind === kind) || null;
    const progress = getSkillProgressSnapshot(kind, {
      artifacts,
      pendingKinds: options?.pendingKinds,
      useSelectedPrimaryProgress: options?.useSelectedPrimaryProgress,
    });
    const { title, icon: Icon } = getSkillDisplay(kind);
    const isCollapsed = Boolean(collapsedSkillKinds[kind]);
    const isCurrent = selectedSkillKind === kind;
    const isFavorite = artifact ? favoriteArtifactIds.has(artifact.id) : false;
    const content = artifact
      ? getArtifactBody(artifact).trim() || artifact.summary?.trim() || artifact.content?.trim() || ""
      : "";
    const fallbackContent = progress.tone === "running" ? "\u6b63\u5728\u751f\u6210\u4e2d..." : "\u7b49\u5f85\u751f\u6210";

    return (
      <section
        key={`skill-output-${kind}`}
        className={[
          "workspace-primary-progress-card",
          "workspace-skill-output-card",
          "workspace-skill-output-card-active text-sm leading-relaxed",
          themeCardClass,
          isCurrent ? "workspace-skill-output-card-current" : "",
        ].filter(Boolean).join(" ")}
      >
        <div className="workspace-primary-progress-card-head workspace-skill-output-card-head">
          <div className="workspace-card-title-row">
            {progress.tone === "running" ? (
              <Loader2 className={`workspace-card-title-icon animate-spin ${accentTextClass}`} />
            ) : (
              <Icon className={`workspace-card-title-icon ${accentTextClass}`} />
            )}
            <h4 className="workspace-heading text-[1rem]">{title}</h4>
          </div>
          <div className="workspace-skill-output-card-actions">
            <button
              type="button"
              className={`workspace-inline-action ${themeActionClass}`}
              onClick={() =>
                setCollapsedSkillKinds((prev) => ({
                  ...prev,
                  [kind]: !prev[kind],
                }))
              }
              aria-label={isCollapsed ? "\u5c55\u5f00\u5361\u7247" : "\u6536\u8d77\u5361\u7247"}
              title={isCollapsed ? "\u5c55\u5f00\u5361\u7247" : "\u6536\u8d77\u5361\u7247"}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
            </button>
            <button
              type="button"
              className={`workspace-inline-action ${themeActionClass}`}
              onClick={() => {
                if (artifact) {
                  void toggleFavorite(artifact);
                }
              }}
              aria-label={isFavorite ? "\u53d6\u6d88\u6536\u85cf" : "\u6536\u85cf"}
              title={isFavorite ? "\u53d6\u6d88\u6536\u85cf" : "\u6536\u85cf"}
              disabled={!artifact}
            >
              <Star className={`h-4 w-4 ${isFavorite ? accentFillClass : ""}`} />
            </button>
          </div>
        </div>
        <div className={theme === "dark" ? "[&_.workspace-progress-meta]:text-[#8fa39d] [&_.workspace-progress-track]:bg-black/20" : ""}>
          {renderProgressSnapshot(progress, `skill-${kind}`, true)}
        </div>
        {!isCollapsed ? (
          <div className={`workspace-skill-output-preview ${themePreviewClass}`} style={{ WebkitLineClamp: 5, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>
            {content || fallbackContent}
          </div>
        ) : null}
      </section>
    );
  }

  function renderSkillOutputCards(
    forcedKinds?: ArtifactKind[],
    emptyCopy?: string,
    options?: {
      artifacts?: WorkspaceArtifact[];
      pendingKinds?: ReadonlySet<ArtifactKind>;
      theme?: WorkspaceTone;
      useSelectedPrimaryProgress?: boolean;
      hasStartedOverride?: boolean;
    }
  ) {
    const skillKinds = forcedKinds?.length ? forcedKinds : openedSkillKinds;
    const isForcedStack = Boolean(forcedKinds?.length);
    const hasStartedForStack = options?.hasStartedOverride ?? hasStarted;

    if ((!hasStartedForStack && !isForcedStack) || !skillKinds.length) {
      return (
        <div className={`workspace-empty-card workspace-skill-output-empty ${options?.theme === "dark" ? "border-white/8 bg-white/[0.03]" : "border-[#dacfc3] bg-white/90"}`}>
          <p className={`workspace-skill-output-empty-copy ${options?.theme === "dark" ? "text-[#8fa39d]" : "text-[#5f5e60]"}`}>
            {emptyCopy || (hasStartedForStack
              ? "\u9009\u62e9\u4e00\u4e2a skill\uff0c\u8f93\u51fa\u4f1a\u663e\u793a\u5728\u8fd9\u91cc"
              : "\u5f00\u59cb\u4e00\u6761\u6765\u6e90\u540e\uff0c\u9009\u62e9 skill \u7ee7\u7eed\u63a8\u8fdb")}
          </p>
        </div>
      );
    }

    return (
      <div className="workspace-skill-output-stack">
        {skillKinds.map((kind) => renderSkillOutputCard(kind, options))}
      </div>
    );
  }

  function renderCenterEmptyState(mode: "project" | "source") {
    return (
      <div className={`workspace-center-empty-content ${mode === "project" ? "workspace-center-empty-content-project" : ""}`.trim()}>
        <div className="workspace-center-empty-mark" aria-hidden="true">
          <KemoMark className="h-10 w-10" />
        </div>
        <h2 className="workspace-center-empty-title">Kemo</h2>
        <p className="workspace-center-empty-copy">{"\u9009\u62e9\u6216\u65b0\u5efa\u6765\u6e90\u4ee5\u5f00\u59cb"}</p>
        <div className="workspace-center-empty-actions">
          <Button type="button" className="workspace-primary-button" onClick={() => openLiveStarter()}>
            {"\u5b9e\u65f6\u6a21\u5f0f"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => openFileStarter()}>
            {"\u6587\u4ef6\u6a21\u5f0f"}
          </Button>
        </div>
      </div>
    );
  }

  const activeSource = selectedSource || projectSources[0] || null;
  const activePrimaryArtifact = primaryArtifactsByKind[activePrimaryKind];
  const activePrimaryConfig = PRIMARY_ARTIFACT_CONFIG[activePrimaryKind];

  function renderInterviewModeCard({
    icon: Icon,
    title,
    symbols,
    onClick,
  }: {
    icon: LucideIcon;
    title: string;
    symbols: LucideIcon[];
    onClick: () => void;
  }) {
    return (
      <button type="button" onClick={onClick} className="workspace-interview-mode-card">
        <span className="workspace-interview-mode-icon">
          <Icon className="h-5 w-5" />
        </span>
        <span className="workspace-interview-mode-copy">
          <span className="workspace-interview-mode-title">{title}</span>
          <span className="workspace-interview-mode-symbols" aria-hidden="true">
            {symbols.map((SymbolIcon, index) => (
              <span key={`${title}-${index}`} className="workspace-interview-mode-symbol">
                <SymbolIcon className="h-3.5 w-3.5" />
              </span>
            ))}
          </span>
        </span>
      </button>
    );
  }

  function resetInterviewStarter() {
    setInterviewDraftMode(null);
    setSelectedJobId(null);
    setSelectedSourceId(null);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("\u51c6\u5907\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08");
  }

  function renderActivePrimaryTaskPanel(layout: "center" | "docked" = "center") {
    const shellClass = layout === "center" ? "workspace-center-primary-card" : "workspace-live-docked-primary-card";

    return (
      <div className={shellClass}>
        {activePrimaryArtifact ? (
          renderArtifactCard(activePrimaryArtifact)
        ) : (
          <section className="workspace-task-card workspace-task-card-ghost">
            <header className="workspace-task-card-head">
              <div className="workspace-card-title-row">
                <activePrimaryConfig.icon className="workspace-card-title-icon" />
                <div className="min-w-0">
                  <h4 className="workspace-heading text-[1rem]">{getArtifactLabel(activePrimaryKind, localeKey)}</h4>
                  <p className="workspace-muted-copy">{primaryProgressByKind[activePrimaryKind].label}</p>
                </div>
              </div>
            </header>
            {renderPrimaryProgress(activePrimaryKind)}
            <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
              {activePrimaryConfig.placeholder}
            </div>
          </section>
        )}
      </div>
    );
  }

  function renderLiveTranscriptFocusCard() {
    return (
      <div className="workspace-center-primary-card">
        <section className="workspace-task-card workspace-live-focus-card">
          <header className="workspace-task-card-head">
            <div className="workspace-card-title-row">
              <NotebookText className="workspace-card-title-icon" />
              <div className="min-w-0">
                <h4 className="workspace-heading text-[1rem]">{"\u5b9e\u65f6\u8f6c\u5199"}</h4>
                <p className="workspace-muted-copy">
                  {selectedJob?.status === "completed" ? "\u8bbf\u8c08\u5df2\u7ed3\u675f\uff0c\u4ee5\u4e0b\u4e3a\u6574\u7406\u540e\u7684\u5b8c\u6574\u8f6c\u5199" : liveCaptureStatus}
                </p>
              </div>
            </div>
          </header>
          <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
            {transcriptContent ? (
              transcriptContent
            ) : (
              <div className="flex h-40 items-center justify-center gap-2 text-[#94a3b8]" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span key={`focus-transcript-dot-${index}`} className="h-1.5 w-1.5 rounded-full bg-current/80" />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderInterviewStarterContent() {
    if (!interviewDraftMode) {
      return (
        <div className="workspace-interview-starter">
          <div className="workspace-interview-mode-grid">
            {renderInterviewModeCard({
              icon: AudioLines,
              title: "\u5b9e\u65f6",
              symbols: [Mic, ScreenShare, Radio],
              onClick: openLiveStarter,
            })}
            {renderInterviewModeCard({
              icon: Upload,
              title: "\u6587\u4ef6",
              symbols: [Upload, Link2],
              onClick: openFileStarter,
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="workspace-interview-starter-shell">
        <div className="workspace-interview-starter-head workspace-interview-starter-head-minimal">
          <button type="button" onClick={resetInterviewStarter} className="workspace-inline-action" aria-label={"\u8fd4\u56de\u6a21\u5f0f\u9009\u62e9"}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        {interviewDraftMode === "live" ? (
          <LiveInterviewPanel
            onTranscriptChange={setLiveTranscriptSnapshot}
            onStatusChange={setLiveCaptureStatus}
            onEnsureJob={ensureLiveJob}
            onFinalizeStarted={handleLiveFinalizeStarted}
            onFinalizeSettled={handleLiveFinalizeSettled}
            onFinalized={handleLiveFinalized}
            onUploadFile={handleLiveInterviewUploadFile}
            preferredCaptureMode={preferredCaptureMode}
            disabled={!hasSelectedProject}
            disabledReason={projectLockedReason}
            compact={false}
          />
        ) : (
          <NewJobForm
            embedded
            plan={plan}
            projectId={selectedProjectId}
            preferredEntry={preferredFileEntry}
            onCreated={handleJobCreated}
            onImportedSource={handleSourceImported}
          />
        )}
      </div>
    );
  }
  void renderCenterEmptyState;
  void renderActivePrimaryTaskPanel;
  void renderLiveTranscriptFocusCard;
  void renderInterviewStarterContent;

  function getJobSummaryPreview(job: JobRow): string {
    const summaryArtifact = artifactState.find(
      (a) => a.job_id === job.id && a.kind === "quick_summary" && (a.summary || a.content)
    );
    if (summaryArtifact) {
      const text = (summaryArtifact.summary || summaryArtifact.content || "")
        .replace(/^#+\s*/gm, "")
        .replace(/\*\*/g, "")
        .replace(/[-*]\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > 60 ? `${text.slice(0, 60)}\u2026` : text;
    }
    const transcriptText =
      transcripts.find((t) => t.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const normalized = transcriptText.replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized.length > 60 ? `${normalized.slice(0, 60)}\u2026` : normalized;
    }
    return "";
  }
  function formatRelativeTime(value: string) {
    const delta = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.round(delta / 60000));

    if (minutes < 60) {
      return isZh ? `${minutes}\u5206\u949f\u524d` : `${minutes}m ago`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return isZh ? `${hours}\u5c0f\u65f6\u524d` : `${hours}h ago`;
    }

    const days = Math.round(hours / 24);
    return isZh ? `${days}\u5929\u524d` : `${days}d ago`;
  }

  function getStatusLabel(status?: string | null) {
    const lookup: Record<string, string> = {
      pending: isZh ? "\u5f85\u5904\u7406" : "Pending",
      queued: isZh ? "\u961f\u5217\u4e2d" : "Queued",
      transcribing: isZh ? "\u8f6c\u5199\u4e2d" : "Transcribing",
      extracting_terms: isZh ? "\u63d0\u53d6\u4e2d" : "Extracting",
      needs_review: isZh ? "\u5f85\u786e\u8ba4" : "Needs Review",
      summarizing: isZh ? "\u751f\u6210\u4e2d" : "Synthesizing",
      completed: isZh ? "\u5df2\u5b8c\u6210" : "Completed",
      failed: isZh ? "\u5931\u8d25" : "Failed",
    };

    if (!status) {
      return isZh ? "\u7a7a\u95f2" : "Idle";
    }

    return lookup[status] || status;
  }

  function getStatusProgress(status?: string | null) {
    const lookup: Record<string, number> = {
      pending: 12,
      queued: 22,
      transcribing: 42,
      extracting_terms: 66,
      needs_review: 84,
      summarizing: 92,
      completed: 100,
      failed: 100,
    };

    return lookup[status || ""] || 0;
  }

  function isInFlightJob(status?: string | null) {
    return Boolean(status && status !== "completed" && status !== "failed");
  }

  const latestSelectedProjectInFlightJob = selectedProjectId
    ? jobsByRecency.find((job) => isInFlightJob(job.status) && job.project_id === selectedProjectId) || null
    : null;
  const latestInFlightJob = jobsByRecency.find((job) => isInFlightJob(job.status)) || null;
  const processAnchorJob =
    (selectedJob && isInFlightJob(selectedJob.status) ? selectedJob : null) ||
    latestSelectedProjectInFlightJob ||
    latestInFlightJob ||
    selectedJob ||
    spotlightJob;
  const processAnchorProject =
    (processAnchorJob?.project_id ? projectState.find((project) => project.id === processAnchorJob.project_id) || null : null) ||
    selectedProject ||
    spotlightProject;
  const processArtifacts = useMemo(
    () => (processAnchorJob?.id ? sortWorkspaceArtifacts(artifactState.filter((artifact) => artifact.job_id === processAnchorJob.id)) : spotlightArtifacts),
    [artifactState, processAnchorJob?.id, spotlightArtifacts]
  );

  function focusHomeAction(kind: ArtifactKind, isPrimary = false) {
    if (!homeProject?.id || !homeJob?.id) {
      return;
    }

    activateProjectJob(homeProject.id, homeJob.id);
    setCenterSection("tasks");
    setInterviewDraftMode(null);
    setSelectedSkillKind(kind);
    setOpenedSkillKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
    setCollapsedSkillKinds((prev) => ({ ...prev, [kind]: false }));
    if (isPrimary) {
      setActivePrimaryKind(kind as PrimaryArtifactKind);
    }
    openSkillDialogForJob(homeJob.id);
  }

  const skillDialogJob = jobState.find((job) => job.id === skillDialogJobId) || null;
  const skillDialogProject =
    (skillDialogJob?.project_id ? projectState.find((project) => project.id === skillDialogJob.project_id) || null : null) ||
    null;
  const skillDialogArtifacts = useMemo(
    () => (skillDialogJobId ? sortWorkspaceArtifacts(artifactState.filter((artifact) => artifact.job_id === skillDialogJobId)) : selectedArtifacts),
    [artifactState, selectedArtifacts, skillDialogJobId]
  );
  const skillDialogPendingKindSet =
    skillDialogJob?.id && skillDialogJob.id === selectedJob?.id ? pendingArtifactKindSet : EMPTY_ARTIFACT_KIND_SET;
  const skillDialogKinds = skillDialogFocusKind ? [skillDialogFocusKind] : (skillDialogJob?.capture_mode === "live" ? LIVE_SKILL_KINDS : FILE_MODE_SKILL_KINDS);
  const lightAccentFillClass = "fill-[#8a5a3c] text-[#8a5a3c]";
  const darkAccentFillClass = "fill-[#00dcbf] text-[#00dcbf]";
  const lightAccentTextClass = "text-[#8a5a3c]";
  const darkAccentTextClass = "text-[#00dcbf]";

  const routeHrefByLanding: Record<KemoWorkspaceLanding, string> = {
    agent: `/${locale}/app/agent`,
    dashboard: `/${locale}/app/jobs`,
    interview: `/${locale}/app/capture`,
    workspace: `/${locale}/app/jobs`,
    capture: `/${locale}/app/capture`,
    processing: `/${locale}/app/process`,
    library: `/${locale}/app/library`,
  };
  const selectedJobQuery = selectedJobId ? `?job=${selectedJobId}` : "";
  const agentHref = `${routeHrefByLanding.agent}${selectedJobQuery}`;
  const dashboardHref = `${routeHrefByLanding.dashboard}${selectedJobQuery}`;
  const interviewHref = `${routeHrefByLanding.interview}${selectedJobQuery}`;
  const workspaceHref = `${routeHrefByLanding.workspace}${selectedJobQuery}`;
  const captureHref = `${routeHrefByLanding.capture}${selectedJobQuery}`;
  const processingHref = `${routeHrefByLanding.processing}${selectedJobQuery}`;
  const libraryHref = `${routeHrefByLanding.library}${selectedJobQuery}`;
  const totalJobs = jobState.length;
  const recentActivity = jobsByRecency.slice(0, 3);
  const systemLoad = totalJobs ? Math.min(94, Math.max(18, Math.round((pendingArtifactKinds.length + (selectedJob?.status === "completed" ? 1 : 2)) / Math.max(totalJobs, 1) * 24))) : 24;
  const selectedJobProgress = getStatusProgress(selectedJob?.status);
  const workspaceTheme = useWorkspaceResolvedTheme() as WorkspaceTone;
  const currentTone: WorkspaceTone = workspaceTheme;
  const isDarkTheme = currentTone === "dark"; 
  const skillDialogTone: WorkspaceTone = processSkillsOpen ? currentTone : skillDialogVariant;
  const lightCanvasClass = "bg-[#f4f9f7] text-[#1c2220]";
  const lightPanelClass =
    "rounded-[1.65rem] border border-[#e0f0eb]/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(244,249,247,0.6))] shadow-[0_18px_40px_rgba(20,90,70,0.05)] backdrop-blur-[24px]";
  const lightSubtlePanelClass = "rounded-[1.15rem] border border-[#deede8]/90 bg-[rgba(255,255,255,0.5)] backdrop-blur-[20px]";
  const lightEyebrowClass = "text-[11px] font-black uppercase tracking-[0.22em] text-[#d67191]";
  const lightBadgeClass =
    "rounded-full border border-[#f0cdd6] bg-[rgba(255,242,246,0.8)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#c9597b] backdrop-blur-xl";
  const lightMutedCopyClass = "text-[#6d7975]";
  const darkCanvasClass = "bg-[#131314] text-[#e5e2e3]";
  const darkPanelClass = "rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(21,25,25,0.76),rgba(11,13,14,0.58))] shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-[24px]";
  const darkSubtlePanelClass = "rounded-[1.15rem] border border-white/10 bg-[rgba(255,255,255,0.03)] backdrop-blur-[18px]";
  const darkEyebrowClass = "text-[11px] font-black uppercase tracking-[0.22em] text-[#7fa29b]";
  const darkBadgeClass =
    "rounded-full border border-[#00dcbf]/20 bg-[#00dcbf]/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#48F9DB]";
  const darkMutedCopyClass = "text-[#8fa39d]";
  const workspaceCanvasClass = isDarkTheme ? darkCanvasClass : lightCanvasClass;
  const workspacePanelClass = isDarkTheme ? darkPanelClass : lightPanelClass;
  const workspaceSubtlePanelClass = isDarkTheme ? darkSubtlePanelClass : lightSubtlePanelClass;
  const workspaceEyebrowClass = isDarkTheme ? darkEyebrowClass : lightEyebrowClass;
  const workspaceBadgeClass = isDarkTheme ? darkBadgeClass : lightBadgeClass;
  const workspaceMutedCopyClass = isDarkTheme ? darkMutedCopyClass : lightMutedCopyClass;
  const workspaceStrongTextClass = isDarkTheme ? "text-white" : "text-[#1a1c1c]";
  const workspaceBodyTextClass = isDarkTheme ? "text-[#c2ccca]" : "text-[#4e463e]";
  const workspaceIconPanelClass = isDarkTheme ? "border-white/8 bg-white/[0.03] text-[#48F9DB]" : "border-[#e0f0eb] bg-white/90 text-[#308f76]";
  const workspaceMainSurfaceClass = isDarkTheme
    ? "bg-[radial-gradient(circle_at_top,rgba(0,220,191,0.06),transparent_40%),linear-gradient(180deg,#111314,#0d0e10)]"
    : "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_34%),linear-gradient(180deg,#f4f9f7,#edf4f1)]";
  const workspaceSoftTextClass = isDarkTheme ? "text-[#7fa29b]" : "text-[#798e88]";
  const workspaceHoverPanelClass = isDarkTheme ? "hover:bg-white/[0.05]" : "hover:bg-[#fff9fa]";
  const workspaceButtonTextClass = isDarkTheme ? "text-[#48F9DB]" : "text-[#d67191]";
  const workspaceGhostButtonClass = isDarkTheme
    ? "border-white/10 bg-white/[0.03] text-[#c7d2cf] hover:border-[#00dcbf]/24 hover:text-[#48F9DB]"
    : "border-[#f0cdd6] bg-[#fff6f8] text-[#798e88] hover:border-[#eba8bd] hover:text-[#d67191]";
  const workspaceDialogClass = isDarkTheme
    ? "border border-white/10 bg-[#111213] text-[#e5e2e3]"
    : "border border-[#deced2] bg-[#fbf5f6] text-[#1c2220]";
  const workspaceDialogDescriptionClass = isDarkTheme ? "text-[#8fa39d]" : "text-[#798e88]";
  const workspaceProcessDialogClass = isDarkTheme
    ? "border border-[#00dcbf]/20 bg-[radial-gradient(circle_at_top,rgba(0,220,191,0.08),transparent_60%),linear-gradient(180deg,#0d1011,#080a0b)] text-[#e5e2e3] shadow-[0_48px_160px_rgba(0,220,191,0.24),0_0_80px_rgba(72,249,219,0.12)] backdrop-blur-xl"
    : "border border-[#deced2] bg-[radial-gradient(circle_at_top,rgba(255,255,255,1),transparent_50%),linear-gradient(180deg,#fbf5f6,#f2e9eb)] text-[#1c2220] shadow-[0_40px_120px_rgba(214,113,145,0.15),0_0_60px_rgba(214,113,145,0.06)] backdrop-blur-xl";

  function openSkillDialogForJob(jobId: string | null, variant: "light" | "dark" = currentTone, focusKind?: ArtifactKind) {
    if (!jobId) {
      return;
    }

    if (focusKind) {
      setSkillDialogFocusKind(focusKind);
    }
    setSkillDialogVariant(variant);
    setSkillDialogJobId(jobId);
    setProcessSkillsOpen(true);
  }

  function renderWorkspaceBrowser() {
    const dark = isDarkTheme;
    const browserEyebrow =
      (landing === "library" || landing === "agent")
        ? ui.library
        : (landing === "capture" || landing === "interview")
          ? ui.capture
          : (landing === "processing")
            ? ui.process
            : ui.workspace;
    const panelClass = dark
      ? "border-white/8 bg-[#0f1112] text-[#e5e2e3]"
      : "border-[#dacfc3] bg-[#f8f2e8] text-[#1a1c1c]";
    const mutedClass = dark ? "text-[#8fa39d]" : "text-[#6f6258]";
    const inputClass = dark
      ? "border-[#3B4A46]/40 bg-[#171819] text-[#e5e2e3] placeholder:text-[#667873]"
      : "border-[#ddd2c6] bg-[#f6eee4] text-[#1a1c1c] placeholder:text-[#a09287]";

    return (
      <aside className={`${collapsed ? "w-20" : "w-[320px]"} flex min-h-screen shrink-0 flex-col border-r ${panelClass} transition-all duration-300`}>
        <div className="flex items-center justify-between border-b border-current/10 px-4 py-4">
          {!collapsed ? (
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${mutedClass}`}>{browserEyebrow}</p>
              <h2 className="mt-1 text-sm font-extrabold uppercase tracking-[0.18em]">{ui.projects}</h2>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={`rounded-full p-2 ${mutedClass} transition-colors hover:bg-white/5 hover:text-current`}
            title={collapsed ? ui.expandWorkspace : ui.collapseWorkspace}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {collapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 px-3 py-4">
            <button
              type="button"
              onClick={() => setNewProjectOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-current/10 bg-white/5"
              title={ui.newProject}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarSearchOpen((value) => !value)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-current/10 bg-white/5"
              title={ui.searchWorkspace}
            >
              <Search className="h-4 w-4" />
            </button>
            <Link
              href={`/${locale}/app/settings`}
              className="mt-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-current/10 bg-white/5"
              title={ui.settings}
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-current/10 px-4 py-4">
              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className={`flex h-10 w-10 items-center justify-center rounded-[1rem] border transition-colors ${dark ? "border-white/10 bg-[#00DCBF]/10 text-[#00DCBF] hover:bg-[#00DCBF]/20" : "border-[#e3d7ca] bg-[#8a5a3c]/10 text-[#8a5a3c] hover:bg-[#8a5a3c]/20"}`}
                title={ui.newProject}
              >
                <FolderPlus className="h-[18px] w-[18px]" />
              </button>

              <button
                type="button"
                onClick={() => setSidebarSearchOpen((value) => !value)}
                className={`flex h-10 w-10 items-center justify-center rounded-[1rem] border transition-colors ${dark ? "border-white/10 bg-white/5 text-[#97ada8] hover:bg-white/10 hover:text-white" : "border-[#e3d7ca] bg-black/5 text-[#8a5a3c] hover:bg-black/10"}`}
                title={ui.searchWorkspace}
              >
                <Search className="h-[18px] w-[18px]" />
              </button>

              <button
                type="button"
                className={`flex h-10 w-10 items-center justify-center rounded-[1rem] border transition-colors ${dark ? "border-white/10 bg-white/5 text-[#97ada8] hover:bg-white/10 hover:text-white" : "border-[#e3d7ca] bg-black/5 text-[#8a5a3c] hover:bg-black/10"}`}
                title={ui.favorite}
              >
                <Star className="h-[18px] w-[18px]" />
              </button>

              <button
                type="button"
                className={`flex h-10 w-10 items-center justify-center rounded-[1rem] border transition-colors ${dark ? "border-white/10 bg-white/5 text-[#97ada8] hover:bg-white/10 hover:text-white" : "border-[#e3d7ca] bg-black/5 text-[#8a5a3c] hover:bg-black/10"}`}
                title={ui.deleteProject}
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </button>
            </div>

            {sidebarSearchOpen ? (
              <div className="border-b border-current/10 px-4 py-4">
                <div className="space-y-3 rounded-2xl border border-current/10 bg-white/5 p-3">
                  <label className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${inputClass}`}>
                    <Search className="h-4 w-4" />
                    <input
                      ref={sidebarSearchInputRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                      placeholder={hasSelectedProject ? ui.searchInProject : ui.selectProjectFirst}
                      disabled={!hasSelectedProject}
                    />
                  </label>
                  {hasSelectedProject && search.trim().length >= 2 ? (
                    <div className="space-y-2">
                      <div className={`flex items-center gap-2 text-xs uppercase tracking-[0.16em] ${mutedClass}`}>
                        {isProjectSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        <span>{isProjectSearching ? ui.searching : ui.resultCount(projectResults.length)}</span>
                      </div>
                      {projectResults.length ? (
                        projectResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => jumpToSearchResult(result)}
                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${dark ? "bg-[#17191a] hover:bg-[#1d2021]" : "bg-[#f5f1ea] hover:bg-[#efe9df]"}`}
                          >
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ${dark ? "bg-[#223530] text-[#98D2C4]" : "bg-[#f1e2d4] text-[#8a5a3c]"}`}>
                              {result.kind}
                            </span>
                            <span className="truncate">{result.title}</span>
                          </button>
                        ))
                      ) : (
                        <p className={`text-sm ${mutedClass}`}>{ui.noMatches}</p>
                      )}
                    </div>
                  ) : (
                    <p className={`text-sm ${mutedClass}`}>{ui.typeToSearch}</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="px-3 py-4">
              <div className="space-y-2">
                {projectState.length ? (
                  projectState.map((project) => {
                    const isExpanded = expandedProjectIds.includes(project.id);
                    const projectJobs = jobsByProject.get(project.id) || [];
                    const isActive = selectedProjectId === project.id;
                    const latestJob = projectJobs[0];
                    const latestTime = latestJob
                      ? formatRelativeTime(latestJob.updated_at || latestJob.created_at)
                      : null;

                    return (
                      <div
                        key={project.id}
                        className={`group rounded-2xl border p-2 ${isActive ? (dark ? "border-[#48F9DB]/24 bg-[rgba(255,255,255,0.03)]" : "border-[#cfa98a] bg-[rgba(255,255,255,0.78)] shadow-[0_12px_24px_rgba(138,90,60,0.06)]") : "border-current/10 bg-transparent"}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleProjectExpanded(project.id)}
                            className={`mt-0.5 rounded-full p-1 ${mutedClass}`}
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                          </button>
                          <div className="min-w-0 flex-1 text-left">
                            {renamingProjectId === project.id ? (
                              <input
                                autoFocus
                                className={`w-full bg-transparent text-sm font-bold leading-tight outline-none border-b ${dark ? "border-white/20 text-white" : "border-black/20 text-black"}`}
                                value={renamingValue}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenamingValue(e.target.value)}
                                onBlur={(e) => { e.stopPropagation(); void handleRenameProject(project.id, renamingValue); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleRenameProject(project.id, renamingValue);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setRenamingProjectId(null);
                                  }
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => activateProject(project.id)}
                                className="w-full text-left"
                              >
                                <p className="line-clamp-2 whitespace-normal break-words text-sm font-bold leading-tight" title={project.title}>{project.title}</p>
                              </button>
                            )}
                            <p className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${mutedClass}`}>
                              <span>{projectJobs.length} {ui.sessions}</span>
                              {latestTime && <><span className="opacity-40">·</span><span>{latestTime}</span></>}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRenamingValue(project.title);
                              setRenamingProjectId(project.id);
                            }}
                            className={`rounded-full p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${mutedClass}`}
                            title="重命名项目"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openNewInterviewForProject(project.id);
                            }}
                            className={`rounded-full p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${dark ? "bg-[#00DCBF]/10 text-[#48F9DB]" : "bg-[#f1e2d4] text-[#8a5a3c]"}`}
                            title={ui.newAnalysis}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteProject(project)}
                            className={`rounded-full p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${mutedClass}`}
                            title={ui.deleteProject}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {isExpanded ? (
                          <div className="mt-2 space-y-1 pl-5">
                            {projectJobs.length ? (
                              projectJobs.map((job) => {
                                const isFavorite = favoriteJobIds.has(job.id);
                                const isSelected = selectedJobId === job.id;
                                const preview = getJobSummaryPreview(job);

                                return (
                                  <div key={job.id} className="group/job flex items-start gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => activateProjectJob(project.id, job.id)}
                                      className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-2 py-1.5 text-left transition-colors ${isSelected ? (dark ? "bg-[#1d2222] text-white" : "border border-[#d8c0ab] bg-[#fff7ef] text-[#1a1c1c]") : (dark ? "hover:bg-white/[0.03]" : "hover:bg-[#fff8f0]")}`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <AudioLines className="h-3.5 w-3.5 shrink-0" />
                                        {renamingJobId === job.id ? (
                                          <input
                                            autoFocus
                                            className={`w-full bg-transparent text-sm font-semibold leading-tight outline-none border-b ${dark ? "border-white/20 text-white" : "border-black/20 text-black"}`}
                                            value={renamingValue}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => setRenamingValue(e.target.value)}
                                            onBlur={(e) => { e.stopPropagation(); void handleRenameJob(job.id, renamingValue); }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void handleRenameJob(job.id, renamingValue);
                                              } else if (e.key === "Escape") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setRenamingJobId(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span className="line-clamp-1 text-sm font-semibold leading-tight">{getJobDisplayTitle(job)}</span>
                                        )}
                                      </span>
                                      {preview && (
                                        <span className={`line-clamp-2 pl-[22px] text-[11px] leading-[1.5] ${mutedClass}`}>{preview}</span>
                                      )}
                                    </button>
                                    <div className="relative shrink-0 pt-1.5">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setOpenJobMenuId(openJobMenuId === job.id ? null : job.id); }}
                                        className={`rounded-full p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/job:opacity-100 ${mutedClass}`}
                                        title="更多"
                                      >
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </button>
                                      {openJobMenuId === job.id && (
                                        <>
                                          <div className="fixed inset-0 z-40" onClick={() => setOpenJobMenuId(null)} />
                                          <div className={`absolute right-0 top-8 z-50 flex min-w-[120px] flex-col gap-0.5 rounded-xl border p-1 shadow-lg ${dark ? "border-white/10 bg-[#1b1c1d]" : "border-[#dacfc3] bg-white"}`}>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setRenamingValue(getJobDisplayTitle(job));
                                                setRenamingJobId(job.id);
                                                setOpenJobMenuId(null);
                                              }}
                                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${dark ? "hover:bg-white/[0.05]" : "hover:bg-[#fff8f0]"}`}
                                            >
                                              <Pencil className="h-3 w-3" />
                                              重命名
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => { void toggleJobFavorite(job); setOpenJobMenuId(null); }}
                                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${dark ? "hover:bg-white/[0.05]" : "hover:bg-[#fff8f0]"} ${isFavorite ? (dark ? "text-[#00dcbf]" : "text-[#8a5a3c]") : ""}`}
                                            >
                                              <Star className={`h-3 w-3 ${isFavorite ? (dark ? "fill-[#00dcbf]" : "fill-[#8a5a3c]") : ""}`} />
                                              {isFavorite ? ui.unfavorite : ui.favorite}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => { void deleteJob(job); setOpenJobMenuId(null); }}
                                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-500 transition-colors ${dark ? "hover:bg-white/[0.05]" : "hover:bg-rose-50"}`}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                              {ui.deleteSession}
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className={`text-sm ${mutedClass}`}>{ui.noSessions}</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className={`rounded-3xl border border-dashed p-6 text-sm ${mutedClass}`}>
                    {ui.createFirstProject}
                  </div>
                )}
              </div>
            </div>


          </>
        )}
      </aside>
    );
  }
  function renderDarkRail(active: KemoWorkspaceLanding = "capture") {
    const processEntryActive = active === "processing" || processingModalOpen;
    const lightRail = !isDarkTheme;
    const railLinks: Array<{
      key: KemoWorkspaceLanding | "focus" | "settings";
      href: string;
      icon: LucideIcon;
      label: string;
    }> = [
      { key: "agent", href: agentHref, icon: Bot, label: isZh ? "Agent" : "Agent" },
      { key: "dashboard", href: dashboardHref, icon: Folder, label: isZh ? "文件管理" : "Files" },
      { key: "interview", href: interviewHref, icon: Mic, label: isZh ? "智能访谈" : "Interview" },
      { key: "focus", href: "#", icon: Radio, label: isZh ? "聚焦" : "Focus" },
      { key: "settings", href: `/${locale}/app/settings`, icon: Settings, label: ui.settings },
    ];
    const activeLinkClass = lightRail
      ? "bg-[#fff8f1] text-[#8a5a3c] shadow-[0_16px_32px_rgba(138,90,60,0.12)]"
      : "bg-[#1c1b1c] text-[#48F9DB] shadow-[0_0_18px_rgba(16,223,194,0.08)]";
    const idleLinkClass = lightRail
      ? "text-[#6f6258] hover:bg-[#fff8f0] hover:text-[#8a5a3c]"
      : "text-[#BACAC4] opacity-70 hover:bg-[#1f2022] hover:text-[#48F9DB]";

    return (
      <aside
        className={`flex min-h-screen w-[56px] shrink-0 flex-col items-center border-r py-6 ${lightRail ? "border-[#dacfc3] bg-[#f3eee5]" : "border-white/5 bg-[#131314]"}`}
      >
        <div className="mb-8 flex w-full flex-col items-center gap-4 px-1 text-primary">
          <KemoMark className={`h-6 w-6 ${lightRail ? "text-[#8a5a3c]" : "text-[#00DCBF]"}`} />
        </div>

        <nav className="flex flex-1 flex-col items-center gap-3">
          {railLinks.map((link) => {
            const Icon = link.icon;
            const isActive = link.key === "focus" ? focusModalOpen : (link.key === "processing" ? processEntryActive : active === link.key);
            const classes = `flex flex-col items-center gap-1 rounded-xl p-2 transition-all ${isActive ? activeLinkClass : idleLinkClass}`;

            if (link.key === "focus") {
              return (
                <button
                  key={link.key}
                  type="button"
                  onClick={() => setFocusModalOpen(true)}
                  className={classes}
                  title={link.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </button>
              );
            }

            if (link.key === "processing" && active !== "processing") {
              return (
                <button
                  key={link.key}
                  type="button"
                  onClick={() => setProcessingModalOpen(true)}
                  className={classes}
                  title={link.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </button>
              );
            }

            return (
              <Link key={link.key} href={link.href} className={classes} title={link.label}>
                <Icon className="h-4 w-4 shrink-0" />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-4">
          <button type="button" className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border ${lightRail ? "border-[#dacfc3] bg-[#fff8f1] text-[#8a5a3c]" : "border-white/10 bg-[#1f2022] text-[#BACAC4]"}`}>
            <User className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  function renderSkillStudioPanel() {
    const inspirationArtifact = primaryArtifactsByKind.inspiration_questions;
    const publishArtifact = primaryArtifactsByKind.publish_script;
    const summaryArtifact = primaryArtifactsByKind.quick_summary;
    const inspirationPreview = getArtifactBody(inspirationArtifact).trim() || "Use the live capture stream or uploaded audio to let Kemo suggest follow-up angles in real time.";
    const summaryPreview = getArtifactBody(summaryArtifact).trim() || "Summary generation will appear here as soon as the transcript is ready.";
    const draftPreview = getArtifactBody(publishArtifact).trim() || "The polished publish script will populate here once synthesis completes.";
    const accentCard = landing === "capture" || selectedJob?.capture_mode === "live";

    return (
      <aside className="hidden w-[390px] shrink-0 border-l border-white/8 bg-[#1b1c1d] xl:flex xl:flex-col">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#98D2C4]">AI Companion</p>
            <h3 className="mt-1 text-sm font-extrabold uppercase tracking-[0.18em] text-white">Studio Rail</h3>
          </div>
          <button
            type="button"
            onClick={() => setRightRailCollapsed((value) => !value)}
            className="rounded-full p-2 text-[#8fa39d] transition-colors hover:bg-white/5 hover:text-white"
          >
            {rightRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
          </button>
        </div>

        {rightRailCollapsed ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs uppercase tracking-[0.18em] text-[#6f817c]">Expand</span>
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="rounded-[1.5rem] border border-white/8 bg-[#111213] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#48F9DB]">
                  <Lightbulb className="h-4 w-4" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em]">灵感追问</span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#6f817c]">
                  {!selectedJob?.started_at && !liveTranscriptSnapshot ? "未开始" : "Live AI Gen"}
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-white/8 bg-[#171819] p-4 text-sm leading-7 text-[#E5E2E3]">
                {!selectedJob?.started_at && !liveTranscriptSnapshot ? (
                  <p className="text-sm text-[#798e88] italic text-center py-2">生成内容待触发</p>
                ) : (
                  <>
                    <p>那些四五十岁的高层，他们健身的时间从哪来？</p>
                    <p>这种白天沙拉晚上狂吃的反差，长期下去身体吃得消吗？</p>
                  </>
                )}
                <p>你说他们自律，那他们每天到底工作多少小时？</p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-[#111213] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#10DFC2]">
                  <ScrollText className="h-4 w-4" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em]">快速摘要</span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#6f817c]">
                  {!selectedJob?.started_at && !liveTranscriptSnapshot ? "未开始" : getStatusLabel(selectedJob?.status)}
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-white/8 bg-[#171819] p-4 text-sm leading-6 text-[#E5E2E3]">
                {!selectedJob?.started_at && !liveTranscriptSnapshot ? (
                  <p className="text-sm text-[#798e88] italic text-center py-2">生成内容待触发</p>
                ) : (
                  <>
                    <ul className="mb-4 space-y-1">
                      <li>- 工作起始时间：13:00（点到一点）</li>
                      <li>- 任务分配惯例：新人（最年轻成员）负责为全组购买午餐</li>
                    </ul>
                    <h4 className="font-bold text-[#48F9DB] mb-2">### 关键支撑</h4>
                    <ul className="space-y-2 text-[#c7d2cf]">
                      <li>- <strong>无午休</strong>: 访谈中明确提到“没有午休” “想休息门儿都没有”，显示公司对工作时间的严苛把控。</li>
                      <li>- <strong>新人承担生活服务</strong>: 刚入职时，团队内部会指派最年轻的人外出为全体同事买饭，作为一种惯例。</li>
                    </ul>
                    {liveTranscriptSnapshot ? <ProcessingMarquee /> : null}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    );
  }

  void renderSkillStudioPanel;

  function renderLegacyDashboardShell() {
    return (
      <div className="flex h-screen bg-[#f9f9f9] text-[#1a1c1c]">
        {renderDarkRail("workspace")}
        {renderWorkspaceBrowser()}

        <main className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_390px] bg-[#f9f9f9]">
          <div className="flex-1 overflow-y-auto px-10 py-16 xl:px-16">
            <div className="mb-16">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#5f5e60]/70">
                {selectedProject ? `Active Project · ${selectedProject.title}` : "Project Ready"}
              </p>
              <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.05em]">Initialize Intelligence</h2>
              <p className="mt-3 max-w-xl text-lg leading-8 text-[#5f5e60]">
                Select your capture method to begin the Kemo neural processing engine while keeping your existing project workflow intact.
              </p>
            </div>

            <div className="space-y-14">
              <section>
                <div className="mb-6 flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-[#00dcbf]" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.24em]">Real-time Recording</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => openLiveStarter("mic")}
                    className="group rounded-[1.5rem] border border-[#bacac4]/20 bg-white p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#00dcbf]/55 hover:shadow-[0_24px_48px_rgba(0,107,92,0.08)]"
                  >
                    <Mic className="h-8 w-8 text-[#006b5c]" />
                    <h4 className="mt-6 text-lg font-bold">Face-to-Face</h4>
                    <p className="mt-2 text-sm leading-7 text-[#5f5e60]">Direct clinical observation via local microphone capture.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openLiveStarter("system")}
                    className="group rounded-[1.5rem] border border-[#bacac4]/20 bg-white p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#00dcbf]/55 hover:shadow-[0_24px_48px_rgba(0,107,92,0.08)]"
                  >
                    <ScreenShare className="h-8 w-8 text-[#006b5c]" />
                    <h4 className="mt-6 text-lg font-bold">Meeting</h4>
                    <p className="mt-2 text-sm leading-7 text-[#5f5e60]">Capture meeting apps or system audio for multi-speaker sessions.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openLiveStarter("tab")}
                    className="group rounded-[1.5rem] border border-[#bacac4]/20 bg-white p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#00dcbf]/55 hover:shadow-[0_24px_48px_rgba(0,107,92,0.08)]"
                  >
                    <Radio className="h-8 w-8 text-[#006b5c]" />
                    <h4 className="mt-6 text-lg font-bold">Browser</h4>
                    <p className="mt-2 text-sm leading-7 text-[#5f5e60]">Listen to a tab for web meetings, podcasts, and browser-native sources.</p>
                  </button>
                </div>
              </section>

              <section>
                <div className="mb-6 flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-[#5f5e60]" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.24em]">File Upload & Ingestion</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openFileStarter("upload")}
                    className="rounded-[1.5rem] border border-transparent bg-[#f3f3f3] p-8 text-left transition-all duration-300 hover:border-[#00dcbf]/55 hover:bg-white"
                  >
                    <Upload className="h-8 w-8 text-[#5f5e60]" />
                    <h4 className="mt-6 text-lg font-bold">Audio</h4>
                    <p className="mt-2 text-sm leading-7 text-[#5f5e60]">Upload MP3, WAV, video, or text materials for processing.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openFileStarter("url")}
                    className="rounded-[1.5rem] border border-transparent bg-[#f3f3f3] p-8 text-left transition-all duration-300 hover:border-[#00dcbf]/55 hover:bg-white"
                  >
                    <Link2 className="h-8 w-8 text-[#5f5e60]" />
                    <h4 className="mt-6 text-lg font-bold">URL</h4>
                    <p className="mt-2 text-sm leading-7 text-[#5f5e60]">Archive webpages or remote assets directly into the current project.</p>
                  </button>
                </div>
              </section>
            </div>
          </div>

          <aside className="hidden w-96 shrink-0 border-l border-[#bacac4]/25 bg-[#f3f3f3]/60 px-8 py-12 xl:block">
            <div className="space-y-10">
              <div>
                <h5 className="mb-6 text-[10px] font-black uppercase tracking-[0.24em] text-[#5f5e60]">Recent Activity</h5>
                <div className="space-y-5">
                  {recentActivity.length ? (
                    recentActivity.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => activateProjectJob(job.project_id || selectedProjectId || "", job.id)}
                        className="flex w-full items-start gap-4 text-left"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#006b5c]">
                          <AudioLines className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{getJobDisplayTitle(job)}</p>
                          <p className="mt-1 text-xs text-[#5f5e60]">{getStatusLabel(job.status)} · {formatRelativeTime(job.updated_at || job.created_at)}</p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-[#5f5e60]">No project activity yet. Create a session to start building your intelligence library.</p>
                  )}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.75rem] border border-[#bacac4]/20 bg-[radial-gradient(circle_at_top,rgba(0,220,191,0.24),transparent_40%),linear-gradient(135deg,#dff8f2,#ffffff)] p-6">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,107,92,0.08),transparent_60%)]" />
                <div className="relative">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#006b5c]">Kemo Precision</p>
                  <h6 className="mt-2 text-sm font-bold">Neural Transcription v2.4</h6>
                  <p className="mt-3 text-sm leading-7 text-[#5f5e60]">Keep your project browser, source ingestion, and AI drafting pipeline connected inside the same upgraded interface.</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-[#00dcbf]/20 bg-[#00dcbf]/8 p-5">
                <h5 className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-[#006b5c]">Pro Tip</h5>
                <p className="text-sm italic leading-7 text-[#005c4e]">
                  Use 鈥淢eeting鈥?mode when more than three distinct voices are present for cleaner speaker separation.
                </p>
              </div>

              <div className="border-t border-[#bacac4]/25 pt-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#5f5e60]">Neural Load</span>
                  <span className="text-[10px] font-bold text-[#006b5c]">Normal</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[#00dcbf] shadow-[0_0_10px_#00dcbf]" style={{ width: `${systemLoad}%` }} />
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  void renderLegacyDashboardShell;

  function renderAgentShell() {
    return (
      <div className={`flex h-screen w-full overflow-hidden ${workspaceCanvasClass}`}>
        {renderDarkRail("agent")}
        <main className={`min-w-0 flex-1 overflow-y-auto ${workspaceMainSurfaceClass}`}>
          <AgentChatPanel
            locale={locale}
            theme={currentTone}
            jobCount={jobState.length}
            artifactCount={artifactState.length}
          />
        </main>
      </div>
    );
  }

  function renderDashboardShell() {
    const showInterviewCenter = centerSection === "interview";
    return (
      <div className={`flex h-screen w-full overflow-hidden ${workspaceCanvasClass}`}>
        {renderDarkRail("dashboard")}
        {renderWorkspaceBrowser()}
        <main className={`min-w-0 flex-1 overflow-y-auto ${workspaceMainSurfaceClass}`}>
          {showInterviewCenter ? (
            <div className="mx-auto flex max-w-4xl flex-col gap-5 px-8 py-8 xl:px-12">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setCenterSection("tasks"); setInterviewDraftMode(null); }}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors ${isDarkTheme ? "border-white/10 bg-white/[0.03] text-[#c7d2cf] hover:border-[#00dcbf]/24 hover:text-[#48F9DB]" : "border-[#dacfc3] bg-white/90 text-[#6f6258] hover:border-[#d8c0ab] hover:text-[#8a5a3c]"}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {isZh ? "返回仪表盘" : "Back to Dashboard"}
                </button>
              </div>
              <section className={`${workspacePanelClass} p-6`}>
                {renderInterviewStarterContent()}
              </section>
            </div>
          ) : (
            <DashboardStatsPanel
              locale={locale}
              theme={currentTone}
              projects={projectState}
              jobs={jobState}
              artifacts={artifactState}
              sourceCount={sourceState.length}
              onNewProject={() => setNewProjectOpen(true)}
            />
          )}
        </main>
      </div>
    );
  }

  function renderLiveShell() {
    const liveSpotlightJob = selectedJob;
    const liveSkillKinds = liveSpotlightJob?.capture_mode === "live" || !liveSpotlightJob
      ? (["quick_summary", "publish_script", "inspiration_questions"] as ArtifactKind[])
      : (["meeting_minutes", "quick_summary", "publish_script", "inspiration_questions"] as ArtifactKind[]);

    return (
      <div className={`flex h-screen w-full overflow-hidden ${workspaceCanvasClass}`}>
        {renderDarkRail(landing === "interview" ? "interview" : landing)}
        {renderWorkspaceBrowser()}
        <main className={`min-w-0 flex-1 overflow-y-auto ${workspaceMainSurfaceClass}`}>
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-8 py-8 xl:px-12">
            {renderPageStatusStrip({
              label: ui.capture,
              title: liveSpotlightJob?.title || selectedProject?.title || spotlightProject?.title || ui.liveCaptureSession,
              detail: selectedProject?.title || spotlightProject?.title || ui.projectNotSelected,
              action: (
                <span className={workspaceBadgeClass}>
                  <span className={`h-2 w-2 rounded-full ${isDarkTheme ? "bg-[#48F9DB] animate-pulse" : "bg-[#8a5a3c]"}`} />
                  {ui.liveSession}
                </span>
              ),
            })}

            {/* ASR 转写面板 - 默认收起 */}
            <section className={`${workspacePanelClass} relative overflow-hidden`}>
              <button
                type="button"
                onClick={() => setLiveTranscriptExpanded((v) => !v)}
                className={`flex w-full items-center justify-between px-6 py-4 text-left transition-colors ${workspaceHoverPanelClass}`}
              >
                <div className="flex items-center gap-2">
                  <Mic className={`h-4 w-4 ${workspaceButtonTextClass}`} />
                  <span className={`text-sm font-bold ${workspaceStrongTextClass}`}>{isZh ? "实时 ASR 转写" : "Live ASR Transcript"}</span>
                  {liveTranscriptSnapshot && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDarkTheme ? "bg-[#00dcbf]/10 text-[#48F9DB]" : "bg-[#fff1e1] text-[#8a5a3c]"}`}>
                      {liveTranscriptSnapshot.length > 0 ? `${Math.ceil(liveTranscriptSnapshot.length / 500)}段` : ""}
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${liveTranscriptExpanded ? "" : "-rotate-90"} ${workspaceSoftTextClass}`} />
              </button>
                <div className="px-6 pb-6 pt-2">
                  <div className="pointer-events-none absolute right-5 top-5 h-16 w-16 opacity-10">
                    <WorkspaceLineGlyph tone={currentTone} variant="velocity" className="h-full w-full" />
                  </div>
                  <LiveInterviewPanel
                    key={selectedProjectId || "kemo-live-terminal"}
                    onTranscriptChange={setLiveTranscriptSnapshot}
                    onStatusChange={setLiveCaptureStatus}
                    onEnsureJob={ensureLiveJob}
                    onFinalizeStarted={handleLiveFinalizeStarted}
                    onFinalizeSettled={handleLiveFinalizeSettled}
                    onFinalized={handleLiveFinalized}
                    preferredCaptureMode={preferredCaptureMode}
                    disabled={!hasSelectedProject}
                    disabledReason={projectLockedReason}
                    jobCompleted={selectedJob?.status === "completed"}
                    onUploadFile={async (file) => {
                      if (!selectedJobId || !selectedProjectId) return;
                      setLiveCaptureStatus(isZh ? "正在上传与处理文件..." : "Uploading and processing file...");
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("existingJobId", selectedJobId);
                      formData.append("projectId", selectedProjectId);
                      formData.append("captureMode", "upload");
                      formData.append("sourceType", file.type.startsWith("video/") ? "video_upload" : "audio_upload");

                      try {
                        const uploadRes = await fetch("/api/jobs", {
                          method: "POST",
                          body: formData,
                        });
                        
                        if (uploadRes.ok) {
                          setLiveCaptureStatus(isZh ? "文件上传成功，正在后台分析..." : "Upload successful, analyzing...");
                          // trigger the run endpoint explicitly
                          await fetch(`/api/jobs/${selectedJobId}/run`, { method: "POST" }).catch(() => {});
                          // simulate a delay then mark finalized so it switches to completed status UI
                          handleLiveFinalizeStarted({ jobId: selectedJobId, transcriptText: "", statusText: "Processing" });
                          setTimeout(() => {
                            handleLiveFinalized({ transcriptText: "", statusText: "Success" });
                          }, 1500);
                        } else {
                          setLiveCaptureStatus(isZh ? "文件上传失败" : "Upload failed");
                        }
                      } catch (e) {
                         setLiveCaptureStatus(isZh ? "文件上传遇到错误" : "Upload error");
                      }
                    }}
                    afterRecorderSlot={
                      (selectedJob?.status === "completed" || selectedJob?.status === "in_progress") ? (
                        <div className="grid gap-4 mt-6">
                          {["quick_summary", "meeting_minutes"].map((kind) => {
                            const artifact = artifactState.find((a) => a.job_id === selectedJob?.id && a.kind === kind);
                            const snapshot = getSkillProgressSnapshot(kind as ArtifactKind, { artifacts: artifact ? [artifact] : [], pendingKinds: pendingArtifactKindSet });
                            const isPending = pendingArtifactKindSet.has(kind as ArtifactKind);
                            
                            if (!artifact && !isPending) return null;
                            const { title, icon: Icon } = getSkillDisplay(kind as ArtifactKind);
                            return (
                              <section key={kind} className={`rounded-[1.5rem] border ${currentTone === "dark" ? "border-white/8 bg-[#111213]" : "border-[#dacfc3] bg-white"} p-5`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <Icon className={`h-4 w-4 ${currentTone === "dark" ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`} />
                                  <h4 className={`text-sm font-bold ${currentTone === "dark" ? "text-white" : "text-[#1a1c1c]"}`}>{title}</h4>
                                </div>
                                {renderProgressSnapshot(snapshot, kind, true)}
                                <div className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed ${currentTone === "dark" ? "text-[#E5E2E3]" : "text-[#4e463e]"}`}>
                                  {artifact ? (artifact.kind === "publish_script" ? parseArtifactContent(artifact.content || "").body : (artifact.summary || artifact.content)) : <ProcessingMarquee />}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      ) : null
                    }
                    compact={false}
                    hideTranscript={!liveTranscriptExpanded}
                    theme={currentTone}
                  />
                </div>
            </section>

            {/* 技能卡 - 默认展开（带进度条） */}
            <section className={`${workspacePanelClass} relative overflow-hidden`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setLiveSkillDeckCollapsed((v) => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLiveSkillDeckCollapsed((v) => !v); } }}
                className={`flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left transition-colors ${workspaceHoverPanelClass}`}
              >
                <div className="flex items-center gap-3">
                  <p className={workspaceEyebrowClass}>{ui.skillDeck}</p>
                  <p className={`mt-0.5 text-xs ${workspaceMutedCopyClass}`}>{liveSpotlightJob ? getJobDisplayTitle(liveSpotlightJob) : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {liveSpotlightJob && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openSkillDialogForJob(liveSpotlightJob.id); }}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${workspaceGhostButtonClass}`}
                    >
                      {ui.processSkills}
                    </button>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform ${liveSkillDeckCollapsed ? "-rotate-90" : ""} ${workspaceSoftTextClass}`} />
                </div>
              </div>
              
              {!liveSkillDeckCollapsed && (
                <div className="px-6 pb-6 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                {liveSkillKinds.map((kind) => {
                  const progress = primaryProgressByKind[kind as PrimaryArtifactKind];
                  const { title, icon: SkillIcon } = getSkillDisplay(kind);
                  const isPending = !!liveSpotlightJob && liveSpotlightJob.id === selectedJob?.id && pendingArtifactKindSet.has(kind as ArtifactKind);
                  const stageWidth = progress ? `${(progress.stage / 3) * 100}%` : "0%";
                  const isCompleted = progress?.tone === "ready";
                  const artifact = artifactState.find((a) => a.job_id === liveSpotlightJob?.id && a.kind === kind);
                  
                  const artifactContentSnippet = artifact 
                    ? (artifact.summary || artifact.content || "").slice(0, 800) 
                    : "";

                  const isCardExpanded = expandedLiveCards[kind] || false;

                  return (
                    <button
                      key={`skill-card-${kind}`}
                      type="button"
                      onClick={() => setExpandedLiveCards((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                      className={`flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition-all ${workspaceGhostButtonClass}`}
                    >
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${workspaceIconPanelClass}`}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkillIcon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${workspaceStrongTextClass}`}>{title}</span>
                          <span className={`text-[10px] font-bold ${workspaceSoftTextClass}`}>
                            {progress?.stageLabel || (isZh ? "未开始" : "Idle")}
                          </span>
                        </div>
                        
                        {/* 重点是生成内容：如果已完成，直接在卡片里展示部分内容。未完成则高度压缩。 */}
                        {artifactContentSnippet ? (
                          <div 
                            className={`mt-2.5 text-xs font-medium leading-relaxed opacity-90 ${workspaceSoftTextClass} ${isCardExpanded ? 'max-h-64 overflow-y-auto scrollbar-hide whitespace-pre-wrap select-text' : ''}`} 
                            style={isCardExpanded ? {} : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 10, overflow: "hidden", whiteSpace: "pre-line" }}
                            onClick={(e) => isCardExpanded && e.stopPropagation()}
                          >
                            {artifactContentSnippet}
                          </div>
                        ) : null}

                        {/* 三段式彩虹色调进度条：辅助显示，缩小存在感 */}
                        {!isCompleted && (
                          <div className="mt-2.5">
                            <div className={`h-1 w-full overflow-hidden rounded-full ${isDarkTheme ? "bg-white/5" : "bg-[#dacfc3]/30"}`}>
                              <div 
                                className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500`} 
                                style={{ width: stageWidth }} 
                              />
                            </div>
                            <ProcessingMarquee />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              </div>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  function renderProcessCanvas({
    modal = false,
    onClose,
  }: {
    modal?: boolean;
    onClose?: () => void;
  } = {}) {
    const processJob = processAnchorJob;
    const processProject = processAnchorProject;
    const processTranscript =
      (processJob?.id
        ? transcripts.find((entry) => entry.job_id === processJob.id)?.transcript_text || processJob.live_transcript_snapshot || ""
        : "") ||
      spotlightTranscriptContent ||
      "";
    const processSummaryArtifact = processArtifacts.find((artifact) => artifact.kind === "quick_summary") || null;
    const processDraftArtifact = processArtifacts.find((artifact) => artifact.kind === "publish_script") || null;
    const processProgress = getStatusProgress(processJob?.status);
    const processSteps = [
      { code: "01", label: ui.uploadStage, active: processProgress >= 12 },
      { code: "02", label: ui.transcribeStage, active: processProgress >= 42 },
      { code: "03", label: ui.synthesizeStage, active: processProgress >= 92 },
    ];
    const processEmptyClass = isDarkTheme
      ? "w-full max-w-3xl rounded-[2.2rem] border border-dashed border-white/10 bg-black/20 px-8 py-16 text-center"
      : "w-full max-w-3xl rounded-[2.2rem] border border-dashed border-[#d8c7b8] bg-[#fff8ef] px-8 py-16 text-center";
    const processPrimaryPreview =
      processDraftArtifact
        ? getArtifactBody(processDraftArtifact).trim() || processDraftArtifact.summary?.trim() || ""
        : processSummaryArtifact
          ? getArtifactBody(processSummaryArtifact).trim() || processSummaryArtifact.summary?.trim() || ""
          : processTranscript;

    return (
      <div className={`mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-6 py-8 ${modal ? "xl:px-7 xl:py-7" : "xl:px-10 xl:py-10"}`}>
        {/* -- Close button for modal -- */}
        {modal && onClose ? (
          <div className="flex w-full justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${workspaceGhostButtonClass}`}
              title={ui.closeProcess}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {processJob ? (
          <div className="flex w-full flex-col items-center gap-8">
            {/* -- Process orbital animation -- */}
            <div className="kemo-process-orbit" aria-hidden="true">
              <svg viewBox="0 0 200 200" className="kemo-process-orbit-svg">
                <circle cx="100" cy="100" r="90" className="kemo-process-orbit-track" />
                <circle cx="100" cy="100" r="60" className="kemo-process-orbit-track" />
                <circle cx="100" cy="100" r="30" className="kemo-process-orbit-track" />
                {/* Animated progress arc */}
                <circle
                  cx="100" cy="100" r="90"
                  className="kemo-process-orbit-arc"
                  style={{
                    strokeDasharray: `${processProgress * 5.65} ${565 - processProgress * 5.65}`,
                    strokeDashoffset: '141',
                  }}
                />
                {/* Orbiting dots */}
                <circle cx="100" cy="10" r="4" className="kemo-process-dot kemo-process-dot-1" />
                <circle cx="100" cy="40" r="3" className="kemo-process-dot kemo-process-dot-2" />
                <circle cx="100" cy="70" r="2.5" className="kemo-process-dot kemo-process-dot-3" />
              </svg>
              <div className={`kemo-process-orbit-center ${isDarkTheme ? 'text-[#48F9DB]' : 'text-[#8a5a3c]'}`}>
                <span className="text-2xl font-extrabold">{Math.max(processProgress, 8)}%</span>
              </div>
            </div>

            {/* -- Status label + step indicators -- */}
            <div className="flex items-center gap-3">
              {processSteps.map((step) => (
                <div key={step.code} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full transition-colors ${step.active ? (isDarkTheme ? 'bg-[#48F9DB]' : 'bg-[#8a5a3c]') : (isDarkTheme ? 'bg-white/20' : 'bg-[#d7c6b6]')}`} />
                  <span className={`text-xs font-semibold ${step.active ? workspaceStrongTextClass : workspaceMutedCopyClass}`}>{step.label}</span>
                </div>
              ))}
            </div>

            <h2 className={`text-center text-xl font-bold ${workspaceStrongTextClass}`}>
              {getJobDisplayTitle(processJob)}
            </h2>
            <p className={`text-center text-sm ${workspaceMutedCopyClass}`}>
              {processProject?.title || ui.projectNotSelected} · {getStatusLabel(processJob.status)}
            </p>

            {/* -- Real-time summary -- */}
            {processPrimaryPreview ? (
              <section className={`w-full ${workspacePanelClass} p-6`}>
                <p className={workspaceEyebrowClass}>{isZh ? "\u5b9e\u65f6\u6458\u8981" : "Live Summary"}</p>
                <p className={`mt-3 whitespace-pre-wrap text-sm leading-7 ${workspaceBodyTextClass}`}>
                  {processPrimaryPreview.slice(0, 600)}{processPrimaryPreview.length > 600 ? "\u2026" : ""}
                </p>
              </section>
            ) : null}

            {renderInlineActionBar(processJob)}
          </div>
        ) : (
          <div className="flex min-h-[48vh] items-center justify-center">
            <div className={processEmptyClass}>
              <p className={workspaceEyebrowClass}>{ui.progressOrbit}</p>
              <h1 className={`mt-6 text-4xl font-extrabold tracking-[-0.05em] ${workspaceStrongTextClass}`}>{ui.processTitle}</h1>
              <p className={`mx-auto mt-4 max-w-xl text-sm leading-7 ${workspaceMutedCopyClass}`}>{ui.uploadSourceHint}</p>
              <div className="mt-8 flex justify-center">
                <Link
                  href={workspaceHref}
                  className={workspaceBadgeClass}
                >
                  {ui.openWorkspace}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderProcessingShell() {
    return (
      <div className={`flex min-h-screen ${workspaceCanvasClass}`}>
        {renderDarkRail(landing)}
        <main className={`min-w-0 flex-1 ${workspaceMainSurfaceClass}`}>
          {renderProcessCanvas()}
        </main>
      </div>
    );
  }

  function renderLegacyLibraryShell() {
    const homeArtifacts = artifactState
      .filter((artifact) => artifact.job_id === homeJob?.id)
      .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime());
    const primaryLibraryArtifact = homeArtifacts[0] || spotlightArtifacts[0] || null;
    const primaryLibraryJob =
      homeJob ||
      (primaryLibraryArtifact ? jobState.find((job) => job.id === primaryLibraryArtifact.job_id) || null : null);
    const homeSummaryPreview =
      primaryLibraryArtifact?.summary ||
      getArtifactBody(primaryLibraryArtifact || spotlightSummaryArtifact || spotlightPublishArtifact || spotlightMinutesArtifact).slice(0, 240) ||
      spotlightTranscriptContent.slice(0, 240) ||
      "";

    const greetingHour = new Date().getHours();
    const greeting = greetingHour < 12 ? (isZh ? "\u65e9\u4e0a\u597d" : "Good morning") : greetingHour < 18 ? (isZh ? "\u4e0b\u5348\u597d" : "Good afternoon") : (isZh ? "\u665a\u4e0a\u597d" : "Good evening");

    return (
      <div className={`flex min-h-screen ${workspaceCanvasClass}`}>
        {renderDarkRail("library")}
        {renderWorkspaceBrowser()}
        <main className={`min-w-0 flex-1 ${workspaceMainSurfaceClass}`}>
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-16 xl:py-24">

            {/* -- Orbital animation hero -- */}
            <div className="kemo-orbital-hero" aria-hidden="true">
              <div className="kemo-orbital-ring kemo-orbital-ring-1" />
              <div className="kemo-orbital-ring kemo-orbital-ring-2" />
              <div className="kemo-orbital-ring kemo-orbital-ring-3" />
              <div className={`kemo-orbital-core ${isDarkTheme ? 'kemo-orbital-core-dark' : 'kemo-orbital-core-light'}`}>
                <KemoMark className="h-6 w-6" />
              </div>
            </div>

            {/* -- Greeting -- */}
            <h1 className={`mt-10 text-center text-4xl font-extrabold tracking-[-0.04em] ${workspaceStrongTextClass}`}>
              {greeting}
            </h1>
            <p className={`mt-3 text-center text-base leading-8 ${workspaceMutedCopyClass}`}>
              {isZh ? "\u6709\u4ec0\u4e48\u53ef\u4ee5\u5e2e\u5230\u4f60\u7684\uff1f" : "How can I help you today?"}
            </p>

            {/* -- Quick action pills -- */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => openLiveStarter()}
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all ${workspaceGhostButtonClass} hover:scale-[1.02]`}
              >
                <Mic className="h-4 w-4" />
                {isZh ? "\u5b9e\u65f6\u5f55\u97f3" : "Live Capture"}
              </button>
              <button
                type="button"
                onClick={() => openFileStarter("upload")}
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all ${workspaceGhostButtonClass} hover:scale-[1.02]`}
              >
                <Upload className="h-4 w-4" />
                {isZh ? "\u4e0a\u4f20\u6587\u4ef6" : "Upload File"}
              </button>
              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all ${workspaceGhostButtonClass} hover:scale-[1.02]`}
              >
                <FolderPlus className="h-4 w-4" />
                {isZh ? "\u65b0\u5efa\u9879\u76ee" : "New Project"}
              </button>
            </div>

            {/* -- Recent projects list -- */}
            {recentActivity.length > 0 && (
              <section className="mt-14 w-full">
                <p className={`mb-4 text-xs font-bold uppercase tracking-[0.2em] ${workspaceSoftTextClass}`}>
                  {isZh ? "\u6700\u8fd1\u9879\u76ee" : "Recent"}
                </p>
                <div className="space-y-2">
                  {recentActivity.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        if (job.project_id) {
                          activateProjectJob(job.project_id, job.id);
                        }
                      }}
                      className={`flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-colors ${workspaceHoverPanelClass} ${isDarkTheme ? 'hover:bg-white/[0.04]' : 'hover:bg-[#fff8ef]'}`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${workspaceIconPanelClass}`}>
                        <AudioLines className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-semibold ${workspaceStrongTextClass}`}>{getJobDisplayTitle(job)}</p>
                        <p className={`mt-0.5 text-xs ${workspaceMutedCopyClass}`}>
                          {getStatusLabel(job.status)} · {formatRelativeTime(job.updated_at || job.created_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* -- Current session insight (if available) -- */}
            {homeSummaryPreview && primaryLibraryJob ? (
              <section className={`mt-10 w-full ${workspacePanelClass} p-6`}>
                <p className={workspaceEyebrowClass}>{isZh ? "\u6700\u65b0\u6458\u8981" : "Latest Insight"}</p>
                <h3 className={`mt-2 text-lg font-bold ${workspaceStrongTextClass}`}>
                  {getJobDisplayTitle(primaryLibraryJob)}
                </h3>
                <p className={`mt-3 text-sm leading-7 ${workspaceBodyTextClass}`}>
                  {homeSummaryPreview.slice(0, 300)}{homeSummaryPreview.length > 300 ? "\u2026" : ""}
                </p>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  // 聚焦模态的 skill 进程数据
  const focusSpotlightJob = selectedJob || spotlightJob;
  const focusSummaryArtifact = artifactState.find((a) => a.job_id === focusSpotlightJob?.id && a.kind === "quick_summary") || null;
  const focusInspirationArtifact = artifactState.find((a) => a.job_id === focusSpotlightJob?.id && a.kind === "inspiration_questions") || null;
  const focusSkillProgresses = PRIMARY_ARTIFACT_KINDS.map((kind) => {
    const p = primaryProgressByKind[kind];
    return {
      kind,
      label: p?.stageLabel || (isZh ? "未开始" : "Idle"),
      tone: p?.tone || ("idle" as const),
      stage: p?.stage || 0,
    };
  });

  void renderLegacyLibraryShell;

  return (
    <>
      {(landing === "agent")
        ? renderAgentShell()
        : (landing === "dashboard" || landing === "workspace")
          ? renderDashboardShell()
          : (landing === "capture" || landing === "interview")
            ? renderLiveShell()
            : (landing === "library")
              ? renderAgentShell()
              : renderProcessingShell()}
      {renderProcessTicker()}
      <FocusInterviewModal
        open={focusModalOpen}
        onClose={() => setFocusModalOpen(false)}
        theme={currentTone}
        locale={locale}
        projectTitle={selectedProject?.title || spotlightProject?.title}
        jobTitle={focusSpotlightJob?.title || undefined}
        isRecording={Boolean(liveTranscriptSnapshot)}
        elapsedSeconds={0}
        summaryArtifact={focusSummaryArtifact}
        inspirationArtifact={focusInspirationArtifact}
        skillProgresses={focusSkillProgresses}
      />
      <Dialog open={processingModalOpen && landing !== "processing"} onOpenChange={setProcessingModalOpen}>
        <DialogContent className={`w-[calc(100vw-2rem)] max-w-4xl lg:w-full mx-auto overflow-hidden p-0 [&>button]:hidden ${workspaceProcessDialogClass}`}>
          {renderProcessCanvas({
            modal: true,
            onClose: () => setProcessingModalOpen(false),
          })}
        </DialogContent>
      </Dialog>
      <Dialog
        open={processSkillsOpen}
        onOpenChange={(open) => {
          setProcessSkillsOpen(open);
          if (!open) {
            setSkillDialogJobId(null);
            setSkillDialogFocusKind(null);
          }
        }}
      >
        <DialogContent className={`max-w-4xl ${workspaceDialogClass}`}>
          <DialogHeader>
            <DialogTitle className={workspaceStrongTextClass}>
              {skillDialogJob?.title || ui.skillModalTitle}
            </DialogTitle>
            <DialogDescription className={workspaceDialogDescriptionClass}>
              {skillDialogProject?.title ? `${skillDialogProject.title} · ${ui.skillModalDesc}` : ui.skillModalDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {renderSkillOutputCards(skillDialogKinds, ui.noArtifactsYet, {
              artifacts: skillDialogArtifacts,
              pendingKinds: skillDialogPendingKindSet,
              theme: skillDialogTone,
              useSelectedPrimaryProgress: skillDialogJob?.id === selectedJob?.id,
              hasStartedOverride: Boolean(skillDialogJob || selectedJob),
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(previewArtifact)} onOpenChange={(open) => {
        if (!open) {
          setPreviewArtifactId(null);
        }
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] lg:max-w-4xl lg:w-full mx-auto border-0 bg-transparent p-0 shadow-none">
          {previewArtifact ? (
            <div className="workspace-preview-shell">
              <DialogHeader className="workspace-preview-header">
                <div className="workspace-preview-title">
                  <DialogTitle className="workspace-heading text-[1.4rem]">{getArtifactHeadline(previewArtifact)}</DialogTitle>
                  <DialogDescription className="workspace-muted-copy">{getArtifactUpdatedLabel(previewArtifact)}</DialogDescription>
                </div>
              </DialogHeader>
              <div className="workspace-scroll-content workspace-preview-scroll whitespace-pre-wrap text-sm text-slate-700">
                {(previewArtifact.kind === "publish_script" ? parsedPreviewArtifact?.body : previewArtifact.content) || ui.noContent}
              </div>
              {previewArtifact.audio_url ? (
                <audio controls className="w-full">
                  <source src={previewArtifact.audio_url} />
                </audio>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={newSourceOpen} onOpenChange={setNewSourceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ui.importSourceTitle}</DialogTitle>
            <DialogDescription>
              {ui.importSourceDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="source-url">URL</label>
              <Input
                id="source-url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.com/article"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="source-title">{ui.sourceTitleOptional}</label>
              <Input
                id="source-title"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder={ui.sourceTitlePlaceholder}
              />
            </div>
            {sourceError ? <p className="text-sm text-rose-600">{sourceError}</p> : null}
            <Button
              onClick={() => importSource(sourceUrl, sourceTitle, "url")}
              disabled={isImportingSource || !sourceUrl.trim()}
              className="workspace-primary-button"
            >
              {isImportingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {ui.importSourceAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ui.projectDialogTitle}</DialogTitle>
            <DialogDescription>{ui.projectDialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-title">{ui.projectName}</label>
              <Input
                id="project-title"
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder={ui.projectNamePlaceholder}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-description">{ui.projectDescription}</label>
              <Input
                id="project-description"
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder={ui.projectDescriptionPlaceholder}
              />
            </div>
            {projectError ? <p className="text-sm text-rose-600">{projectError}</p> : null}
            <Button onClick={createProject} disabled={isCreatingProject} className="workspace-primary-button">
              {isCreatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              {ui.createProjectAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}





