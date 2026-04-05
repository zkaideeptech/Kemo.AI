"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AudioLines,
  Bot,
  Check,
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
  NotebookText,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
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
  X,
  type LucideIcon,
} from "lucide-react";

import { LiveInterviewPanel } from "@/components/live-interview-panel";
import { KemoMark } from "@/components/kemo-mark";
import { NewJobForm } from "@/components/new-job-form";
import { WorkspaceThemeSwitcher } from "@/components/workspace-theme-switcher";

const MOCK_SCROLLING_TEXTS = [
  "正在提取会议核心信息...",
  "分析讲话者意图与关键指征...",
  "正在匹配业务相关术语库...",
  "正在梳理上下文时间线...",
  "智能排版计算与语义融合...",
  "准备输出最终纪要与执行项..."
];

function ProcessingMarquee() {
  return (
    <div className="overflow-hidden whitespace-nowrap opacity-80 mt-1" style={{ width: '100%', position: 'relative', height: '1.2rem' }}>
      <div 
        className="text-[11px] font-medium tracking-[0.08em] text-[#798e88] inline-block mt-0.5"
        style={{ animation: 'marquee 14s linear infinite', position: 'absolute', whiteSpace: 'nowrap' }}
      >
        {MOCK_SCROLLING_TEXTS.join("  •  ")}  •  {MOCK_SCROLLING_TEXTS.join("  •  ")}
      </div>
    </div>
  );
}
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

