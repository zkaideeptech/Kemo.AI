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
  FolderOpen,
  Loader2,
  LogOut,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { LiveInterviewPanel } from "@/components/live-interview-panel";
import { WorkspaceThemeSwitcher } from "@/components/workspace-theme-switcher";
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
  WORKSPACE_NAV_ITEMS,
  formatCount,
  getArtifactDefinition,
  type WorkspaceSection,
} from "./notebook-workspace.model";

const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
const MEDIA_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".mov", ".mkv", ".avi", ".webm"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".srt", ".vtt"]);
const TEXT_PREVIEW_LIMIT = 16000;

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

async function buildDocumentSourceText(file: File) {
  const summary = [`File: ${file.name}`, `Format: ${file.type || getFileExtension(file.name) || "unknown"}`, `Size: ${formatFileSize(file.size)}`].join("\n");
  if (!isTextLikeFile(file)) {
    return `${summary}\n\nThe file has been archived as a project source. Text extraction is not available for this format yet.`;
  }

  const text = (await file.text().catch(() => "")).replace(/\u0000/g, "").trim();
  return text ? `${summary}\n\n${text.slice(0, TEXT_PREVIEW_LIMIT)}` : `${summary}\n\nThe file was imported, but no readable text was found.`;
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

function getArtifactText(artifact: WorkspaceArtifact | null) {
  return artifact?.content?.trim() || artifact?.summary?.trim() || "";
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
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(initialNewInterviewOpen ? "live" : "workspace");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [captureDialogOpen, setCaptureDialogOpen] = useState(initialNewInterviewOpen);
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
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; kind: string; title: string; snippet: string | null; job_id: string | null; artifact_id: string | null; source_id: string | null }>>([]);
  const [isSearching, setIsSearching] = useState(false);

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
    : transcript?.transcript_text || selectedJob?.live_transcript_snapshot || "";
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

  const completedJobs = jobState.filter((job) => job.status === "completed").length;
  const reviewJobs = jobState.filter((job) => job.status === "needs_review").length;
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
    setJobTitleDraft(getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")));
  }, [selectedJob?.id, selectedJob, transcriptText, t]);

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

  useEffect(() => {
    if (!selectedProjectId || search.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/projects/${selectedProjectId}/search?q=${encodeURIComponent(search.trim())}`, {
          signal: controller.signal,
        });
        const data = await readApi<{ results: typeof searchResults }>(response);
        setSearchResults(data.results || []);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedProjectId]);

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedJobId(null);
    setSelectedSourceId(null);
    setActiveSection("workspace");
  }

  function selectJob(job: JobRow) {
    setSelectedProjectId(job.project_id);
    setSelectedJobId(job.id);
    setSelectedSourceId(null);
    setActiveSection("workspace");
  }

  function selectSource(source: SourceRow) {
    setSelectedProjectId(source.project_id);
    setSelectedSourceId(source.id);
    if (source.job_id) setSelectedJobId(source.job_id);
    setActiveSection("sources");
  }

  function jumpToSearchResult(result: (typeof searchResults)[number]) {
    if (result.source_id) {
      const source = sourceState.find((item) => item.id === result.source_id);
      if (source) selectSource(source);
    } else if (result.job_id) {
      const job = jobState.find((item) => item.id === result.job_id);
      if (job) selectJob(job);
    } else if (result.artifact_id) {
      setPreviewArtifactId(result.artifact_id);
      setActiveSection("artifacts");
    }
    setSearch("");
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

  async function deleteProject(project: ProjectRow) {
    if (!window.confirm(t("workspace.confirm.deleteProject", { title: project.title }))) return;
    try {
      await readApi<{ removed: boolean }>(await fetch(`/api/projects/${project.id}`, { method: "DELETE" }));
      setProjectState((previous) => previous.filter((item) => item.id !== project.id));
      setJobState((previous) => previous.filter((item) => item.project_id !== project.id));
      setSourceState((previous) => previous.filter((item) => item.project_id !== project.id));
      setArtifactState((previous) => previous.filter((item) => item.project_id !== project.id));
      setFavoriteState((previous) => previous.filter((item) => item.project_id !== project.id));
      if (selectedProjectId === project.id) {
        const nextProject = projectState.find((item) => item.id !== project.id) || null;
        setSelectedProjectId(nextProject?.id || null);
        setSelectedJobId(null);
      }
      setFeedback(t("workspace.feedback.projectDeleted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("workspace.errors.deleteProjectFailed"));
    }
  }

  async function saveJobTitle() {
    if (!selectedJob) return;
    const nextTitle = jobTitleDraft.trim();
    if (!nextTitle) {
      setError(t("workspace.errors.titleRequired"));
      return;
    }

    try {
      const data = await readApi<{ job: JobRow }>(
        await fetch(`/api/jobs/${selectedJob.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        })
      );
      setJobState((previous) => previous.map((job) => (job.id === data.job.id ? data.job : job)));
      setEditingJobTitle(false);
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
            label: artifact.title,
            excerpt: artifact.summary,
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
      if (uploadError) throw new Error(uploadError.message);

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
        setActiveSection("workspace");
        await fetch(`/api/jobs/${data.jobId}/run`, { method: "POST" }).catch(() => null);
        setFeedback(t("workspace.feedback.interviewUploaded"));
      } else {
        const documentText = await buildDocumentSourceText(file);
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

  async function copyArtifact(artifact: WorkspaceArtifact) {
    const text = getArtifactText(artifact);
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => null);
    setFeedback(t("workspace.feedback.artifactCopied"));
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut().catch(() => null);
    window.location.href = `/${locale}/login`;
  }

  function renderProjectTree() {
    if (!projectState.length) {
      return (
        <div className="kw-empty-mini">
          <span>{t("workspace.empty.noProjects")}</span>
          <button type="button" onClick={() => setProjectDialogOpen(true)}>{t("workspace.actions.createOne")}</button>
        </div>
      );
    }

    return projectState.map((project) => {
      const active = project.id === selectedProjectId;
      const projectJobs = jobsByProject.get(project.id) || [];
      return (
        <div className="kw-project-node" key={project.id}>
          <div className={`kw-project-row ${active && !selectedJob ? "active" : ""}`}>
            <button type="button" onClick={() => selectProject(project.id)} className="kw-project-title">
              <FolderOpen className="kw-project-icon" />
              <span>{project.title}</span>
              <small>{projectJobs.length}</small>
            </button>
            <button type="button" className="kw-icon-button ghost danger" title={t("workspace.actions.deleteProject")} onClick={() => void deleteProject(project)}>
              <Trash2 />
            </button>
          </div>
          <div className="kw-job-list">
            {projectJobs.slice(0, 8).map((job) => {
              const jobTranscript = transcripts.find((item) => item.job_id === job.id)?.transcript_text || job.live_transcript_snapshot || "";
              return (
                <button key={job.id} type="button" className={`kw-job-row ${selectedJobId === job.id ? "active" : ""}`} onClick={() => selectJob(job)}>
                  <span className={`kw-status-dot ${getStatusTone(job.status)}`} />
                  <span>{getJobTitle(job, jobTranscript, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title"))}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    });
  }

  function renderOverview() {
    if (selectedJob) {
      return renderJobDetail();
    }

    return (
      <div className="kw-page-stack">
        <div className="kw-page-heading">
          <div>
            <p className="kw-kicker">{t("workspace.overview.kicker")}</p>
            <h1>{selectedProject?.title || t("workspace.overview.title")}</h1>
            <p>{selectedProject?.description || t("workspace.overview.description")}</p>
          </div>
          <button type="button" className="kw-button primary" onClick={() => setCaptureDialogOpen(true)}>
            <Plus /> {t("workspace.actions.addMaterial")}
          </button>
        </div>

        <div className="kw-metric-grid">
          <Metric label={t("workspace.metrics.projects")} value={formatCount(projectState.length)} note={t("workspace.metrics.interviews", { count: formatCount(jobState.length) })} />
          <Metric label={t("workspace.metrics.completed")} value={formatCount(completedJobs)} note={t("workspace.metrics.needReview", { count: reviewJobs })} tone={reviewJobs ? "review" : "ready"} />
          <Metric label={t("workspace.metrics.artifacts")} value={formatCount(artifactState.length)} note={t("workspace.metrics.sources", { count: formatCount(sourceState.length) })} tone="ai" />
        </div>

        <section className="kw-section">
          <div className="kw-section-head">
            <h2>{t("workspace.recent.title")}</h2>
            <button type="button" className="kw-link-button" onClick={() => setCaptureDialogOpen(true)}>{t("workspace.actions.add")}</button>
          </div>
          {selectedProjectJobs.length ? (
            <div className="kw-record-grid">
              {selectedProjectJobs.slice(0, 4).map((job) => {
                const jobTranscript = transcripts.find((item) => item.job_id === job.id)?.transcript_text || job.live_transcript_snapshot || "";
                return <JobCard key={job.id} job={job} title={getJobTitle(job, jobTranscript, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title"))} favorite={favoriteJobIds.has(job.id)} onOpen={() => selectJob(job)} onFavorite={() => void toggleJobFavorite(job)} statusLabel={statusLabel} dateLabel={formatDate(job.created_at, locale)} favoriteLabel={t("workspace.actions.favorite")} fallbackType={t("workspace.fallbacks.interview")} />;
              })}
            </div>
          ) : (
            <EmptyState title={t("workspace.empty.noInterviewsTitle")} copy={t("workspace.empty.noInterviewsCopy")} action={t("workspace.actions.addMaterial")} onAction={() => setCaptureDialogOpen(true)} />
          )}
        </section>
      </div>
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
              <p>{selectedJob.guest_name || selectedJob.source_type || t("workspace.fallbacks.interviewRecord")} · {formatDate(selectedJob.created_at, locale)}</p>
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
            <p className="kw-kicker">Term Review</p>
            <h2>Confirm extracted terminology</h2>
          </div>
          <button type="button" className="kw-button primary" disabled={isSavingTerms} onClick={() => void submitTermReview()}>
            {isSavingTerms ? <Loader2 className="spin" /> : <CheckCircle2 />} Confirm terms
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
                  <option value="accept">Accept</option>
                  <option value="edit">Edit</option>
                  <option value="reject">Reject</option>
                </select>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderLive() {
    return (
      <div className="kw-live-mode">
        <section className="kw-live-main">
          <div className="kw-live-header">
            <div>
              <p className="kw-kicker">{t("workspace.live.kicker")}</p>
              <h1>{selectedJob?.capture_mode === "live" ? getJobTitle(selectedJob, transcriptText, t("workspace.fallbacks.untitledInterview"), t("workspace.overview.title")) : t("workspace.live.title")}</h1>
              <p>{liveCaptureStatus}</p>
            </div>
            <span className="kw-live-dot">{t("workspace.live.badge")}</span>
          </div>
          <div className="kw-live-panel-shell">
            <LiveInterviewPanel
              key={selectedJob?.id || selectedProjectId || "live"}
              compact
              disabled={!selectedProjectId}
              disabledReason={t("workspace.errors.createProjectFirst")}
              isCompleted={selectedJob?.capture_mode === "live" && selectedJob.status === "completed"}
              onEnsureJob={ensureLiveJob}
              onTranscriptChange={setLiveTranscriptSnapshot}
              onStatusChange={setLiveCaptureStatus}
              onFinalized={handleLiveFinalized}
              onFinalizeStarted={() => setFeedback(t("workspace.feedback.finalizingLive"))}
              onFinalizeSettled={(payload) => {
                if (!payload.success) setError(payload.statusText);
              }}
            />
          </div>
          <div className="kw-card">
            <div className="kw-card-head">
              <div>
                <p className="kw-kicker">{t("workspace.live.transcriptKicker")}</p>
                <h2>{liveTranscriptSnapshot ? t("workspace.live.currentCapture") : t("workspace.live.noTranscript")}</h2>
              </div>
            </div>
            {liveTranscriptSnapshot ? <pre className="kw-transcript">{liveTranscriptSnapshot}</pre> : <p className="kw-muted">{t("workspace.live.startHint")}</p>}
          </div>
        </section>
        <aside className="kw-live-coach">
          <h2>{t("workspace.live.questionCoach")}</h2>
          {selectedArtifacts.filter((artifact) => artifact.kind === "inspiration_questions" || artifact.kind === "live_question_coach").slice(0, 3).map((artifact) => (
            <button key={artifact.id} type="button" className="kw-coach-card" onClick={() => setPreviewArtifactId(artifact.id)}>
              <span>{artifact.title}</span>
              <p>{artifact.summary || getArtifactText(artifact).slice(0, 180)}</p>
            </button>
          ))}
          {!selectedArtifacts.some((artifact) => artifact.kind === "inspiration_questions" || artifact.kind === "live_question_coach") ? (
            <div className="kw-empty-mini"><span>{t("workspace.live.questionCoachEmpty")}</span></div>
          ) : null}
        </aside>
      </div>
    );
  }

  function renderSources() {
    return (
      <div className="kw-page-stack">
        <div className="kw-page-heading">
          <div>
            <p className="kw-kicker">{t("workspace.sources.kicker")}</p>
            <h1>{t("workspace.sources.title")}</h1>
            <p>{t("workspace.sources.connected", { count: projectSources.length, project: selectedProject?.title || t("workspace.context.thisProject") })}</p>
          </div>
          <button type="button" className="kw-button primary" onClick={() => setCaptureDialogOpen(true)}><Upload /> {t("workspace.actions.import")}</button>
        </div>
        <div className="kw-split">
          <div className="kw-list-panel">
            {projectSources.length ? projectSources.map((source) => (
              <button key={source.id} type="button" className={`kw-source-row ${selectedSourceId === source.id ? "active" : ""}`} onClick={() => selectSource(source)}>
                <BookOpen />
                <span>{source.title || source.url || t("workspace.sources.importedSource")}</span>
                <small>{source.domain || source.source_type}</small>
              </button>
            )) : <EmptyState title={t("workspace.sources.emptyTitle")} copy={t("workspace.sources.emptyCopy")} action={t("workspace.actions.importSource")} onAction={() => setCaptureDialogOpen(true)} />}
          </div>
          <div className="kw-card">
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
            {visibleArtifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} favorite={favoriteArtifactIds.has(artifact.id)} pending={pendingArtifacts.includes(artifact.kind)} onOpen={() => setPreviewArtifactId(artifact.id)} onFavorite={() => void toggleArtifactFavorite(artifact)} label={artifactShortLabel(artifact.kind)} description={artifactDescription(artifact.kind)} dateLabel={formatDate(artifact.updated_at || artifact.created_at, locale)} favoriteLabel={t("workspace.actions.favorite")} />)}
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
    if (activeSection === "live") return renderLive();
    if (activeSection === "sources") return renderSources();
    if (activeSection === "artifacts") return renderArtifacts();
    if (activeSection === "favorites") return renderFavorites();
    return renderOverview();
  }

  return (
    <div className="kemo-workspace">
      <aside className="kw-sidebar">
        <div className="kw-brand">
          <div className="kw-brand-mark">K</div>
          <div>
            <strong>Kemo.AI</strong>
            <span>{t("workspace.brand.subtitle")}</span>
          </div>
        </div>
        <button type="button" className="kw-button primary full" onClick={() => setCaptureDialogOpen(true)}>
          <Plus /> {t("workspace.actions.newResearchMaterial")}
        </button>
        <nav className="kw-nav" aria-label={t("workspace.nav.aria")}>
          {WORKSPACE_NAV_ITEMS.map((item) => {
            if (item.id === "settings") {
              return (
                <Link key={item.id} href={`/${locale}/app/settings`} className="kw-nav-item">
                  <Settings className="kw-nav-lucide" /> {t(`workspace.nav.${item.id}`)}
                </Link>
              );
            }
            return (
              <button key={item.id} type="button" className={`kw-nav-item ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}>
                <span className="kw-material">{item.icon}</span> {t(`workspace.nav.${item.id}`)}
              </button>
            );
          })}
        </nav>
        <div className="kw-sidebar-search">
          <Search />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={selectedProjectId ? t("workspace.search.placeholder") : t("workspace.search.selectProject")} disabled={!selectedProjectId} />
        </div>
        {searchResults.length || isSearching ? (
          <div className="kw-search-popover">
            {isSearching ? <span>{t("workspace.search.searching")}</span> : null}
            {searchResults.map((result) => (
              <button key={`${result.kind}-${result.id}`} type="button" onClick={() => jumpToSearchResult(result)}>
                <strong>{result.title}</strong>
                <small>{result.kind}</small>
              </button>
            ))}
          </div>
        ) : null}
        <div className="kw-project-tree">{renderProjectTree()}</div>
      </aside>

      <div className="kw-main">
        <header className="kw-topbar">
          <div>
            <p className="kw-kicker">{selectedProject?.title || t("workspace.empty.noProjectSelected")}</p>
            <h2>{currentTitle}</h2>
          </div>
          <div className="kw-topbar-actions">
            <button type="button" className="kw-button secondary" onClick={() => setProjectDialogOpen(true)}><Plus /> {t("workspace.actions.project")}</button>
            <button type="button" className="kw-icon-button" title={t("workspace.actions.refresh")} onClick={() => router.refresh()}><RefreshCw /></button>
            <LanguageSwitcher />
            <WorkspaceThemeSwitcher />
            <button type="button" className="kw-icon-button" title={t("workspace.actions.signOut")} onClick={() => void signOut()}><LogOut /></button>
          </div>
        </header>

        <main className="kw-canvas">
          <section className="kw-content">{renderActiveSection()}</section>
          <aside className="kw-context-rail">
            <div className="kw-rail-card">
              <p className="kw-kicker">{t("workspace.context.kicker")}</p>
              <h3>{selectedJob ? t("workspace.context.interview") : t("workspace.context.project")}</h3>
              <dl>
                <div><dt>{t("workspace.context.status")}</dt><dd>{selectedJob ? statusLabel(selectedJob.status) : t("workspace.metrics.interviews", { count: selectedProjectJobs.length })}</dd></div>
                <div><dt>{t("workspace.context.sources")}</dt><dd>{projectSources.length}</dd></div>
                <div><dt>{t("workspace.context.artifacts")}</dt><dd>{projectArtifacts.length}</dd></div>
              </dl>
            </div>
            <div className="kw-rail-card">
              <p className="kw-kicker">{t("workspace.plan.kicker")}</p>
              <h3>{plan.plan}</h3>
              <p>{t("workspace.plan.limitNote", { limit: plan.maxFileSizeMb })}</p>
            </div>
            {pendingTerms.length ? (
              <div className="kw-rail-card accent">
                <p className="kw-kicker">{t("workspace.review.blocker")}</p>
                <h3>{t("workspace.review.pendingTerms", { count: pendingTerms.length })}</h3>
                <button type="button" className="kw-button primary full" onClick={() => setActiveSection("workspace")}>{t("workspace.review.reviewNow")}</button>
              </div>
            ) : null}
          </aside>
        </main>
      </div>

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
        <Modal title={t("workspace.captureDialog.title")} closeLabel={t("common.close")} onClose={() => setCaptureDialogOpen(false)}>
          <div className="kw-capture-grid">
            <button type="button" onClick={() => { setActiveSection("live"); setCaptureDialogOpen(false); }}><Mic /><strong>{t("workspace.captureDialog.liveTitle")}</strong><span>{t("workspace.captureDialog.liveCopy")}</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()}><Upload /><strong>{t("workspace.captureDialog.uploadTitle")}</strong><span>{t("workspace.captureDialog.uploadCopy")}</span></button>
            <button type="button" onClick={() => setActiveSection("sources")}><BookOpen /><strong>{t("workspace.captureDialog.urlTitle")}</strong><span>{t("workspace.captureDialog.urlCopy")}</span></button>
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
        <Modal title={previewArtifact.title} closeLabel={t("common.close")} wide onClose={() => setPreviewArtifactId(null)}>
          <div className="kw-preview-layout">
            <article className="kw-preview-document">
              <p className="kw-kicker">{artifactLabel(previewArtifact.kind)}</p>
              <h2>{previewArtifact.title}</h2>
              {previewArtifact.audio_url ? <audio controls src={previewArtifact.audio_url} className="kw-audio" /> : null}
              <pre>{getArtifactText(previewArtifact) || t("workspace.artifacts.noContent")}</pre>
            </article>
            <aside className="kw-preview-meta">
              <StatusPill status={previewArtifact.status} label={statusLabel(previewArtifact.status)} />
              <p>{previewArtifact.summary || artifactDescription(previewArtifact.kind)}</p>
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

function Metric({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "ready" | "review" | "ai" }) {
  return (
    <div className={`kw-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
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

function JobCard({
  job,
  title,
  favorite,
  onOpen,
  onFavorite,
  statusLabel,
  dateLabel,
  favoriteLabel,
  fallbackType,
}: {
  job: JobRow;
  title: string;
  favorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  statusLabel?: (status: string | null | undefined) => string;
  dateLabel?: string;
  favoriteLabel: string;
  fallbackType: string;
}) {
  return (
    <div className="kw-record-card">
      <button type="button" className="kw-record-open" onClick={onOpen}>
        <div>
          <StatusPill status={job.status} label={statusLabel?.(job.status) || ""} />
          <MoreHorizontal />
        </div>
        <h3>{title}</h3>
        <p>{job.guest_name || job.source_type || job.capture_mode || fallbackType}</p>
        <small>{dateLabel}</small>
      </button>
      <button type="button" className={`kw-icon-button ${favorite ? "active" : ""}`} onClick={onFavorite} title={favoriteLabel}><Star /></button>
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
  description,
  dateLabel,
  favoriteLabel,
}: {
  artifact: WorkspaceArtifact;
  favorite: boolean;
  pending: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  label: string;
  description: string;
  dateLabel: string;
  favoriteLabel: string;
}) {
  const definition = getArtifactDefinition(artifact.kind);
  return (
    <div className={`kw-artifact-card ${definition.accent}`}>
      <button type="button" onClick={onOpen}>
        <div>
          <span>{label}</span>
          {pending ? <Loader2 className="spin" /> : <FileText />}
        </div>
        <h3>{artifact.title}</h3>
        <p>{artifact.summary || getArtifactText(artifact).slice(0, 180) || description}</p>
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
