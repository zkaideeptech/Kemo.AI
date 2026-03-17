"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AudioLines,
  BookMarked,
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderPlus,
  Globe,
  LayoutPanelLeft,
  Link2,
  Loader2,
  Monitor,
  MoonStar,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  SunMedium,
} from "lucide-react";

import { LiveInterviewPanel } from "@/components/live-interview-panel";
import { NewJobForm } from "@/components/new-job-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ARTIFACT_KINDS,
  getArtifactDescription,
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
import type { SearchResult as WebSearchResult } from "@/lib/providers/searchProvider";

export function NotebookWorkspace({
  locale,
  userEmail,
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
  userEmail: string | null;
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
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newInterviewOpen, setNewInterviewOpen] = useState(initialNewInterviewOpen);
  const [newSourceOpen, setNewSourceOpen] = useState(false);
  const [uiMode, setUiMode] = useState<"system" | "light" | "dark">("system");
  const [projectState, setProjectState] = useState(projects);
  const [jobState, setJobState] = useState(jobs);
  const [artifactState, setArtifactState] = useState(artifacts);
  const [favoriteState, setFavoriteState] = useState(favorites);
  const [sourceState, setSourceState] = useState(sources);
  const [selectedProjectId, setSelectedProjectId] = useState(initialJobProjectId || projects[0]?.id || null);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId || jobs[0]?.id || null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(sources[0]?.id || null);
  const [projectResults, setProjectResults] = useState<ProjectSearchResult[]>([]);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [isProjectSearching, setIsProjectSearching] = useState(false);
  const [isWebSearching, setIsWebSearching] = useState(false);
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
  const lastLiveSyncRef = useRef("");

  const filteredJobs = useMemo(() => {
    return jobState.filter((job) => {
      const matchesProject = !selectedProjectId || job.project_id === selectedProjectId;
      const haystack = `${job.title || ""} ${job.guest_name || ""} ${job.interviewer_name || ""}`.toLowerCase();
      return matchesProject && haystack.includes(search.toLowerCase());
    });
  }, [jobState, search, selectedProjectId]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) || filteredJobs[0] || null;
  const transcript = transcripts.find((item) => item.job_id === selectedJob?.id) || null;
  const selectedArtifacts = artifactState.filter((artifact) => artifact.job_id === selectedJob?.id);
  const projectSources = sourceState.filter((source) => source.project_id === selectedProjectId);
  const selectedSource =
    projectSources.find((source) => source.id === selectedSourceId) || projectSources[0] || null;
  const favoriteArtifactIds = new Set(
    favoriteState.map((favorite) => favorite.artifact_id).filter(Boolean) as string[]
  );
  const transcriptContent =
    transcript?.transcript_text ||
    selectedJob?.live_transcript_snapshot ||
    liveTranscriptSnapshot ||
    "";
  const hasSelectedProject = Boolean(selectedProjectId);
  const hasSelectedJob = Boolean(selectedJob?.id);
  const projectLockedReason = "请先创建一个项目，项目建好后才可继续录音、实时访谈和导入来源。";
  const liveAutoCreateHint = "点开始后会自动在当前项目下创建一条实时访谈并持续保存。";

  useEffect(() => {
    const storedMode = window.localStorage.getItem("kemo-ui-mode");
    if (storedMode === "dark" || storedMode === "light" || storedMode === "system") {
      setUiMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (uiMode === "system") {
      delete document.documentElement.dataset.workspaceTheme;
    } else {
      document.documentElement.dataset.workspaceTheme = uiMode;
    }
    window.localStorage.setItem("kemo-ui-mode", uiMode);
  }, [uiMode]);

  useEffect(() => {
    if (!projectState.length) {
      setSelectedProjectId(null);
      return;
    }

    if (!projectState.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectState[0].id);
    }
  }, [projectState, selectedProjectId]);

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
    const projectJobs = jobState.filter((job) => job.project_id === selectedProjectId);
    if (!projectJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!projectJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(projectJobs[0].id);
    }
  }, [jobState, selectedJobId, selectedProjectId]);

  useEffect(() => {
    const nextSources = sourceState.filter((source) => source.project_id === selectedProjectId);
    if (!nextSources.length) {
      setSelectedSourceId(null);
      return;
    }

    if (!nextSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(nextSources[0].id);
    }
  }, [selectedProjectId, selectedSourceId, sourceState]);

  useEffect(() => {
    lastLiveSyncRef.current = "";
  }, [selectedJobId]);

  useEffect(() => {
    if (!hasSelectedProject && initialNewInterviewOpen) {
      setNewInterviewOpen(false);
      setNewProjectOpen(true);
    }
  }, [hasSelectedProject, initialNewInterviewOpen]);

  useEffect(() => {
    if (!selectedJob?.id) return;

    const nextSnapshot = liveTranscriptSnapshot.trim();
    if (!nextSnapshot || nextSnapshot === lastLiveSyncRef.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${selectedJob.id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptText: nextSnapshot,
            statusText: liveCaptureStatus,
          }),
        });
        const json = await res.json();

        if (!res.ok || !json.ok) return;

        lastLiveSyncRef.current = nextSnapshot;

        if (json.data.job) {
          setJobState((prev) => [json.data.job, ...prev.filter((item) => item.id !== json.data.job.id)]);
        }

        if (Array.isArray(json.data.draftArtifacts) && json.data.draftArtifacts.length > 0) {
          setArtifactState((prev) => {
            const next = [...prev];
            for (const draftArtifact of json.data.draftArtifacts) {
              const existingIndex = next.findIndex((item) => item.id === draftArtifact.id);
              if (existingIndex >= 0) {
                next[existingIndex] = draftArtifact;
              } else {
                next.unshift(draftArtifact);
              }
            }
            return next;
          });
        }
      } catch {
        // Keep local drafting usable even if sync fails.
      }
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [liveCaptureStatus, liveTranscriptSnapshot, selectedJob?.id]);

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
    setNewProjectTitle("");
    setNewProjectDescription("");
    setNewProjectOpen(false);
    setIsCreatingProject(false);
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
      setSourceUrl("");
      setSourceTitle("");
      setNewSourceOpen(false);
    } catch {
      setSourceError("导入来源失败");
    } finally {
      setIsImportingSource(false);
    }
  }

  async function generateArtifact(kind: ArtifactKind) {
    if (!selectedJob) return;

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/jobs/${selectedJob.id}/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        });

      const json = await res.json();
      if (!res.ok || !json.ok) return;

        setArtifactState((prev) => [json.data.artifact, ...prev]);
      })();
    });
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

  async function runWebSearch() {
    if (!selectedProjectId) {
      setWebResults([]);
      return;
    }

    if (search.trim().length < 2) {
      setWebResults([]);
      return;
    }

    setIsWebSearching(true);

    try {
      const res = await fetch(`/api/search/web?q=${encodeURIComponent(search.trim())}`);
      const json = await res.json();

      if (res.ok && json.ok) {
        setWebResults(json.data.results || []);
      } else {
        setWebResults([]);
      }
    } catch {
      setWebResults([]);
    } finally {
      setIsWebSearching(false);
    }
  }

  function jumpToSearchResult(result: ProjectSearchResult) {
    if (result.source_id) {
      setSelectedSourceId(result.source_id);
    }
    if (result.job_id) {
      setSelectedJobId(result.job_id);
    }
  }

  function handleJobCreated(job: JobRow) {
    setJobState((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
    setSelectedProjectId(job.project_id);
    setSelectedJobId(job.id);
    setLiveTranscriptSnapshot("");
    setLiveCaptureStatus("准备开始实时访谈");
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

    setLiveTranscriptSnapshot(payload.transcriptText);
    setLiveCaptureStatus(payload.statusText);
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

  const favoriteArtifacts = artifactState.filter((artifact) => favoriteArtifactIds.has(artifact.id));

  function getArtifactDownloadPath(artifact: WorkspaceArtifact) {
    const metadata = artifact.metadata as Record<string, unknown> | null;
    const metadataPath = typeof metadata?.download_path === "string" ? metadata.download_path : null;
    if (metadataPath) return metadataPath;
    if (artifact.kind === "roadshow_transcript" || artifact.kind === "meeting_minutes") {
      return `/api/artifacts/${artifact.id}/download`;
    }
    return null;
  }

  return (
    <>
      <div className="workspace-shell">
        <aside className={`workspace-sidebar ${collapsed ? "workspace-sidebar-collapsed" : ""}`}>
          <div className="workspace-sidebar-top">
            <div className="flex items-center gap-3">
              <div className="workspace-logo">K</div>
              {!collapsed ? <div><p className="workspace-kicker">Kemo</p><p className="workspace-heading">Notebook</p></div> : null}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="workspace-icon-button"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid gap-2">
            <button type="button" className="workspace-nav-button" onClick={() => setNewProjectOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              {!collapsed ? "新建项目" : null}
            </button>
            <button
              type="button"
              className="workspace-nav-button"
              onClick={() => hasSelectedProject ? setNewInterviewOpen(true) : setNewProjectOpen(true)}
              disabled={!hasSelectedProject}
              title={!hasSelectedProject ? projectLockedReason : undefined}
            >
              <Plus className="h-4 w-4" />
              {!collapsed ? "新建访谈" : null}
            </button>
            <button
              type="button"
              className="workspace-nav-button"
              onClick={() => hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true)}
              disabled={!hasSelectedProject}
              title={!hasSelectedProject ? projectLockedReason : undefined}
            >
              <Link2 className="h-4 w-4" />
              {!collapsed ? "导入网址" : null}
            </button>
          </div>

          {!collapsed ? (
            <div className="workspace-sidebar-body">
              <section className="workspace-sidebar-section">
                <div className="workspace-section-title">
                  <span>界面模式</span>
                </div>
                <div className="workspace-search-toolbar">
                  <button
                    type="button"
                    className={`workspace-chip-button ${uiMode === "light" ? "workspace-chip-button-active" : ""}`}
                    onClick={() => setUiMode("light")}
                  >
                    <SunMedium className="h-3.5 w-3.5" />
                    浅色
                  </button>
                  <button
                    type="button"
                    className={`workspace-chip-button ${uiMode === "system" ? "workspace-chip-button-active" : ""}`}
                    onClick={() => setUiMode("system")}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    跟随系统
                  </button>
                  <button
                    type="button"
                    className={`workspace-chip-button ${uiMode === "dark" ? "workspace-chip-button-active" : ""}`}
                    onClick={() => setUiMode("dark")}
                  >
                    <MoonStar className="h-3.5 w-3.5" />
                    深色
                  </button>
                </div>
              </section>

              <div className="grid gap-2">
                <label className="workspace-search">
                  <Search className="h-4 w-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索项目、访谈、来源、输出"
                    disabled={!hasSelectedProject}
                  />
                </label>
                <div className="workspace-search-toolbar">
                  <button
                    type="button"
                    className="workspace-chip-button"
                    onClick={runWebSearch}
                    disabled={!hasSelectedProject}
                    title={!hasSelectedProject ? projectLockedReason : undefined}
                  >
                    {isWebSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                    <span>Web</span>
                  </button>
                  <button
                    type="button"
                    className="workspace-chip-button"
                    onClick={() => hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true)}
                    disabled={!hasSelectedProject}
                    title={!hasSelectedProject ? projectLockedReason : undefined}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>导入 URL</span>
                  </button>
                </div>
              </div>

              {search.trim().length >= 2 ? (
                <section className="workspace-sidebar-section">
                  <div className="workspace-section-title">
                    <span>Search</span>
                    {isProjectSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  </div>

                  <div className="grid gap-2">
                    {projectResults.length ? projectResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => jumpToSearchResult(result)}
                        className="workspace-list-item"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{result.title}</p>
                          <p className="truncate text-xs text-slate-500">{result.kind} · {result.snippet || "项目内命中"}</p>
                        </div>
                      </button>
                    )) : (
                      <p className="workspace-muted-copy">项目内暂无匹配项。</p>
                    )}
                  </div>

                  {webResults.length ? (
                    <div className="grid gap-2">
                      <p className="workspace-section-title"><span>Web Results</span></p>
                      {webResults.map((result) => (
                        <div key={result.url} className="workspace-list-item">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{result.title}</p>
                            <p className="line-clamp-2 text-xs text-slate-500">{result.snippet || result.url}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              className="workspace-chip-button"
                              onClick={() => importSource(result.url, result.title, "web_search")}
                            >
                              导入
                            </button>
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noreferrer"
                              className="workspace-inline-action"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="workspace-sidebar-section">
                <div className="workspace-section-title">
                  <span>Projects</span>
                  <button type="button" className="workspace-inline-action" onClick={() => setNewProjectOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid gap-2">
                  {projectState.length ? projectState.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`workspace-list-item ${selectedProjectId === project.id ? "workspace-list-item-active" : ""}`}
                    >
                      <span className="truncate">{project.title}</span>
                    </button>
                  )) : (
                    <div className="workspace-empty-card workspace-empty-card-strong">
                      <div className="grid gap-2">
                        <p className="font-semibold text-slate-900">项目目录还是空的</p>
                        <p className="workspace-muted-copy">先创建一个项目。项目创建后会出现在这里，访谈、来源和输出都会按项目归档。</p>
                        <button type="button" className="workspace-chip-button" onClick={() => setNewProjectOpen(true)}>
                          <FolderPlus className="h-3.5 w-3.5" />
                          创建第一个项目
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="workspace-sidebar-section">
                <div className="workspace-section-title">
                  <span>Sources</span>
                  <Link2 className="h-3.5 w-3.5" />
                </div>
                <div className="grid gap-2">
                  {!hasSelectedProject ? (
                    <div className="workspace-empty-card">
                      <p className="workspace-muted-copy">{projectLockedReason}</p>
                    </div>
                  ) : projectSources.length ? projectSources.map((source) => (
                    <div
                      key={source.id}
                      className={`workspace-list-item ${selectedSource?.id === source.id ? "workspace-list-item-active" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSourceId(source.id)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{source.title || source.url || "Imported source"}</p>
                          <p className="truncate text-xs text-slate-500">{source.domain || source.source_type} · {source.status}</p>
                        </div>
                      </button>
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="workspace-inline-action"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  )) : (
                    <div className="workspace-empty-card">
                      <p className="workspace-muted-copy">当前项目还没有来源。</p>
                      <button type="button" className="workspace-chip-button" onClick={() => setNewSourceOpen(true)}>
                        <Link2 className="h-3.5 w-3.5" />
                        导入网址
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="workspace-sidebar-section">
                <div className="workspace-section-title">
                  <span>Favorites</span>
                  <BookMarked className="h-3.5 w-3.5" />
                </div>
                <div className="grid gap-2">
                  {favoriteArtifacts.length ? favoriteArtifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => setSelectedJobId(artifact.job_id)}
                      className="workspace-list-item"
                    >
                      <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                      <span className="truncate">{artifact.title}</span>
                    </button>
                  )) : <p className="workspace-muted-copy">生成内容后可加入收藏，方便快速回看。</p>}
                </div>
              </section>

              <section className="workspace-sidebar-section">
                <div className="workspace-section-title">
                  <span>当前项目访谈</span>
                  <LayoutPanelLeft className="h-3.5 w-3.5" />
                </div>
                <div className="grid gap-2">
                  {!hasSelectedProject ? (
                    <div className="workspace-empty-card">
                      <p className="workspace-muted-copy">{projectLockedReason}</p>
                    </div>
                  ) : filteredJobs.length ? filteredJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`workspace-list-item ${selectedJob?.id === job.id ? "workspace-list-item-active" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{job.title || "Untitled interview"}</p>
                        <p className="truncate text-xs text-slate-500">{job.guest_name || "Guest TBD"}</p>
                      </div>
                    </button>
                  )) : (
                    <div className="workspace-empty-card">
                      <p className="workspace-muted-copy">当前项目还没有访谈任务。</p>
                      <button type="button" className="workspace-chip-button" onClick={() => setNewInterviewOpen(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        新建访谈
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          <div className="workspace-sidebar-footer">
            <Link href={`/${locale}/app/settings`} className="workspace-nav-button">
              <Settings className="h-4 w-4" />
              {!collapsed ? "设置" : null}
            </Link>
            {!collapsed ? (
              <div className="workspace-account-card">
                <p className="font-semibold">{userEmail || "anonymous@kemo"}</p>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{plan.plan}</p>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="workspace-main">
          <section className="workspace-center">
            <section className="workspace-toolbar">
              <div>
                <p className="workspace-kicker">Workspace</p>
                <h2 className="workspace-heading">Project cockpit</h2>
              </div>
              <div className="workspace-search-toolbar">
                <button
                  type="button"
                  className="workspace-chip-button"
                  onClick={() => hasSelectedProject ? setNewInterviewOpen(true) : setNewProjectOpen(true)}
                  disabled={!hasSelectedProject}
                  title={!hasSelectedProject ? projectLockedReason : undefined}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建访谈
                </button>
                <button
                  type="button"
                  className="workspace-chip-button"
                  onClick={() => hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true)}
                  disabled={!hasSelectedProject}
                  title={!hasSelectedProject ? projectLockedReason : undefined}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  导入来源
                </button>
              </div>
            </section>

            {!hasSelectedProject ? (
              <section className="workspace-panel workspace-blocking-state">
                <div className="workspace-blocking-copy">
                  <p className="workspace-kicker">Step 1</p>
                  <h2 className="workspace-heading">先创建项目，再开始访谈</h2>
                  <p className="workspace-muted-copy">
                    项目是整条工作流的归档根节点。没有项目时，录音、实时访谈、导入网址和 Studio 生成都不应该开放。
                  </p>
                  <div className="workspace-search-toolbar">
                    <button type="button" className="workspace-primary-button workspace-chip-button" onClick={() => setNewProjectOpen(true)}>
                      <FolderPlus className="h-3.5 w-3.5" />
                      创建第一个项目
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <LiveInterviewPanel
                key={selectedProjectId || "workspace-live"}
                onTranscriptChange={setLiveTranscriptSnapshot}
                onStatusChange={setLiveCaptureStatus}
                onEnsureJob={ensureLiveJob}
                onFinalized={handleLiveFinalized}
                disabled={!hasSelectedProject}
                disabledReason={projectLockedReason}
              />
            )}

            <section className="workspace-panel">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="workspace-kicker">Current Interview</p>
                  <h1 className="workspace-heading text-[1.6rem]">
                    {!hasSelectedProject ? "先创建项目" : selectedJob?.title || "选择一个访谈开始工作"}
                  </h1>
                  <p className="workspace-muted-copy">
                    {!hasSelectedProject
                      ? projectLockedReason
                      : selectedJob
                      ? `${selectedJob.interviewer_name || "Interviewer"} × ${selectedJob.guest_name || "Guest"}`
                      : liveTranscriptSnapshot
                        ? liveCaptureStatus
                        : liveAutoCreateHint}
                  </p>
                </div>
                {selectedJob ? (
                  <div className="workspace-status-pill">
                    {selectedJob.status || "draft"}
                  </div>
                ) : (
                  <div className="workspace-search-toolbar">
                    <button
                      type="button"
                      className="workspace-chip-button"
                      onClick={() => hasSelectedProject ? setNewInterviewOpen(true) : setNewProjectOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {hasSelectedProject ? "新建访谈" : "先创建项目"}
                    </button>
                    <button
                      type="button"
                      className="workspace-chip-button"
                      onClick={() => hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true)}
                      disabled={!hasSelectedProject}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      导入来源
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <article className="workspace-card workspace-transcript-card">
                  <div className="workspace-card-header">
                    <div>
                      <p className="workspace-kicker">Transcript</p>
                      <h2 className="workspace-heading">语音识别窗口</h2>
                    </div>
                    <div className="workspace-status-pill">
                      {!hasSelectedProject ? "project required" : selectedJob?.status || (liveTranscriptSnapshot ? "live" : "idle")}
                    </div>
                  </div>
                  <div className="workspace-scroll-content whitespace-pre-wrap">
                    {!hasSelectedProject ? projectLockedReason : transcriptContent || liveAutoCreateHint}
                  </div>
                </article>

                <article className="workspace-card">
                  <div className="workspace-card-header">
                    <div>
                      <p className="workspace-kicker">Task Rail</p>
                      <h2 className="workspace-heading">任务栏</h2>
                    </div>
                    <div className="workspace-status-pill">{selectedArtifacts.length} cards</div>
                  </div>
                  <div className="workspace-card-stack">
                    {selectedArtifacts.length ? selectedArtifacts.map((artifact) => (
                      <section key={artifact.id} className="workspace-task-card">
                        <header className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                              {artifact.kind.replaceAll("_", " ")}
                            </p>
                            <h3 className="text-lg font-semibold text-slate-900">{artifact.title}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(artifact)}
                            className="workspace-inline-action"
                          >
                            <Star
                              className={`h-4 w-4 ${favoriteArtifactIds.has(artifact.id) ? "fill-amber-400 text-amber-500" : ""}`}
                            />
                          </button>
                        </header>
                        <p className="workspace-muted-copy">{artifact.summary}</p>
                        <div className="workspace-scroll-content min-h-[140px] whitespace-pre-wrap text-sm text-slate-700">
                          {artifact.content || "This card is still generating."}
                        </div>
                        {getArtifactDownloadPath(artifact) ? (
                          <div className="flex justify-end">
                            <a
                              href={getArtifactDownloadPath(artifact) || undefined}
                              className="workspace-chip-button"
                            >
                              <Download className="h-3.5 w-3.5" />
                              导出 docx
                            </a>
                          </div>
                        ) : null}
                        {artifact.audio_url ? (
                          <audio controls className="mt-2 w-full">
                            <source src={artifact.audio_url} />
                          </audio>
                        ) : null}
                      </section>
                    )) : (
                      <div className="workspace-empty-card">
                        <Sparkles className="h-5 w-5" />
                        <div className="grid gap-3">
                          <p className="workspace-muted-copy">点右侧 Studio 功能卡后，结果会以任务卡形式出现在这里。</p>
                          {!hasSelectedProject ? (
                            <button type="button" className="workspace-chip-button" onClick={() => setNewProjectOpen(true)}>
                              <FolderPlus className="h-3.5 w-3.5" />
                              先创建一个项目
                            </button>
                          ) : !selectedJob ? (
                            <button type="button" className="workspace-chip-button" onClick={() => setNewInterviewOpen(true)}>
                              <Plus className="h-3.5 w-3.5" />
                              先创建一个访谈
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              </div>

              <article className="workspace-card">
                <div className="workspace-card-header">
                  <div>
                    <p className="workspace-kicker">Source Context</p>
                    <h2 className="workspace-heading">来源详情</h2>
                  </div>
                  {selectedSource?.url ? (
                    <a
                      href={selectedSource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="workspace-inline-action"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                {selectedSource ? (
                  <div className="grid gap-4">
                    <div className="workspace-source-meta">
                      <div>
                        <p className="workspace-kicker">Selected source</p>
                        <h3 className="workspace-heading text-[1.15rem]">{selectedSource.title || selectedSource.url || "来源"}</h3>
                      </div>
                      <div className="workspace-status-pill">{selectedSource.status}</div>
                    </div>
                    <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
                      {selectedSource.extracted_text || selectedSource.raw_text || "来源正文还未提取完成。"}
                    </div>
                  </div>
                ) : (
                  <div className="workspace-empty-card">
                    <Link2 className="h-5 w-5" />
                    <div className="grid gap-3">
                      <p className="workspace-muted-copy">
                        {hasSelectedProject ? "当前项目还没有可用来源。导入网页后，这里会展示正文内容。" : projectLockedReason}
                      </p>
                      <button
                        type="button"
                        className="workspace-chip-button"
                        onClick={() => hasSelectedProject ? setNewSourceOpen(true) : setNewProjectOpen(true)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {hasSelectedProject ? "添加第一个来源" : "先创建项目"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            </section>
          </section>

          <aside className="workspace-studio">
            <div className="workspace-panel workspace-studio-panel">
              <div className="workspace-card-header">
                <div>
                  <p className="workspace-kicker">Studio</p>
                  <h2 className="workspace-heading">灵感区域</h2>
                </div>
                <Bot className="h-5 w-5 text-slate-500" />
              </div>

              <div className="workspace-studio-grid">
                {ARTIFACT_KINDS.filter((kind) => !["podcast_script", "podcast_audio", "ic_qa", "wechat_article"].includes(kind)).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => generateArtifact(kind)}
                    className="workspace-studio-card"
                    disabled={!selectedJob || isPending}
                  >
                    <div>
                      <p className="workspace-kicker">{getArtifactLabel(kind)}</p>
                      <p className="text-sm text-slate-600">{getArtifactDescription(kind)}</p>
                    </div>
                  </button>
                ))}
                <button type="button" onClick={() => generateArtifact("podcast_audio")} className="workspace-studio-card workspace-studio-card-accent" disabled={!selectedJob || isPending}>
                  <AudioLines className="h-5 w-5" />
                  <div>
                    <p className="workspace-kicker">AI 播客</p>
                    <p className="text-sm text-slate-600">先生成脚本，再请求阿里 TTS 音频。</p>
                  </div>
                </button>
                <button type="button" onClick={() => generateArtifact("ic_qa")} className="workspace-studio-card" disabled={!selectedJob || isPending}>
                  <div>
                    <p className="workspace-kicker">IC 纪要</p>
                    <p className="text-sm text-slate-600">延续当前研究导向输出。</p>
                  </div>
                </button>
                <button type="button" onClick={() => generateArtifact("wechat_article")} className="workspace-studio-card" disabled={!selectedJob || isPending}>
                  <div>
                    <p className="workspace-kicker">公众号长文</p>
                    <p className="text-sm text-slate-600">保留原有长文交付链路。</p>
                  </div>
                </button>
              </div>

                <div className="workspace-recent-list">
                  <p className="workspace-section-title"><span>Recent outputs</span></p>
                  {selectedArtifacts.length ? selectedArtifacts.slice(0, 4).map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      className="workspace-list-item"
                      onClick={() => setSelectedJobId(artifact.job_id)}
                    >
                      <span className="min-w-0 truncate">{artifact.title}</span>
                      <span className="shrink-0 text-xs uppercase text-slate-400">{artifact.kind}</span>
                    </button>
                  )) : <p className="workspace-muted-copy">{hasSelectedJob ? "当前访谈还没有生成过输出。" : liveAutoCreateHint}</p>}
                </div>
              </div>
          </aside>
        </main>
      </div>

      <Dialog open={newInterviewOpen} onOpenChange={(open) => {
        if (open && !hasSelectedProject) {
          setNewProjectOpen(true);
          return;
        }
        setNewInterviewOpen(open);
      }}>
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>新建访谈</DialogTitle>
          </DialogHeader>
          <NewJobForm
            embedded
            plan={plan}
            projectId={selectedProjectId}
            onCreated={handleJobCreated}
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

      {isPending ? <div className="workspace-loading-bar" /> : null}
    </>
  );
}