function getArtifactOrder(kind: ArtifactKind) {
  const index = TASK_ARTIFACT_ORDER.indexOf(kind);
  return index === -1 ? TASK_ARTIFACT_ORDER.length : index;
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

const LIVE_ALWAYS_ON_SKILL_KINDS: ArtifactKind[] = ["inspiration_questions", "publish_script"];

const SECONDARY_SKILL_ITEMS = FILE_SKILL_ITEMS.filter(
  (item) => !PRIMARY_ARTIFACT_DISPLAY_ORDER.includes(item.kind as PrimaryArtifactKind)
);

export function NotebookWorkspace({
  locale,
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
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [centerSection, setCenterSection] = useState<"interview" | "tasks" | "sources">("tasks");
  const [interviewDraftMode, setInterviewDraftMode] = useState<"live" | "file" | null>(null);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newSourceOpen, setNewSourceOpen] = useState(false);
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
  const [swipedJobId, setSwipedJobId] = useState<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(initialJobProjectId ? [initialJobProjectId] : []);
  const [projectResults, setProjectResults] = useState<ProjectSearchResult[]>([]);
  const [isProjectSearching, setIsProjectSearching] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
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
  const [primaryProgressRuns, setPrimaryProgressRuns] = useState<Partial<Record<PrimaryArtifactKind, PrimaryArtifactProgressRun>>>({});
  const [isEditingJobTitle, setIsEditingJobTitle] = useState(false);
  const [jobTitleDraft, setJobTitleDraft] = useState("");
  const [isSavingJobTitle, setIsSavingJobTitle] = useState(false);
  const sidebarSearchInputRef = useRef<HTMLInputElement>(null);
  const jobTitleInputRef = useRef<HTMLInputElement>(null);
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
  const projectSwipeGestureRef = useRef<{
    projectId: string | null;
    startX: number;
  }>({
    projectId: null,
    startX: 0,
  });
  const jobSwipeGestureRef = useRef<{
    jobId: string | null;
    startX: number;
  }>({
    jobId: null,
    startX: 0,
  });

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

  const selectedJob = jobState.find((job) => job.id === selectedJobId && job.project_id === selectedProjectId) || null;
  const selectedJobPrimaryId = selectedJob?.id || null;
  const selectedJobPrimaryMode = selectedJob?.capture_mode || null;
  const selectedJobPrimaryStatus = selectedJob?.status || null;
  const transcript = transcripts.find((item) => item.job_id === selectedJob?.id) || null;
  const selectedArtifacts = useMemo(
    () =>
      artifactState
        .filter((artifact) => artifact.job_id === selectedJob?.id)
        .sort((left, right) => {
          const kindDelta = getArtifactOrder(left.kind as ArtifactKind) - getArtifactOrder(right.kind as ArtifactKind);
          if (kindDelta !== 0) {
            return kindDelta;
          }

          return new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime();
        }),
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
  const hasStarted = Boolean(transcriptContent.trim() || Object.values(primaryArtifactsByKind).some(Boolean));
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasSelectedJob = Boolean(selectedJob?.id);
  const projectLockedReason = "\u8bf7\u5148\u521b\u5efa\u9879\u76ee";
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
    setStudioFeedback(`${getArtifactLabel(kind)}\u751f\u6210\u4e2d`);
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
      setStudioFeedback(`${getArtifactLabel(kind)}\u5df2\u66f4\u65b0`);
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
  }, [clearPrimaryProgress, liveTranscriptSnapshot, selectedJob, startPrimaryProgress, transcriptContent]);

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
    setIsEditingJobTitle(false);
    setIsSavingJobTitle(false);
    setJobTitleDraft(selectedJob?.title || "");
  }, [selectedJob?.id, selectedJob?.title]);

  useEffect(() => {
    if (!isEditingJobTitle) {
      return;
    }

    window.requestAnimationFrame(() => {
      jobTitleInputRef.current?.focus();
      jobTitleInputRef.current?.select();
    });
  }, [isEditingJobTitle]);

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

  async function toggleJobFavorite(job: JobRow) {
    const isFavorite = favoriteJobIds.has(job.id);

    if (isFavorite) {
      await fetch(`/api/favorites?jobId=${job.id}`, { method: "DELETE" });
      setFavoriteState((prev) => prev.filter((favorite) => !(favorite.job_id === job.id && !favorite.artifact_id)));
      setSwipedJobId(null);
      return;
    }

    const transcriptText =
      transcripts.find((item) => item.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const excerpt = transcriptText.replace(/\s+/g, " ").trim().slice(0, 160) || null;

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
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      return;
    }

    setFavoriteState((prev) => {
      const next = prev.filter((favorite) => !(favorite.job_id === job.id && !favorite.artifact_id));
      return [json.data.favorite, ...next];
    });
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

    setCenterSection("tasks");
    setInterviewDraftMode(null);
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
    setCenterSection("tasks");
    setStudioFeedback("\u6b63\u5728\u5b9a\u7a3f\u53d1\u5e03\u7a3f\u3001\u6458\u8981\u4e0e\u7075\u611f\u63d0\u95ee");
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
    if (!selectedProjectId) {
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
      return { jobId: reusableJob.id, statusText: "\u5df2\u63a5\u5165\u5f53\u524d\u5b9e\u65f6\u8bbf\u8c08" };
    }

    const title = `\u5b9e\u65f6\u8bbf\u8c08 ${new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

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

    if (!res.ok || !json.ok) {
      return { jobId: null, statusText: json?.error?.message || "\u65e0\u6cd5\u521b\u5efa\u5b9e\u65f6\u8bbf\u8c08" };
    }

    const createdJob = json.data.job as JobRow;
    handleJobCreated(createdJob);
    return { jobId: createdJob.id, statusText: "\u5df2\u521b\u5efa\u5b9e\u65f6\u8bbf\u8c08" };
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

  function openNewInterviewForProject(projectId: string) {
    activateProject(projectId);
    setInterviewDraftMode(null);
    setCenterSection("interview");
  }

  function openLiveStarter() {
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

  function openFileStarter() {
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

  function handleProjectSwipeStart(projectId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    projectSwipeGestureRef.current = {
      projectId,
      startX: event.clientX,
    };
  }

  function handleProjectSwipeEnd(projectId: string, event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = projectSwipeGestureRef.current;
    if (gesture.projectId !== projectId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    if (deltaX <= -20) {
      setSwipedProjectId(projectId);
      setSwipedJobId(null);
    } else if (deltaX >= 20) {
      setSwipedProjectId(null);
    }

    projectSwipeGestureRef.current = {
      projectId: null,
      startX: 0,
    };
  }

  function handleProjectSwipeCancel() {
    projectSwipeGestureRef.current = {
      projectId: null,
      startX: 0,
    };
  }

  function handleJobSwipeStart(jobId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    jobSwipeGestureRef.current = {
      jobId,
      startX: event.clientX,
    };
  }

  function handleJobSwipeEnd(jobId: string, event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = jobSwipeGestureRef.current;
    if (gesture.jobId !== jobId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    if (deltaX <= -26) {
      setSwipedJobId(jobId);
      setSwipedProjectId(null);
    } else if (deltaX >= 26) {
      setSwipedJobId(null);
    }

    jobSwipeGestureRef.current = {
      jobId: null,
      startX: 0,
    };
  }

  function handleJobSwipeCancel() {
    jobSwipeGestureRef.current = {
      jobId: null,
      startX: 0,
    };
  }

  function getJobDisplayTitle(job: JobRow) {
    const transcriptText =
      transcripts.find((item) => item.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const normalized = transcriptText.replace(/\s+/g, " ").trim();
    const summary = normalized ? `${normalized.slice(0, 28)}${normalized.length > 28 ? "\u2026" : ""}` : null;
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

  async function saveJobTitle() {
    if (!selectedJob) {
      return;
    }

    const nextTitle = jobTitleDraft.trim();
    const currentTitle = (selectedJob.title || "").trim();

    if (!nextTitle) {
      setStudioFeedback("\u6807\u9898\u4e0d\u80fd\u4e3a\u7a7a");
      return;
    }

    if (nextTitle === currentTitle) {
      setIsEditingJobTitle(false);
      return;
    }

    setIsSavingJobTitle(true);

    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setStudioFeedback(json?.error?.message || "\u6807\u9898\u66f4\u65b0\u5931\u8d25");
        return;
      }

      const updatedJob = json.data.job as JobRow;
      setJobState((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      setStudioFeedback("\u6807\u9898\u5df2\u66f4\u65b0");
      setIsEditingJobTitle(false);
    } catch {
      setStudioFeedback("\u6807\u9898\u66f4\u65b0\u5931\u8d25");
    } finally {
      setIsSavingJobTitle(false);
    }
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

  function getSkillProgressSnapshot(kind: ArtifactKind): PrimaryArtifactProgressSnapshot {
    if (isPrimaryArtifactKind(kind)) {
      return primaryProgressByKind[kind];
    }

    const artifact = selectedArtifacts.find((candidate) => candidate.kind === kind) || null;
    const isPending = pendingArtifactKindSet.has(kind);

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

  function renderArtifactCard(artifact: WorkspaceArtifact) {
    const parsedArtifact = artifact.kind === "publish_script"
      ? parseArtifactContent(artifact.content || "")
      : null;
    const isRefreshing = pendingArtifactKindSet.has(artifact.kind as ArtifactKind);
    const primaryKind = isPrimaryArtifactKind(artifact.kind) ? artifact.kind : null;

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
              <Star
                className={`h-4 w-4 ${favoriteArtifactIds.has(artifact.id) ? "fill-[#00dcbf] text-[#00dcbf]" : ""}`}
              />
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
        title: getArtifactLabel(kind),
        icon: PRIMARY_ARTIFACT_CONFIG[kind].icon,
      };
    }

    const item = FILE_SKILL_ITEMS.find((candidate) => candidate.kind === kind);
    return {
      title: item?.title || getArtifactLabel(kind),
      icon: item?.icon || Sparkles,
    };
  }

  function toggleSkillCard(kind: ArtifactKind, isPrimary = false) {
    const isOpen = openedSkillKinds.includes(kind);

    if (isOpen) {
      const nextOpenedKinds = openedSkillKinds.filter((item) => item !== kind);
      setOpenedSkillKinds(nextOpenedKinds);
      setCollapsedSkillKinds((prev) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      });
      setSelectedSkillKind((prev) => (prev === kind ? nextOpenedKinds[nextOpenedKinds.length - 1] || null : prev));
      return;
    }

    setSelectedSkillKind(kind);
    setCollapsedSkillKinds((prev) => ({ ...prev, [kind]: false }));
    setOpenedSkillKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));

    if (isPrimary) {
      setActivePrimaryKind(kind as PrimaryArtifactKind);
      setCenterSection("tasks");
      return;
    }

    const hasArtifact = selectedArtifacts.some((candidate) => candidate.kind === kind);
    if (!hasArtifact && !pendingArtifactKindSet.has(kind)) {
      void generateArtifact(kind);
    }
  }

  function renderStudioButton(
    kind: ArtifactKind,
    config: { title: string; icon: LucideIcon; isPrimary?: boolean; accent?: boolean }
  ) {
    const isPending = pendingArtifactKindSet.has(kind);
    const isSelected = hasStarted && openedSkillKinds.includes(kind);
    const Icon = config.icon;

    return (
      <button
        key={`studio-btn-${kind}`}
        type="button"
        onClick={() => toggleSkillCard(kind, config.isPrimary)}
        disabled={!selectedJob || isSavingClarifications}
        className={`relative flex flex-col items-start p-3.5 rounded-xl transition-all border outline-none text-left w-full h-full ${
          isSelected
            ? "border-[#00dcbf]/35 bg-[#ecfffb] shadow-sm ring-1 ring-[#00dcbf]/30"
            : "border-transparent bg-slate-50/80 hover:bg-slate-100 hover:border-slate-200"
        }`}
      >
        <span className="mb-2">
          {isPending ? (
            <Loader2 className={`h-4 w-4 animate-spin ${isSelected ? "text-[#00dcbf]" : "text-slate-500"}`} />
          ) : (
            <Icon className={`h-4 w-4 ${isSelected ? "text-[#00dcbf]" : "text-slate-500"}`} />
          )}
        </span>
        <span className={`text-[0.8rem] font-medium block w-full truncate ${isSelected ? "text-[#006b5c]" : "text-slate-700"}`}>
          {config.title}
        </span>
      </button>
    );
  }

  function renderSkillOutputCard(kind: ArtifactKind) {
    const artifact = selectedArtifacts.find((candidate) => candidate.kind === kind) || null;
    const progress = getSkillProgressSnapshot(kind);
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
          "workspace-skill-output-card-active",
          isCurrent ? "workspace-skill-output-card-current" : "",
        ].filter(Boolean).join(" ")}
      >
        <div className="workspace-primary-progress-card-head workspace-skill-output-card-head">
          <div className="workspace-card-title-row">
            {progress.tone === "running" ? (
              <Loader2 className="workspace-card-title-icon animate-spin text-[#00dcbf]" />
            ) : (
              <Icon className="workspace-card-title-icon text-[#00dcbf]" />
            )}
            <h4 className="workspace-heading text-[1rem]">{title}</h4>
          </div>
          <div className="workspace-skill-output-card-actions">
            <button
              type="button"
              className="workspace-inline-action"
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
              className="workspace-inline-action"
              onClick={() => {
                if (artifact) {
                  void toggleFavorite(artifact);
                }
              }}
              aria-label={isFavorite ? "\u53d6\u6d88\u6536\u85cf" : "\u6536\u85cf"}
              title={isFavorite ? "\u53d6\u6d88\u6536\u85cf" : "\u6536\u85cf"}
              disabled={!artifact}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-[#00dcbf] text-[#00dcbf]" : ""}`} />
            </button>
          </div>
        </div>
        {renderProgressSnapshot(progress, `skill-${kind}`, true)}
        {!isCollapsed ? (
          <div className="workspace-skill-output-preview">
            {content || (progress.tone === "running" ? <ProcessingMarquee /> : fallbackContent)}
          </div>
        ) : null}
      </section>
    );
  }

  function renderSkillOutputCards(forcedKinds?: ArtifactKind[], emptyCopy?: string) {
    const skillKinds = forcedKinds?.length ? forcedKinds : openedSkillKinds;
    const isForcedStack = Boolean(forcedKinds?.length);

    if ((!hasStarted && !isForcedStack) || !skillKinds.length) {
      return (
        <div className="workspace-empty-card workspace-skill-output-empty">
          <p className="workspace-skill-output-empty-copy">
            {emptyCopy || (hasStarted
              ? "\u9009\u62e9\u4e00\u4e2a skill\uff0c\u8f93\u51fa\u4f1a\u663e\u793a\u5728\u8fd9\u91cc"
              : "\u5f00\u59cb\u4e00\u6761\u6765\u6e90\u540e\uff0c\u9009\u62e9 skill \u7ee7\u7eed\u63a8\u8fdb")}
          </p>
        </div>
      );
    }

    return (
      <div className="workspace-skill-output-stack">
        {skillKinds.map((kind) => renderSkillOutputCard(kind))}
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
          <Button type="button" className="workspace-primary-button" onClick={openLiveStarter}>
            {"\u5b9e\u65f6\u6a21\u5f0f"}
          </Button>
          <Button type="button" variant="secondary" onClick={openFileStarter}>
            {"\u6587\u4ef6\u6a21\u5f0f"}
          </Button>
        </div>
      </div>
    );
  }

  const activeSource = selectedSource || projectSources[0] || null;
  const displayCenterSection = centerSection;
  const isInterviewStarterSection = displayCenterSection === "interview";
  const isLiveStarterMode = isInterviewStarterSection && interviewDraftMode === "live";
  const isFileStarterMode = isInterviewStarterSection && interviewDraftMode === "file";
  const isLiveSkillRailMode = isLiveStarterMode || selectedJob?.capture_mode === "live";
  const activePrimaryArtifact = primaryArtifactsByKind[activePrimaryKind];
  const activePrimaryConfig = PRIMARY_ARTIFACT_CONFIG[activePrimaryKind];
  const shouldDockActivePrimaryBelowRecorder =
    displayCenterSection === "tasks" && selectedJob?.capture_mode === "live";

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
                  <h4 className="workspace-heading text-[1rem]">{getArtifactLabel(activePrimaryKind)}</h4>
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
            {transcriptContent || "\u5f00\u59cb\u540e\u663e\u793a\u8f6c\u5199\u3002"}
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
          <>
            <LiveInterviewPanel
              onTranscriptChange={setLiveTranscriptSnapshot}
              onStatusChange={setLiveCaptureStatus}
              onEnsureJob={ensureLiveJob}
              onFinalizeStarted={handleLiveFinalizeStarted}
              onFinalizeSettled={handleLiveFinalizeSettled}
              onFinalized={handleLiveFinalized}
              disabled={!hasSelectedProject}
              disabledReason={projectLockedReason}
              compact={false}
            />
            {renderLiveTranscriptFocusCard()}
          </>
        ) : (
          <NewJobForm
            embedded
            plan={plan}
            projectId={selectedProjectId}
            onCreated={handleJobCreated}
            onImportedSource={handleSourceImported}
          />
        )}
      </div>
    );
  }
  const centerSectionContent =
    displayCenterSection === "interview" ? (
      <div className="workspace-center-section-body">
        {renderInterviewStarterContent()}
      </div>
    ) : displayCenterSection === "tasks" ? (
      <div className="workspace-center-section-body">
        {hasSelectedJob ? (
          <div className="workspace-task-groups">
            {shouldDockActivePrimaryBelowRecorder ? renderLiveTranscriptFocusCard() : renderActivePrimaryTaskPanel()}
          </div>
        ) : (
          <div className="workspace-center-empty-state">
            {renderCenterEmptyState("source")}
          </div>
        )}
      </div>
    ) : (
      <div className="workspace-center-section-body">
        <div className="workspace-center-section-head">
          <div className="workspace-center-section-copy">
            <p className="workspace-kicker">{"\u6765\u6e90"}</p>
            <h3 className="workspace-heading">{activeSource?.title || activeSource?.url || "\u6765\u6e90"}</h3>
            <p className="workspace-muted-copy">
              {activeSource ? activeSource.status : hasSelectedProject ? "\u8fd8\u6ca1\u6709\u6765\u6e90\u3002" : "\u7b49\u5f85\u9009\u62e9\u9879\u76ee\u3002"}
            </p>
          </div>
          {activeSource?.url ? (
            <a href={activeSource.url} target="_blank" rel="noreferrer" className="workspace-inline-action">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {activeSource ? (
          <div className="grid gap-4">
            <div className="workspace-source-meta">
              <div className="min-w-0">
                <p className="workspace-kicker">{"\u5f53\u524d\u6765\u6e90"}</p>
                <h4 className="workspace-heading text-[1.05rem]">{activeSource.title || activeSource.url || "\u6765\u6e90"}</h4>
              </div>
              <div className="workspace-status-pill">{activeSource.status}</div>
            </div>
            <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
              {activeSource.extracted_text || activeSource.raw_text || "\u6765\u6e90\u6b63\u6587\u8fd8\u672a\u6293\u53d6\u5b8c\u6210\u3002"}
            </div>
          </div>
        ) : (
          <div className="workspace-center-empty-state">
            {renderCenterEmptyState("source")}
          </div>
        )}
      </div>
    );
  return (
    <>
      <header className="w-full flex-shrink-0 flex items-center justify-between px-6 h-[4rem]">
        <Link href={`/${locale}/app/jobs`} className="flex items-center gap-3 group">
          <span className="flex items-center justify-center bg-white text-black p-1.5 rounded-xl shadow-sm border border-slate-200">
            <KemoMark className="w-5 h-5" />
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 group-hover:opacity-80 transition-opacity">kemo</span>
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">workspace</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <WorkspaceThemeSwitcher />

          <Link
            href={`/${locale}/app/settings`}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 transition-colors"
            title={"\u7cfb\u7edf\u8bbe\u7f6e"}
          >
            <Settings className="w-5 h-5" />
          </Link>

          <button className="p-2 ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 transition-colors" title={"\u8d26\u53f7\u4e2d\u5fc3"}>
            <User className="w-5 h-5" />
          </button>
        </div>
      </header>
      <div className={`workspace-shell ${collapsed ? "workspace-shell-sidebar-collapsed" : ""}`}>
        <aside className={`workspace-sidebar workspace-sidebar-minimal ${collapsed ? "workspace-sidebar-collapsed" : ""}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/10 dark:border-white/5 mb-3">
            {!collapsed ? <span className="font-semibold text-[1.05rem] text-slate-800 dark:text-slate-200 tracking-tight">{"\u9879\u76ee"}</span> : <span />}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="workspace-flat-icon-button p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              aria-label={collapsed ? "\u5c55\u5f00\u4fa7\u680f" : "\u6536\u8d77\u4fa7\u680f"}
              title={collapsed ? "\u5c55\u5f00\u4fa7\u680f" : "\u6536\u8d77\u4fa7\u680f"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {!collapsed ? (
            <>
              <div className="workspace-sidebar-stack">
                <button type="button" className="workspace-sidebar-item" onClick={() => setNewProjectOpen(true)}>
                  <FolderPlus className="workspace-sidebar-item-icon" />
                  <span>{"\u65b0\u5efa\u9879\u76ee"}</span>
                </button>

                <button
                  type="button"
                  className={`workspace-sidebar-item ${sidebarSearchOpen ? "workspace-sidebar-item-active" : ""}`}
                  onClick={() => setSidebarSearchOpen((value) => !value)}
                  aria-expanded={sidebarSearchOpen}
                >
                  <Search className="workspace-sidebar-item-icon" />
                  <span>{"\u641c\u7d22\u9879\u76ee"}</span>
                </button>

                {sidebarSearchOpen ? (
                  <div className="workspace-sidebar-search-panel">
                    <label className="workspace-sidebar-search">
                      <Search className="workspace-sidebar-item-icon" />
                      <input
                        ref={sidebarSearchInputRef}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={hasSelectedProject ? "\u641c\u7d22\u5f53\u524d\u9879\u76ee" : "\u8bf7\u5148\u9009\u62e9\u9879\u76ee"}
                        disabled={!hasSelectedProject}
                      />
                    </label>

                    {hasSelectedProject ? (
                      search.trim().length >= 2 ? (
                        <div className="workspace-sidebar-results">
                          <div className="workspace-sidebar-search-status">
                            {isProjectSearching ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Search className="h-3.5 w-3.5" />
                            )}
                            <span>{isProjectSearching ? "\u641c\u7d22\u4e2d" : `${projectResults.length} \u6761\u7ed3\u679c`}</span>
                          </div>
                          {projectResults.length ? (
                            projectResults.map((result) => (
                              <button
                                key={result.id}
                                type="button"
                                onClick={() => jumpToSearchResult(result)}
                                className="workspace-sidebar-result"
                              >
                                <span className="workspace-sidebar-result-kind">{result.kind}</span>
                                <span className="min-w-0 flex-1 line-clamp-2 whitespace-normal break-words leading-tight">{result.title}</span>
                              </button>
                            ))
                          ) : (
                            <p className="workspace-sidebar-empty-note">{"\u9879\u76ee\u5185\u6682\u65e0\u5339\u914d\u9879"}</p>
                          )}
                        </div>
                      ) : (
                        <p className="workspace-sidebar-empty-note">{"\u8f93\u5165\u4e24\u4e2a\u4ee5\u4e0a\u5b57\u7b26\u540e\u4f1a\u641c\u7d22\u5f53\u524d\u9879\u76ee\u5185\u5bb9"}</p>
                      )
                    ) : (
                      <p className="workspace-sidebar-empty-note">{"\u5148\u521b\u5efa\u5e76\u9009\u62e9\u4e00\u4e2a\u9879\u76ee\uff0c\u518d\u641c\u7d22\u5176\u4e2d\u7684\u8bbf\u8c08\u3001\u6765\u6e90\u548c\u8f93\u51fa"}</p>
                    )}
                  </div>
                ) : null}

                <div className="workspace-sidebar-project-list">
                  {projectState.length ? (
                    projectState.map((project) => {
                      const isProjectExpanded = expandedProjectIds.includes(project.id);
                      const projectJobs = jobsByProject.get(project.id) || [];
                      const isProjectSwiped = swipedProjectId === project.id;

                      return (
                        <div
                          key={project.id}
                          className={`workspace-sidebar-project ${selectedProjectId === project.id ? "workspace-sidebar-project-active" : ""}`}
                        >
                          <div
                            className={`workspace-sidebar-project-swipe-shell ${isProjectSwiped ? "workspace-sidebar-project-swipe-shell-open" : ""}`}
                            onPointerDown={(event) => handleProjectSwipeStart(project.id, event)}
                            onPointerUp={(event) => handleProjectSwipeEnd(project.id, event)}
                            onPointerCancel={handleProjectSwipeCancel}
                          >
                            <div className="workspace-sidebar-project-actions" aria-hidden={!isProjectSwiped}>
                              <button
                                type="button"
                                onClick={() => openNewInterviewForProject(project.id)}
                                className="workspace-sidebar-project-action workspace-sidebar-project-action-create"
                                title={"\u65b0\u5efa\u5f55\u97f3"}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{"\u65b0\u5efa"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteProject(project)}
                                className="workspace-sidebar-project-action workspace-sidebar-project-action-delete"
                                title={"\u5220\u9664\u9879\u76ee"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{"\u5220\u9664"}</span>
                              </button>
                            </div>
                            <div className="workspace-sidebar-project-head">
                              <button
                                type="button"
                                onClick={() => toggleProjectExpanded(project.id)}
                                className="workspace-flat-icon-button workspace-sidebar-project-toggle"
                                aria-label={isProjectExpanded ? "\u6536\u8d77\u9879\u76ee" : "\u5c55\u5f00\u9879\u76ee"}
                                aria-expanded={isProjectExpanded}
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${isProjectExpanded ? "" : "-rotate-90"}`} />
                              </button>

                              <button
                                type="button"
                                onClick={() => activateProject(project.id)}
                                className={`workspace-sidebar-item workspace-sidebar-project-button ${selectedProjectId === project.id ? "workspace-sidebar-item-active" : ""}`}
                              >
                                <Folder className="workspace-sidebar-item-icon" />
                                <span className="flex-1 min-w-0 line-clamp-2 whitespace-normal break-words leading-tight">{project.title}</span>
                              </button>

                              <span aria-hidden="true" className="workspace-sidebar-project-swipe-hint">
                                <ArrowLeft className="h-4 w-4" />
                              </span>
                            </div>
                          </div>

                          {isProjectExpanded ? (
                            <div className="workspace-sidebar-recordings">
                              {projectJobs.length ? (
                                projectJobs.map((job) => {
                                  const isJobSwiped = swipedJobId === job.id;
                                  const isJobFavorite = favoriteJobIds.has(job.id);

                                  return (
                                    <div
                                      key={job.id}
                                      className={`workspace-sidebar-recording-shell ${isJobSwiped ? "workspace-sidebar-recording-shell-open" : ""}`}
                                      onPointerDown={(event) => handleJobSwipeStart(job.id, event)}
                                      onPointerUp={(event) => handleJobSwipeEnd(job.id, event)}
                                      onPointerCancel={handleJobSwipeCancel}
                                    >
                                      <div className="workspace-sidebar-recording-actions" aria-hidden={!isJobSwiped}>
                                        <button
                                          type="button"
                                          onClick={() => void toggleJobFavorite(job)}
                                          className="workspace-sidebar-project-action workspace-sidebar-project-action-favorite"
                                          title={isJobFavorite ? "\u53d6\u6d88\u6536\u85cf" : "\u6536\u85cf"}
                                        >
                                          <Star className={`h-3.5 w-3.5 ${isJobFavorite ? "fill-[#00dcbf] text-[#00dcbf]" : ""}`} />
                                          <span>{isJobFavorite ? "\u53d6\u6d88" : "\u6536\u85cf"}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void deleteJob(job)}
                                          className="workspace-sidebar-project-action workspace-sidebar-project-action-delete"
                                          title={"\u5220\u9664\u5f55\u97f3"}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          <span>{"\u5220\u9664"}</span>
                                        </button>
                                      </div>

                                      <div className="workspace-sidebar-recording-head">
                                        <button
                                          type="button"
                                          onClick={() => activateProjectJob(project.id, job.id)}
                                          className={`workspace-sidebar-item workspace-sidebar-recording ${selectedJobId === job.id ? "workspace-sidebar-item-active" : ""}`}
                                        >
                                          <AudioLines className="workspace-sidebar-item-icon" />
                                          <span className="flex-1 min-w-0 line-clamp-2 whitespace-normal break-words leading-tight">{getJobDisplayTitle(job)}</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="workspace-sidebar-empty-note workspace-sidebar-empty-note-indented">{"\u6682\u65e0\u5f55\u97f3"}</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="workspace-sidebar-empty-note">{"\u5148\u65b0\u5efa\u4e00\u4e2a\u9879\u76ee\uff0c\u5f55\u97f3\u4f1a\u6309\u9879\u76ee\u5f52\u6863"}</p>
                  )}
                </div>
              </div>

              <div className="workspace-sidebar-footer">
                <Link href={`/${locale}/app/settings`} className="workspace-sidebar-item workspace-sidebar-settings">
                  <Settings className="workspace-sidebar-item-icon" />
                  <span>{"\u8bbe\u7f6e"}</span>
                </Link>
              </div>
            </>
          ) : null}
        </aside>

        <main className={`workspace-main ${rightRailCollapsed ? "workspace-main-right-collapsed" : ""}`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/10 dark:border-white/5 flex-shrink-0">
            <span className="font-semibold text-[1.05rem] text-slate-800 dark:text-slate-200 tracking-tight">{"\u5bf9\u8bdd"}</span>
          </div>
          <div className="workspace-main-stack px-6 overflow-hidden flex flex-col pt-4">
            {!hasSelectedProject ? (
              <div className="workspace-center-empty-state workspace-center-empty-state-project">
                {renderCenterEmptyState("project")}
              </div>
            ) : (
              <div className="flex-1 flex flex-col w-full max-w-[880px] mx-auto min-h-0 bg-transparent">
                <div className="flex-shrink-0 flex flex-col gap-2 mb-4">
                  <div className="workspace-center-board-title w-full">
                    {displayCenterSection === "sources" ? (
                      <>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{activeSource?.title || activeSource?.url || "\u6765\u6e90"}</h2>
                        <p className="text-sm text-slate-500">{activeSource?.status || "\u5f53\u524d\u9879\u76ee\u6765\u6e90\u5185\u5bb9"}</p>
                      </>
                    ) : displayCenterSection === "interview" ? (
                      <div className="h-1" />
                    ) : hasSelectedJob ? (
                      isEditingJobTitle ? (
                        <div className="workspace-editable-title-row">
                          <Input
                            ref={jobTitleInputRef}
                            value={jobTitleDraft}
                            onChange={(event) => setJobTitleDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveJobTitle();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setJobTitleDraft(selectedJob?.title || "");
                                setIsEditingJobTitle(false);
                              }
                            }}
                            className="workspace-title-input w-full"
                            placeholder={"\u8f93\u5165\u6587\u6863\u4e3b\u9898"}
                            disabled={isSavingJobTitle}
                          />
                          <div className="workspace-title-edit-actions">
                            <button
                              type="button"
                              onClick={() => void saveJobTitle()}
                              className="workspace-inline-action"
                              disabled={isSavingJobTitle}
                            >
                              {isSavingJobTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setJobTitleDraft(selectedJob?.title || "");
                                setIsEditingJobTitle(false);
                              }}
                              className="workspace-inline-action"
                              disabled={isSavingJobTitle}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="workspace-editable-title-row group">
                          <h2 className="text-[1.35rem] font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            {selectedJob?.title || "\u672a\u547d\u540d\u6587\u6863"}
                          </h2>
                          <button
                            type="button"
                            onClick={() => {
                              setJobTitleDraft(selectedJob?.title || "");
                              setIsEditingJobTitle(true);
                            }}
                            className="workspace-inline-action workspace-title-edit-trigger workspace-title-edit-trigger-visible"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="h-8" />
                    )}
                  </div>
                </div>

                {hasSelectedJob && selectedJob?.capture_mode === "live" && displayCenterSection === "tasks" && (
                  <div className="flex-shrink-0 mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
                    <LiveInterviewPanel
                      key={selectedProjectId || "workspace-live"}
                      onTranscriptChange={setLiveTranscriptSnapshot}
                      onStatusChange={setLiveCaptureStatus}
                      onEnsureJob={ensureLiveJob}
                      onFinalizeStarted={handleLiveFinalizeStarted}
                      onFinalizeSettled={handleLiveFinalizeSettled}
                      onFinalized={handleLiveFinalized}
                      disabled={!hasSelectedProject}
                      disabledReason={projectLockedReason}
                      compact={false}
                    />
                  </div>
                )}

                <div className="flex-1 w-full overflow-y-auto px-1">{centerSectionContent}</div>
              </div>
            )}
          </div>
        </main>

        <aside
          className={`workspace-col-right workspace-glass-panel relative flex flex-col pt-6 pb-4 px-4 ${rightRailCollapsed ? "workspace-right-rail-collapsed" : ""}`}
        >
          {!hasSelectedProject ? (
            <>
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100/10 dark:border-white/5 mb-2">
                {!rightRailCollapsed ? <span className="font-semibold text-[1.05rem] text-slate-800 dark:text-slate-200 tracking-tight">skill</span> : <span />}
                <button
                  type="button"
                  className="workspace-inline-action transition-opacity hover:opacity-100 opacity-60"
                  onClick={() => setRightRailCollapsed((prev) => !prev)}
                  aria-label={rightRailCollapsed ? "\u5c55\u5f00\u53f3\u4fa7\u680f" : "\u6298\u53e0\u53f3\u4fa7\u680f"}
                  title={rightRailCollapsed ? "\u5c55\u5f00\u53f3\u4fa7\u680f" : "\u6298\u53e0\u53f3\u4fa7\u680f"}
                >
                  {rightRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                </button>
              </div>
              {rightRailCollapsed ? (
                <div className="workspace-right-rail-collapsed-body">
                  <span className="workspace-right-rail-collapsed-label text-slate-400 text-xs">{"\u5c55\u5f00"}</span>
                </div>
              ) : (
                <div className="workspace-empty-card flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400 opacity-80">{"\u5c1a\u672a\u5efa\u7acb\u9879\u76ee\u5e93"}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100/10 dark:border-white/5 mb-2">
                {!rightRailCollapsed ? <span className="font-semibold text-[1.05rem] text-slate-800 dark:text-slate-200 tracking-tight">skill</span> : <span />}
                <button
                  type="button"
                  className="workspace-inline-action transition-opacity hover:opacity-100 opacity-60"
                  onClick={() => setRightRailCollapsed((prev) => !prev)}
                  aria-label={rightRailCollapsed ? "\u5c55\u5f00\u53f3\u4fa7\u680f" : "\u6298\u53e0\u53f3\u4fa7\u680f"}
                  title={rightRailCollapsed ? "\u5c55\u5f00\u53f3\u4fa7\u680f" : "\u6298\u53e0\u53f3\u4fa7\u680f"}
                >
                  {rightRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                </button>
              </div>
              {rightRailCollapsed ? (
                <div className="workspace-right-rail-collapsed-body mt-2">
                  <span className="workspace-right-rail-collapsed-label text-slate-400 text-xs">{"\u5c55\u5f00"}</span>
                </div>
              ) : (
                <div className="workspace-right-stream flex-1 flex flex-col overflow-y-auto pr-1 pb-4">
                  {displayCenterSection === "interview" && !interviewDraftMode ? (
                    renderSkillOutputCards([], "\u5148\u5728\u4e2d\u95f4\u680f\u9009\u62e9\u5b9e\u65f6\u6a21\u5f0f\u6216\u6587\u4ef6\u6a21\u5f0f\u3002")
                  ) : isLiveSkillRailMode ? (
                    renderSkillOutputCards(
                      LIVE_ALWAYS_ON_SKILL_KINDS,
                      "\u5b9e\u65f6\u6a21\u5f0f\u4e0b\uff0c\u300c\u7075\u611f\u8ffd\u95ee\u300d\u4e0e\u300c\u53d1\u5e03\u7a3f\u6574\u7406\u300d\u4f1a\u59cb\u7ec8\u663e\u793a\u5728\u8fd9\u91cc\u3002"
                    )
                  ) : isFileStarterMode ? (
                    renderSkillOutputCards([], "\u6587\u4ef6\u6a21\u5f0f\u4f1a\u5728\u5bf9\u8bdd\u7a3f\u521b\u5efa\u540e\uff0c\u518d\u5728\u8fd9\u91cc\u9009\u62e9\u9700\u8981\u7684 skill\u3002")
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        {PRIMARY_ARTIFACT_DISPLAY_ORDER.map((kind) =>
                          renderStudioButton(kind, {
                            title: getArtifactLabel(kind),
                            icon: PRIMARY_ARTIFACT_CONFIG[kind].icon,
                            isPrimary: true,
                          })
                        )}
                        {SECONDARY_SKILL_ITEMS.map((item) =>
                          renderStudioButton(item.kind, {
                            title: item.title,
                            icon: item.icon,
                            accent: item.accent,
                          })
                        )}
                      </div>

                      {renderSkillOutputCards()}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      <Dialog open={Boolean(previewArtifact)} onOpenChange={(open) => {
        if (!open) {
          setPreviewArtifactId(null);
        }
      }}>
        <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
          {previewArtifact ? (
            <div className="workspace-preview-shell">
              <DialogHeader className="workspace-preview-header">
                <div className="workspace-preview-title">
                  <DialogTitle className="workspace-heading text-[1.4rem]">{getArtifactHeadline(previewArtifact)}</DialogTitle>
                  <DialogDescription className="workspace-muted-copy">{getArtifactUpdatedLabel(previewArtifact)}</DialogDescription>
                </div>
              </DialogHeader>
              <div className="workspace-scroll-content workspace-preview-scroll whitespace-pre-wrap text-sm text-slate-700">
                {(previewArtifact.kind === "publish_script" ? parsedPreviewArtifact?.body : previewArtifact.content) || "\u6682\u65e0\u5185\u5bb9"}
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
            <DialogTitle>{"\u5bfc\u5165\u7f51\u9875\u6765\u6e90"}</DialogTitle>
            <DialogDescription>
              {"\u7c98\u8d34\u7f51\u9875\u94fe\u63a5\uff0c\u6293\u53d6\u5185\u5bb9\u5e76\u5f52\u6863\u5230\u5f53\u524d\u9879\u76ee\u3002"}
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
              <label className="text-sm font-medium text-slate-700" htmlFor="source-title">{"\u6765\u6e90\u6807\u9898\uff08\u53ef\u9009\uff09"}</label>
              <Input
                id="source-title"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder={"\u53ef\u7559\u7a7a\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u63d0\u53d6\u6807\u9898"}
              />
            </div>
            {sourceError ? <p className="text-sm text-rose-600">{sourceError}</p> : null}
            <Button
              onClick={() => importSource(sourceUrl, sourceTitle, "url")}
              disabled={isImportingSource || !sourceUrl.trim()}
              className="workspace-primary-button"
            >
              {isImportingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {"\u5bfc\u5165\u6765\u6e90"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{"\u65b0\u5efa\u9879\u76ee"}</DialogTitle>
            <DialogDescription>{"\u5148\u521b\u5efa\u4e00\u4e2a\u9879\u76ee\uff0c\u518d\u628a\u5f55\u97f3\u3001\u6765\u6e90\u548c\u8f93\u51fa\u5f52\u6863\u8fdb\u6765\u3002"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-title">{"\u9879\u76ee\u540d\u79f0"}</label>
              <Input
                id="project-title"
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder={"\u4f8b\u5982\uff1a\u65b0\u54c1\u53d1\u5e03\u4f1a"}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-description">{"\u9879\u76ee\u8bf4\u660e\uff08\u53ef\u9009\uff09"}</label>
              <Input
                id="project-description"
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder={"\u8bb0\u5f55\u8bbf\u8c08\u5bf9\u8c61\u3001\u76ee\u6807\u6216\u80cc\u666f"}
              />
            </div>
            {projectError ? <p className="text-sm text-rose-600">{projectError}</p> : null}
            <Button onClick={createProject} disabled={isCreatingProject} className="workspace-primary-button">
              {isCreatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              {"\u521b\u5efa\u9879\u76ee"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pendingArtifactKinds.length || isSavingClarifications ? <div className="workspace-loading-bar" /> : null}
    </>
  );
}

