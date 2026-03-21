"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
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
  NotebookText,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  ScrollText,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { LiveInterviewPanel } from "@/components/live-interview-panel";
import { KemoMark } from "@/components/kemo-mark";
import { NewJobForm } from "@/components/new-job-form";
import { WorkspaceThemeSwitcher } from "@/components/workspace-theme-switcher";
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
      const match = line.match(/^问题：(.+?)(?:｜线索：(.+))?$/);
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
  const segments = content.split(/请确认[:：]/);
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
    .map((line) => line.match(/^\d+[.、]\s*(.+)$/)?.[1]?.trim() || "")
    .filter(Boolean);

  return questionLines.map((question) => ({
    question,
    context,
  }));
}

function parseArtifactContent(content: string): ParsedArtifactContent {
  const clarificationBlock = extractTaggedSection(content, "待确认项");
  const bodyBlock = extractTaggedSection(content, "草案版正文");
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
    .replace(/\[待确认项\][\s\S]*?\[\/待确认项\]/i, "")
    .replace(/\[草案版正文\]|\[\/草案版正文\]/gi, "")
    .replace(/请确认[:：][\s\S]*$/i, "")
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
    eyebrow: "主稿",
    spotlight: "把原始访谈整理成可直接定稿的发布稿草稿。",
    placeholder: "停止后先生成发布稿草稿，这里会优先出现正文预览。",
  },
  quick_summary: {
    icon: Sparkles,
    eyebrow: "摘要",
    spotlight: "一屏看完这轮访谈的主结论、判断与重点句。",
    placeholder: "停止后会先补齐总结摘要，方便快速回看和对外同步。",
  },
  inspiration_questions: {
    icon: MessagesSquare,
    eyebrow: "追问",
    spotlight: "自动提炼下一轮采访该追问什么，避免灵感断掉。",
    placeholder: "定稿时会同步生成灵感提问，后续追访直接从这里接续。",
  },
};

function isPrimaryArtifactKind(kind: string): kind is PrimaryArtifactKind {
  return PRIMARY_ARTIFACT_KINDS.includes(kind as PrimaryArtifactKind);
}

const WORKSPACE_RAIL_ITEMS: Array<{
  kind: ArtifactKind;
  icon: LucideIcon;
  title: string;
  note: string;
  accent?: boolean;
}> = [
  {
    kind: "quick_summary",
    icon: NotebookText,
    title: "路演整理稿",
    note: "导出 DOCX",
  },
  {
    kind: "meeting_minutes",
    icon: ClipboardList,
    title: "会议纪要",
    note: "导出 DOCX",
  },
  {
    kind: "inspiration_questions",
    icon: Lightbulb,
    title: "关键洞察",
    note: "信号提炼",
  },
  {
    kind: "podcast_audio",
    icon: AudioLines,
    title: "AI 播客音频",
    note: "脚本 -> 音频",
  },
  {
    kind: "publish_script",
    icon: ScrollText,
    title: "正式主稿",
    note: "一键生成终版体面阅读稿",
    accent: true,
  },
];

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
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newInterviewOpen, setNewInterviewOpen] = useState(initialNewInterviewOpen);
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
  const [swipedProjectId, setSwipedProjectId] = useState<string | null>(null);
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
  const [liveCaptureStatus, setLiveCaptureStatus] = useState("准备开始实时访谈");
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
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasSelectedJob = Boolean(selectedJob?.id);
  const projectLockedReason = "请先创建项目";
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
            label: artifact ? "更新中" : "生成中",
            tone: "running",
            stage: 2,
            stageLabel: "处理中",
          };
          return;
        }

        if (run.stepIndex > 0) {
          snapshots[kind] = {
            label: "排队中",
            tone: "queued",
            stage: 1,
            stageLabel: "待处理",
          };
          return;
        }

        snapshots[kind] = {
          label: "生成中",
          tone: "running",
          stage: 2,
          stageLabel: "处理中",
        };
        return;
      }

      if (!artifact) {
        snapshots[kind] = {
          label: "待生成",
          tone: "idle",
          stage: 0,
          stageLabel: "未开始",
        };
        return;
      }

      if (artifact.status === "draft") {
        snapshots[kind] = {
          label: "实时草稿",
          tone: "draft",
          stage: 1,
          stageLabel: "草稿",
        };
        return;
      }

      snapshots[kind] = {
        label: "已定稿",
        tone: "ready",
        stage: 3,
        stageLabel: "已完成",
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
    setStudioFeedback(`${getArtifactLabel(kind)}生成中`);
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
        setStudioFeedback(json?.error?.message || "生成失败");
        return null;
      }

      const nextArtifact = json.data.artifact as WorkspaceArtifact;
      mergeArtifactsIntoState([nextArtifact]);
      setStudioFeedback(`${getArtifactLabel(kind)}已更新`);
      setCenterSection("tasks");
      return nextArtifact;
    } catch {
      setStudioFeedback("生成失败");
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

    if (liveCaptureStatus.includes("正在整理最终文稿")) {
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
          setStudioFeedback("实时草稿已更新");
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

    if (liveCaptureStatus.includes("正在整理最终文稿")) {
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
            setStudioFeedback(`灵感追问已刷新 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
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
    if (!hasSelectedProject && initialNewInterviewOpen) {
      setNewInterviewOpen(false);
      setNewProjectOpen(true);
    }
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
      setProjectError("项目名称不能为空");
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
      setProjectError(json?.error?.message || "创建项目失败");
      setIsCreatingProject(false);
      return;
    }

    setProjectState((prev) => [json.data.project, ...prev]);
    setSelectedProjectId(json.data.project.id);
    setSelectedJobId(null);
    setSelectedSourceId(null);
    setCenterSection("tasks");
    setNewProjectTitle("");
    setNewProjectDescription("");
    setNewProjectOpen(false);
    setIsCreatingProject(false);
  }

  async function deleteProject(project: ProjectRow) {
    const confirmed = window.confirm(`删除「${project.title}」以及该项目下的全部录音和输出？`);
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      window.alert(json?.error?.message || "删除项目失败");
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

    if (selectedProjectId === project.id) {
      setSelectedProjectId(nextProjectId);
      setSelectedJobId(null);
      setSelectedSourceId(null);
      setCenterSection("tasks");
      setLiveTranscriptSnapshot("");
      setLiveCaptureStatus("准备开始实时访谈");
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
        setSourceError(json?.error?.message || "导入来源失败");
        return;
      }

      setSourceState((prev) => [json.data.source, ...prev.filter((item) => item.id !== json.data.source.id)]);
      setSelectedSourceId(json.data.source.id);
      setCenterSection("sources");
      setSourceUrl("");
      setSourceTitle("");
      setNewSourceOpen(false);
    } catch {
      setSourceError("导入来源失败");
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
    setStudioFeedback("正在确认并重生成发布稿");

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
        setStudioFeedback(saveJson?.error?.message || "确认信息保存失败");
        return;
      }

      const transcriptText = liveTranscriptSnapshot || transcriptContent || "";
      await requestArtifact("publish_script", transcriptText);
      await Promise.all([
        requestArtifact("quick_summary", transcriptText),
        requestArtifact("inspiration_questions", transcriptText),
      ]);
      setStudioFeedback("确认已写入，发布稿与追问已刷新");
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

  function jumpToSearchResult(result: ProjectSearchResult) {
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
    setJobState((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
    setSelectedProjectId(job.project_id);
    setSelectedJobId(job.id);
    setCenterSection("tasks");
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("准备开始实时访谈");
    setNewInterviewOpen(false);
  }

  function handleSourceImported(source: SourceRow) {
    setSourceState((prev) => [source, ...prev.filter((item) => item.id !== source.id)]);
    setSelectedProjectId(source.project_id);
    setSelectedSourceId(source.id);
    setSelectedJobId(source.job_id || null);
    setCenterSection("sources");
    setNewInterviewOpen(false);
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
      setCenterSection("tasks");
      setStudioFeedback("主结果已定稿");
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
    setCenterSection("tasks");
    setStudioFeedback("正在定稿发布稿、摘要与灵感提问");
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
      return { jobId: reusableJob.id, statusText: "已接入当前实时访谈" };
    }

    const title = `实时访谈 ${new Date().toLocaleString("zh-CN", {
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
      return { jobId: null, statusText: json?.error?.message || "无法创建实时访谈" };
    }

    const createdJob = json.data.job as JobRow;
    handleJobCreated(createdJob);
    return { jobId: createdJob.id, statusText: "已创建实时访谈" };
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
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("准备开始实时访谈");
    setSidebarSearchOpen(false);
    setExpandedProjectIds((prev) => (prev.includes(projectId) ? prev : [...prev, projectId]));
    setSwipedProjectId(null);
  }

  function activateProjectJob(projectId: string, jobId: string) {
    setSelectedProjectId(projectId);
    setSelectedJobId(jobId);
    setSelectedSourceId(null);
    setCenterSection("tasks");
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("准备开始实时访谈");
    setSidebarSearchOpen(false);
    setSwipedProjectId(null);
  }

  function openNewInterviewForProject(projectId: string) {
    activateProject(projectId);
    setNewInterviewOpen(true);
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
    if (deltaX <= -34) {
      setSwipedProjectId(projectId);
    } else if (deltaX >= 26) {
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

  function getJobDisplayTitle(job: JobRow) {
    const transcriptText =
      transcripts.find((item) => item.job_id === job.id)?.transcript_text ||
      job.live_transcript_snapshot ||
      "";
    const normalized = transcriptText.replace(/\s+/g, " ").trim();
    const summary = normalized ? `${normalized.slice(0, 28)}${normalized.length > 28 ? "…" : ""}` : null;
    const title = (job.title || "").trim();

    if (title) {
      return title;
    }

    if (summary) {
      return summary;
    }

    return "未命名访谈";
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
          .replace(/^\d+[.、]\s*/, "")
          .replace(/\*\*/g, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
      .filter((line) => !["总览：", "重点：", "待确认项", "草案版正文"].includes(line));

    const headline = candidates.find((line) => line.length >= 8) || candidates[0] || artifact.title;
    return headline.length > 48 ? `${headline.slice(0, 48)}…` : headline;
  }

  function getArtifactPreviewText(artifact: WorkspaceArtifact | null) {
    const body = getArtifactBody(artifact);
    if (!body) {
      return "";
    }

    const snippetLimit = artifact?.kind === "publish_script" ? 5 : artifact?.kind === "inspiration_questions" ? 3 : 4;
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const snippet = lines.slice(0, snippetLimit).join("\n");

    return snippet.length > 240 ? `${snippet.slice(0, 240)}…` : snippet;
  }

  function getArtifactUpdatedLabel(artifact: WorkspaceArtifact | null) {
    if (!artifact) {
      return "等待本轮生成";
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
        setStudioFeedback(`已复制「${title}」内容，可直接转发`);
        return;
      }
    } catch {
      // clipboard fallback continues below
    }

    setStudioFeedback("当前环境不支持直接转发");
  }

  async function saveJobTitle() {
    if (!selectedJob) {
      return;
    }

    const nextTitle = jobTitleDraft.trim();
    const currentTitle = (selectedJob.title || "").trim();

    if (!nextTitle) {
      setStudioFeedback("标题不能为空");
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
        setStudioFeedback(json?.error?.message || "标题更新失败");
        return;
      }

      const updatedJob = json.data.job as JobRow;
      setJobState((prev) => prev.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      setStudioFeedback("标题已更新");
      setIsEditingJobTitle(false);
    } catch {
      setStudioFeedback("标题更新失败");
    } finally {
      setIsSavingJobTitle(false);
    }
  }

  function renderPrimaryProgress(kind: PrimaryArtifactKind, compact = false) {
    const progress = primaryProgressByKind[kind];

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
              key={`${kind}-${step}`}
              className={[
                "workspace-progress-step",
                progress.stage >= step ? `workspace-progress-step-${progress.tone}` : "",
                progress.stage === step && progress.tone !== "ready" ? "workspace-progress-step-current" : "",
              ].filter(Boolean).join(" ")}
            />
          ))}
        </div>
      </div>
    );
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
                {isRefreshing ? "更新中" : artifact.status === "draft" ? "实时草稿" : artifact.status || artifact.kind}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void shareArtifact(artifact)}
              className="workspace-inline-action"
              aria-label={`转发${artifact.title}`}
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleFavorite(artifact)}
              className="workspace-inline-action"
              aria-label={favoriteArtifactIds.has(artifact.id) ? `取消收藏${artifact.title}` : `收藏${artifact.title}`}
            >
              <Star
                className={`h-4 w-4 ${favoriteArtifactIds.has(artifact.id) ? "fill-amber-400 text-amber-500" : ""}`}
              />
            </button>
          </div>
        </header>

        {primaryKind ? renderPrimaryProgress(primaryKind) : null}

        {artifact.kind === "publish_script" && parsedArtifact?.clarificationItems.length ? (
          <section className="workspace-clarification-card">
            <div className="workspace-clarification-head">
              <div>
                <p className="workspace-kicker">待确认</p>
                <h5 className="workspace-heading text-[0.96rem]">先在这里确认，再重生成正文</h5>
              </div>
              <span className="workspace-status-pill">{parsedArtifact.clarificationItems.length} 项</span>
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
                    placeholder="在这里补充姓名、称呼或关系判断"
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
                确认并重生成
              </Button>
              <p className="workspace-muted-copy">
                {isLoadingClarifications ? "正在读取历史确认…" : "答案会保存在当前录音下，后续生成会自动带入。"}
              </p>
            </div>
          </section>
        ) : null}

        <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
          {(artifact.kind === "publish_script" ? parsedArtifact?.body : artifact.content) || "生成中"}
        </div>
        <div className="workspace-artifact-footer">
          <span className="workspace-muted-copy">{getArtifactUpdatedLabel(artifact)}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="workspace-chip-button" onClick={() => openArtifactPreview(artifact)}>
              <ExternalLink className="h-3.5 w-3.5" />
              展开卡片
            </button>
            {getArtifactDownloadPath(artifact) ? (
              <a href={getArtifactDownloadPath(artifact) || undefined} className="workspace-chip-button">
                <Download className="h-3.5 w-3.5" />
                导出 docx
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

  function renderPrimaryRailCard(kind: PrimaryArtifactKind) {
    const artifact = primaryArtifactsByKind[kind];
    const config = PRIMARY_ARTIFACT_CONFIG[kind];
    const Icon = config.icon;
    const isActive = activePrimaryKind === kind;
    const isPending = pendingArtifactKindSet.has(kind);
    const previewText = artifact ? getArtifactPreviewText(artifact) : config.placeholder;

    return (
      <button
        key={`primary-rail-${kind}`}
        type="button"
        onClick={() => {
          setActivePrimaryKind(kind);
          setCenterSection("tasks");
        }}
        className={`workspace-primary-rail-card ${isActive ? "workspace-primary-rail-card-active" : ""}`}
      >
        <div className="workspace-primary-rail-card-head">
          <div className="workspace-card-title-row">
            {isPending ? (
              <Loader2 className="workspace-card-title-icon animate-spin" />
            ) : (
              <Icon className="workspace-card-title-icon" />
            )}
            <div className="min-w-0">
              <h4 className="workspace-heading text-[0.95rem]">{getArtifactLabel(kind)}</h4>
              <p className="workspace-muted-copy">{primaryProgressByKind[kind].label}</p>
            </div>
          </div>
        </div>
        {renderPrimaryProgress(kind)}
        <div className="workspace-primary-rail-card-preview">
          {previewText || "等待生成"}
        </div>
      </button>
    );
  }

  const activeSource = selectedSource || projectSources[0] || null;
  const displayCenterSection = centerSection === "sources" ? "sources" : "tasks";
  const activePrimaryArtifact = primaryArtifactsByKind[activePrimaryKind];
  const activePrimaryConfig = PRIMARY_ARTIFACT_CONFIG[activePrimaryKind];
  const shouldDockActivePrimaryBelowRecorder =
    displayCenterSection === "tasks" && selectedJob?.capture_mode === "live";

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
                <h4 className="workspace-heading text-[1rem]">实时转写</h4>
                <p className="workspace-muted-copy">
                  {selectedJob?.status === "completed" ? "访谈已结束，以下为整理后的完整转写" : liveCaptureStatus}
                </p>
              </div>
            </div>
          </header>
          <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
            {transcriptContent || "开始后显示转写。"}
          </div>
        </section>
      </div>
    );
  }

  const centerSectionContent =
    displayCenterSection === "tasks" ? (
      <div className="workspace-center-section-body">
        {hasSelectedJob ? (
          <div className="workspace-task-groups">
            {shouldDockActivePrimaryBelowRecorder ? renderLiveTranscriptFocusCard() : renderActivePrimaryTaskPanel()}
          </div>
        ) : (
          <div className="workspace-empty-card">
            <Bot className="h-5 w-5" />
            <div className="grid gap-3">
              <p className="workspace-muted-copy">选一条访谈后，这里会出现输出。</p>
              {!hasSelectedProject ? (
                <button type="button" className="workspace-chip-button" onClick={() => setNewProjectOpen(true)}>
                  <FolderPlus className="h-3.5 w-3.5" />
                  创建项目
                </button>
              ) : (
                <button type="button" className="workspace-chip-button" onClick={() => setNewInterviewOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  新建访谈
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="workspace-center-section-body">
        <div className="workspace-center-section-head">
          <div className="workspace-center-section-copy">
            <p className="workspace-kicker">来源</p>
            <h3 className="workspace-heading">{activeSource?.title || activeSource?.url || "来源"}</h3>
            <p className="workspace-muted-copy">
              {activeSource ? activeSource.status : hasSelectedProject ? "还没有来源。" : "先创建项目。"}
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
                <p className="workspace-kicker">当前来源</p>
                <h4 className="workspace-heading text-[1.05rem]">{activeSource.title || activeSource.url || "来源"}</h4>
              </div>
              <div className="workspace-status-pill">{activeSource.status}</div>
            </div>
            <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
              {activeSource.extracted_text || activeSource.raw_text || "来源正文还未提取完成。"}
            </div>
          </div>
        ) : (
          <div className="workspace-empty-card">
            <Link2 className="h-5 w-5" />
            <div className="grid gap-3">
              <p className="workspace-muted-copy">{hasSelectedProject ? "导入一个来源。" : "先创建项目。"}</p>
              <button
                type="button"
                className="workspace-chip-button"
                onClick={() => (hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true))}
              >
                <Link2 className="h-3.5 w-3.5" />
                {hasSelectedProject ? "导入来源" : "创建项目"}
              </button>
            </div>
          </div>
        )}
      </div>
    );

  return (
    <>
      <div className="workspace-topbar">
        <Link href={`/${locale}/app/jobs`} className="workspace-topbar-brand">
          <span className="workspace-topbar-brand-mark">
            <KemoMark className="workspace-topbar-brand-mark-icon" />
          </span>
          <span className="workspace-topbar-brand-copy">
            <span className="workspace-topbar-brand-name">kemo</span>
            <span className="workspace-topbar-brand-subtitle">workspace</span>
          </span>
        </Link>
        <WorkspaceThemeSwitcher />
      </div>
      <div className={`workspace-shell ${collapsed ? "workspace-shell-sidebar-collapsed" : ""}`}>
        <aside className={`workspace-sidebar workspace-sidebar-minimal ${collapsed ? "workspace-sidebar-collapsed" : ""}`}>
          <div className="workspace-sidebar-top">
            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="workspace-flat-icon-button workspace-sidebar-logo-trigger workspace-sidebar-logo-trigger-collapsed"
                aria-label="展开侧栏"
                title="展开侧栏"
              >
                <KemoMark className="workspace-sidebar-logo-mark" />
                <PanelLeftOpen className="workspace-sidebar-logo-expand" />
              </button>
            ) : (
              <div className="workspace-sidebar-brand" aria-hidden="true">
                <div className="workspace-sidebar-logo-display">
                  <KemoMark className="workspace-sidebar-logo-mark" />
                </div>
                <div className="workspace-sidebar-brand-copy">
                  <span className="workspace-sidebar-brand-name">kemo</span>
                  <span className="workspace-sidebar-brand-subtitle">notebook</span>
                </div>
              </div>
            )}

            {!collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="workspace-flat-icon-button workspace-sidebar-collapse-button"
                aria-label="收起侧栏"
                title="收起侧栏"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {!collapsed ? (
            <>
              <div className="workspace-sidebar-stack">
                <button type="button" className="workspace-sidebar-item" onClick={() => setNewProjectOpen(true)}>
                  <FolderPlus className="workspace-sidebar-item-icon" />
                  <span>新建项目</span>
                </button>

                <button
                  type="button"
                  className={`workspace-sidebar-item ${sidebarSearchOpen ? "workspace-sidebar-item-active" : ""}`}
                  onClick={() => setSidebarSearchOpen((value) => !value)}
                  aria-expanded={sidebarSearchOpen}
                >
                  <Search className="workspace-sidebar-item-icon" />
                  <span>搜索项目</span>
                </button>

                {sidebarSearchOpen ? (
                  <div className="workspace-sidebar-search-panel">
                    <label className="workspace-sidebar-search">
                      <Search className="workspace-sidebar-item-icon" />
                      <input
                        ref={sidebarSearchInputRef}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={hasSelectedProject ? "搜索当前项目" : "请先选择项目"}
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
                            <span>{isProjectSearching ? "搜索中" : `${projectResults.length} 条结果`}</span>
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
                                <span className="min-w-0 flex-1 truncate">{result.title}</span>
                              </button>
                            ))
                          ) : (
                            <p className="workspace-sidebar-empty-note">项目内暂无匹配项</p>
                          )}
                        </div>
                      ) : (
                        <p className="workspace-sidebar-empty-note">输入两个以上字符后会搜索当前项目内容</p>
                      )
                    ) : (
                      <p className="workspace-sidebar-empty-note">先创建并选择一个项目，再搜索其中的访谈、来源和输出</p>
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
                                title="新建录音"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>新建</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteProject(project)}
                                className="workspace-sidebar-project-action workspace-sidebar-project-action-delete"
                                title="删除项目"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>删除</span>
                              </button>
                            </div>
	                          <div className="workspace-sidebar-project-head">
	                            <button
	                              type="button"
	                              onClick={() => toggleProjectExpanded(project.id)}
                              className="workspace-flat-icon-button workspace-sidebar-project-toggle"
                              aria-label={isProjectExpanded ? "收起项目" : "展开项目"}
                              aria-expanded={isProjectExpanded}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${isProjectExpanded ? "" : "-rotate-90"}`}
                              />
                            </button>

	                            <button
	                              type="button"
	                              onClick={() => activateProject(project.id)}
                              className={`workspace-sidebar-item workspace-sidebar-project-button ${selectedProjectId === project.id ? "workspace-sidebar-item-active" : ""}`}
                            >
	                              <Folder className="workspace-sidebar-item-icon" />
	                              <span className="truncate">{project.title}</span>
	                            </button>
	                            <button
	                              type="button"
	                              onClick={() => openNewInterviewForProject(project.id)}
	                              className="workspace-flat-icon-button workspace-sidebar-project-add"
	                              aria-label="在该项目下新建录音"
	                              title="新建录音"
	                            >
	                              <Plus className="h-4 w-4" />
	                            </button>
	                          </div>
                          </div>

                          {isProjectExpanded ? (
                            <div className="workspace-sidebar-recordings">
                              {projectJobs.length ? (
                                projectJobs.map((job) => (
                                  <button
                                    key={job.id}
                                    type="button"
                                    onClick={() => activateProjectJob(project.id, job.id)}
                                    className={`workspace-sidebar-item workspace-sidebar-recording ${selectedJobId === job.id ? "workspace-sidebar-item-active" : ""}`}
                                  >
                                    <AudioLines className="workspace-sidebar-item-icon" />
                                    <span className="truncate">{getJobDisplayTitle(job)}</span>
                                  </button>
                                ))
                              ) : (
                                <p className="workspace-sidebar-empty-note workspace-sidebar-empty-note-indented">暂无录音</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="workspace-sidebar-empty-note">先新建一个项目，录音会按项目归档</p>
                  )}
                </div>
              </div>

              <div className="workspace-sidebar-footer">
                <Link href={`/${locale}/app/settings`} className="workspace-sidebar-item workspace-sidebar-settings">
                  <Settings className="workspace-sidebar-item-icon" />
                  <span>设置</span>
                </Link>
              </div>
            </>
          ) : null}
        </aside>

        <main className={`workspace-main ${rightRailCollapsed ? "workspace-main-right-collapsed" : ""}`}>
          <div className="workspace-main-stack">
            {/* 主内容上半区: Transcript/Live Capture */}
            <section className="workspace-col-left workspace-glass-panel">
              <div className="workspace-glass-panel-body workspace-glass-panel-body-main workspace-col-left-scroll">
                {!hasSelectedProject ? (
                  <section className="workspace-panel workspace-blocking-state">
                    <div className="workspace-blocking-copy workspace-blocking-copy-minimal">
                      <FolderPlus className="workspace-blocking-icon" />
                      <div className="grid gap-2">
                        <h2 className="workspace-heading">先创建项目</h2>
                        <p className="workspace-muted-copy">没有项目，录音和来源不会展开。</p>
                        <div className="workspace-search-toolbar">
                          <button type="button" className="workspace-chip-button" onClick={() => setNewProjectOpen(true)}>
                            <FolderPlus className="h-3.5 w-3.5" />
                            创建项目
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <LiveInterviewPanel
                    key={selectedProjectId || "workspace-live"}
                    onTranscriptChange={setLiveTranscriptSnapshot}
                    onStatusChange={setLiveCaptureStatus}
                  onEnsureJob={ensureLiveJob}
                  onFinalizeStarted={handleLiveFinalizeStarted}
                  onFinalizeSettled={handleLiveFinalizeSettled}
                  onFinalized={handleLiveFinalized}
                  afterRecorderSlot={shouldDockActivePrimaryBelowRecorder ? renderActivePrimaryTaskPanel("docked") : null}
                  onRequestUpload={() => setNewInterviewOpen(true)}
                  disabled={!hasSelectedProject}
                  disabledReason={projectLockedReason}
                  compact
                />
                )}
              </div>
            </section>

            {/* 主内容下半区: 主体大脑 */}
            <section className="workspace-col-mid workspace-glass-panel">
              <div className="workspace-glass-panel-header flex-col items-start gap-4">
                <div className="w-full text-center">
                  <div className="workspace-kemi-version">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" /> Kemi 2.5 Max
                  </div>
                </div>

                <div className="workspace-center-board-title w-full pt-2">
                  {displayCenterSection === "sources" ? (
                    <>
                      <h2 className="workspace-heading">{activeSource?.title || activeSource?.url || "来源"}</h2>
                      <p className="workspace-muted-copy">{activeSource?.status || "当前项目来源内容"}</p>
                    </>
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
                          placeholder="输入访谈主题"
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
                      <div className="workspace-editable-title-row">
                        <h2 className="workspace-heading text-lg">{selectedJob?.title || "未命名会议"}</h2>
                        <button
                          type="button"
                          onClick={() => {
                            setJobTitleDraft(selectedJob?.title || "");
                            setIsEditingJobTitle(true);
                          }}
                          className="workspace-inline-action workspace-title-edit-trigger"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  ) : (
                    <h2 className="workspace-heading text-lg">选择一条访谈以查看内容</h2>
                  )}
                </div>
              </div>

              <div className="workspace-glass-panel-body workspace-glass-panel-body-main">
                {centerSectionContent}
              </div>
            </section>
          </div>

          {/* 右侧屏: 主输出 + WORKSPACE */}
          <aside
            className={`workspace-col-right workspace-glass-panel workspace-right-rail relative flex flex-col pt-6 pb-4 px-4 ${rightRailCollapsed ? "workspace-right-rail-collapsed" : ""}`}
          >
            {!hasSelectedProject ? (
              <>
                <div className="workspace-right-rail-header">
                  <div className="workspace-right-stream-head">
                    <span className="workspace-right-stream-kicker">当前访谈</span>
                    <span className="workspace-right-stream-title workspace-right-stream-title-plain">
                      {selectedJob?.title || "未选择访谈"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="workspace-inline-action"
                    onClick={() => setRightRailCollapsed((prev) => !prev)}
                    aria-label={rightRailCollapsed ? "展开右侧栏" : "折叠右侧栏"}
                    title={rightRailCollapsed ? "展开右侧栏" : "折叠右侧栏"}
                  >
                    {rightRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                  </button>
                </div>
                {rightRailCollapsed ? (
                  <div className="workspace-right-rail-collapsed-body">
                    <span className="workspace-right-rail-collapsed-label">展开</span>
                  </div>
                ) : (
                  <div className="workspace-empty-card flex-1 opacity-40">
                    <p className="text-sm">尚未建立项目库</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="workspace-right-rail-header">
                  <div className="workspace-right-stream-head">
                    <span className="workspace-right-stream-kicker">当前访谈</span>
                    <span className="workspace-right-stream-title workspace-right-stream-title-plain">
                      {selectedJob?.title || "未选择访谈"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="workspace-inline-action"
                    onClick={() => setRightRailCollapsed((prev) => !prev)}
                    aria-label={rightRailCollapsed ? "展开右侧栏" : "折叠右侧栏"}
                    title={rightRailCollapsed ? "展开右侧栏" : "折叠右侧栏"}
                  >
                    {rightRailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                  </button>
                </div>
                {rightRailCollapsed ? (
                  <div className="workspace-right-rail-collapsed-body">
                    <span className="workspace-right-rail-collapsed-label">展开</span>
                  </div>
                ) : (
                  <div className="workspace-right-stream flex-1 overflow-y-auto pr-2 pb-2">
                <section className="workspace-primary-rail-shell">
                  <div className="workspace-primary-rail-list">
                    {PRIMARY_ARTIFACT_DISPLAY_ORDER.map((kind) => renderPrimaryRailCard(kind))}
                  </div>
                </section>

                <section className="workspace-rail-shell">
                  <div className="workspace-right-stream-head">
                    <div className="flex items-center gap-2 opacity-80 text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="workspace-right-stream-title">WORKSPACE</span>
                    </div>
                  </div>
                  <p className="workspace-rail-caption">顺着右栏往下排，作为后续处理工具。</p>

                  <div className="workspace-rail-tools">
                    {WORKSPACE_RAIL_ITEMS.map((item) => {
                      const Icon = item.icon;
                      const isPending = pendingArtifactKindSet.has(item.kind);

                      return (
                        <button
                          key={item.kind}
                          type="button"
                          className={`workspace-rail-tool ${item.accent ? "workspace-rail-tool-accent" : ""}`}
                          onClick={() => void generateArtifact(item.kind)}
                          disabled={!selectedJob || isPending || isSavingClarifications}
                        >
                          <span className="workspace-rail-tool-head">
                            {isPending ? (
                              <Loader2 className={`h-4 w-4 animate-spin ${item.accent ? "text-primary" : "opacity-70"}`} />
                            ) : (
                              <Icon className={`h-4 w-4 ${item.accent ? "text-primary" : "opacity-70"}`} />
                            )}
                          </span>
                          <span className="workspace-rail-tool-copy">
                            <span className={`workspace-rail-tool-title ${item.accent ? "workspace-rail-tool-title-accent" : ""}`}>
                              {item.title}
                            </span>
                            <span className={`workspace-rail-tool-note ${item.accent ? "workspace-rail-tool-note-accent" : ""}`}>
                              {item.note}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                  </div>
                )}
              </>
            )}
          </aside>
        </main>
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
                {(previewArtifact.kind === "publish_script" ? parsedPreviewArtifact?.body : previewArtifact.content) || "暂无内容"}
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

      <Dialog open={newInterviewOpen} onOpenChange={(open) => {
        if (open && !hasSelectedProject) {
          setNewProjectOpen(true);
          return;
        }
        setNewInterviewOpen(open);
      }}>
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>上传或导入素材</DialogTitle>
          </DialogHeader>
          <NewJobForm
            embedded
            plan={plan}
            projectId={selectedProjectId}
            onCreated={handleJobCreated}
            onImportedSource={handleSourceImported}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={newSourceOpen} onOpenChange={setNewSourceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入网页来源</DialogTitle>
            <DialogDescription>
              抓取正文并保存到当前项目 Sources，后续可参与搜索和引用。
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
              <label className="text-sm font-medium text-slate-700" htmlFor="source-title">标题备注</label>
              <Input
                id="source-title"
                value={sourceTitle}
                onChange={(event) => setSourceTitle(event.target.value)}
                placeholder="可选，留空则使用网页标题"
              />
            </div>
            {sourceError ? <p className="text-sm text-rose-600">{sourceError}</p> : null}
            <Button
              onClick={() => importSource(sourceUrl, sourceTitle, "url")}
              disabled={isImportingSource || !sourceUrl.trim()}
              className="workspace-primary-button"
            >
              {isImportingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              导入来源
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建一个新的访谈项目，用于收纳多个访谈任务、来源和输出。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-title">项目名称</label>
              <Input
                id="project-title"
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder="例如：智能硬件品牌访谈"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="project-description">项目描述</label>
              <Input
                id="project-description"
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder="可选，说明当前项目的研究对象或访谈主题"
              />
            </div>
            {projectError ? <p className="text-sm text-rose-600">{projectError}</p> : null}
            <Button onClick={createProject} disabled={isCreatingProject} className="workspace-primary-button">
              {isCreatingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              创建项目
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pendingArtifactKinds.length || isSavingClarifications ? <div className="workspace-loading-bar" /> : null}
    </>
  );
}
