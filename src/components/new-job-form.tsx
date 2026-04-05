"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileAudio,
  Globe,
  Link2,
  Loader2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlanTier } from "@/lib/billing/plan";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { JobRow, SourceRow } from "@/lib/workspace";

type UploadState = "idle" | "working" | "success" | "error";
type SuccessKind = "job" | "source" | null;
type EntryMode = "selection" | "url";
export type NewJobStarterPreference = "selection" | "upload" | "url";
type ProgressTone = "idle" | "draft" | "queued" | "running" | "ready";
type ProgressSnapshot = {
  title: string;
  detail: string;
  stage: 0 | 1 | 2 | 3;
  tone: ProgressTone;
};

const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
const TEXT_PREVIEW_LIMIT = 16000;
const MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".webm",
  ".mpg",
  ".mpeg",
]);
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".srt",
  ".vtt",
]);

function sanitizeFileName(name: string) {
  return name
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_");
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function isMediaFile(file: File) {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return true;
  }

  return MEDIA_EXTENSIONS.has(getFileExtension(file.name));
}

function isTextLikeFile(file: File) {
  if (file.type.startsWith("text/")) {
    return true;
  }

  if (
    file.type.includes("json") ||
    file.type.includes("xml") ||
    file.type.includes("yaml")
  ) {
    return true;
  }

  return TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

async function buildDocumentSourceText(file: File) {
  const fileSummary = [
    `\u6587\u4ef6\u540d\uff1a${file.name}`,
    `\u683c\u5f0f\uff1a${file.type || getFileExtension(file.name) || "\u672a\u77e5"}`,
    `\u5927\u5c0f\uff1a${formatFileSize(file.size)}`,
  ].join("\n");

  if (!isTextLikeFile(file)) {
    return `${fileSummary}\n\n\u6587\u4ef6\u5df2\u5f52\u6863\u5230\u9879\u76ee\u6765\u6e90\uff0c\u5f53\u524d\u7248\u672c\u6682\u4e0d\u505a\u6b63\u6587\u63d0\u53d6\u3002`;
  }

  const text = (await file.text().catch(() => "")).replace(/\u0000/g, "").trim();
  if (!text) {
    return `${fileSummary}\n\n\u6587\u4ef6\u5df2\u5f52\u6863\uff0c\u4f46\u6b63\u6587\u4e3a\u7a7a\u6216\u6682\u4e0d\u53ef\u8bfb\u3002`;
  }

  return `${fileSummary}\n\n${text.slice(0, TEXT_PREVIEW_LIMIT)}`;
}

function renderProgressSnapshot(progress: ProgressSnapshot) {
  return (
    <div className="workspace-progress-block">
      <div className="workspace-progress-meta">
        <span>{progress.title}</span>
        <span>{progress.detail}</span>
      </div>
      <div className="workspace-progress-track workspace-progress-track-steps" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={`new-job-progress-${step}`}
            className={[
              "workspace-progress-step",
              `workspace-progress-step-index-${step}`,
              progress.stage >= step ? "workspace-progress-step-active" : "",
              progress.tone !== "idle" ? `workspace-progress-step-${progress.tone}` : "",
              progress.stage === step && progress.tone !== "ready" ? "workspace-progress-step-current" : "",
            ].filter(Boolean).join(" ")}
          />
        ))}
      </div>
    </div>
  );
}

export function NewJobForm({
  plan,
  projectId,
  embedded = false,
  preferredEntry = "selection",
  onCreated,
  onImportedSource,
}: {
  plan: { plan: PlanTier; maxFileSizeMb: number };
  projectId?: string | null;
  embedded?: boolean;
  preferredEntry?: NewJobStarterPreference;
  onCreated?: (job: JobRow) => void;
  onImportedSource?: (source: SourceRow) => void;
}) {
  const router = useRouter();
  const locale = useLocale();
  const isZh = locale !== "en";
  const copy = useMemo(() => ({
    needProject: isZh ? "\u8bf7\u5148\u521b\u5efa\u5e76\u9009\u4e2d\u4e00\u4e2a\u9879\u76ee" : "Create and select a project first",
    waiting: isZh ? "\u7b49\u5f85\u5f00\u59cb" : "Waiting to start",
    waitingDetail: isZh ? "\u9009\u62e9\u4e00\u4e2a\u6587\u4ef6\u6216 URL \u540e\u4f1a\u7acb\u5373\u8fdb\u5165\u6574\u7406" : "Choose a file or URL to start processing",
    fileTooLarge: (size: number) =>
      isZh ? `\u6587\u4ef6\u5927\u5c0f\u8d85\u8fc7 ${size}MB \u9650\u989d` : `The file exceeds the ${size}MB limit`,
    notAuthenticated: isZh ? "\u8bf7\u5148\u767b\u5f55" : "Please sign in first",
    uploadFailed: isZh ? "\u4e0a\u4f20\u5931\u8d25" : "Upload failed",
    importFailed: isZh ? "\u5bfc\u5165\u5931\u8d25" : "Import failed",
    invalidUrl: isZh ? "\u8bf7\u8f93\u5165\u6709\u6548\u7684 URL" : "Enter a valid URL",
    enterUrl: isZh ? "\u8bf7\u8f93\u5165 URL" : "Enter a URL",
    verifyUrl: isZh ? "\u9a8c\u8bc1 URL" : "Validating URL",
    verifyUrlDetail: isZh ? "\u6b63\u5728\u786e\u8ba4\u7f51\u9875\u6216\u64ad\u5ba2\u5730\u5740" : "Checking the webpage or podcast link",
    uploadFile: isZh ? "\u4e0a\u4f20\u6587\u4ef6" : "Uploading file",
    uploadFileDetail: isZh ? "\u6b63\u5728\u5199\u5165\u9879\u76ee\u7a7a\u95f4" : "Saving into the project workspace",
    archiveSource: isZh ? "\u5f52\u6863\u6765\u6e90" : "Archiving source",
    archiveSourceDetail: isZh ? "\u6b63\u5728\u5199\u5165\u6587\u6863\u7d20\u6750" : "Saving the imported content",
    createJob: isZh ? "\u521b\u5efa\u4efb\u52a1" : "Creating job",
    createJobDetail: isZh ? "\u6b63\u5728\u5efa\u7acb\u5904\u7406\u4efb\u52a1\u5e76\u542f\u52a8\u8fdb\u7a0b" : "Creating the job and starting processing",
    sourceReady: isZh ? "\u6765\u6e90\u5df2\u5f52\u6863" : "Source archived",
    jobReady: isZh ? "\u5bf9\u8bdd\u7a3f\u4efb\u52a1\u5df2\u521b\u5efa" : "Processing job created",
    jobReadyDetail: isZh ? "\u6b63\u5728\u8fdb\u5165\u5f53\u524d\u5bf9\u8bdd\u7a3f\uff0c\u53ef\u7acb\u5373\u7ee7\u7eed\u6574\u7406" : "Opening the current job so you can continue",
    sourceReadyDetail: isZh ? "\u6765\u6e90\u5185\u5bb9\u5df2\u5199\u5165\u5f53\u524d\u9879\u76ee" : "The source content has been added to the project",
    processFailed: isZh ? "\u672c\u6b21\u5904\u7406\u5931\u8d25" : "This run failed",
    retry: isZh ? "\u91cd\u8bd5" : "Retry",
    fileProcessing: isZh ? "\u6587\u4ef6\u6a21\u5f0f\u6574\u7406\u4e2d" : "Processing file mode",
    nonStreamingHint: isZh
      ? "\u8fd9\u4e00\u6b21\u4f1a\u8d70\u5b8c\u6574\u4e0a\u4f20\u3001\u5efa\u7a3f\u548c\u6574\u7406\u6d41\u7a0b\uff0c\u4e0d\u4f7f\u7528\u6d41\u5f0f\u5c55\u5f00\u3002"
      : "This run completes upload, job creation, and synthesis as a staged batch flow.",
    audio: isZh ? "\u4e0a\u4f20\u97f3\u9891" : "Upload Audio",
    audioDesc: isZh ? "\u4e00\u6b21\u6027\u6574\u7406\u672c\u5730\u97f3\u9891\u3001\u89c6\u9891\u6216\u6587\u6863\u3002" : "Process local audio, video, or documents in one pass.",
    url: "URL",
    urlDesc: isZh ? "\u5bfc\u5165\u7f51\u9875\u3001\u64ad\u5ba2\u6216\u8fdc\u7a0b\u97f3\u9891\u94fe\u63a5\u3002" : "Import a webpage, podcast, or remote media link.",
    import: isZh ? "\u5bfc\u5165" : "Import",
    redirectJob: (id: string) => `/${locale}/app/jobs?job=${id}`,
    redirectDefault: `/${locale}/app/jobs`,
  }), [isZh, locale]);
  const [entryMode, setEntryMode] = useState<EntryMode>("selection");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [redirectId, setRedirectId] = useState<string | null>(null);
  const [successKind, setSuccessKind] = useState<SuccessKind>(null);
  const [progress, setProgress] = useState<ProgressSnapshot>({
    title: copy.waiting,
    detail: copy.waitingDetail,
    stage: 0,
    tone: "idle",
  });

  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPreferredEntryRef = useRef<NewJobStarterPreference>("selection");

  useEffect(() => {
    if (entryMode === "url" && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [entryMode]);

  useEffect(() => {
    if (preferredEntry === lastPreferredEntryRef.current) {
      return;
    }

    lastPreferredEntryRef.current = preferredEntry;
    setError(null);

    if (preferredEntry === "url") {
      setEntryMode("url");
      return;
    }

    setEntryMode("selection");

    if (preferredEntry === "upload") {
      window.setTimeout(() => {
        fileInputRef.current?.click();
      }, 0);
    }
  }, [preferredEntry]);

  useEffect(() => {
    if (uploadState !== "success" || onCreated || onImportedSource) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (successKind === "job" && redirectId) {
        router.push(copy.redirectJob(redirectId));
      } else {
        router.push(copy.redirectDefault);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [copy, locale, onCreated, onImportedSource, redirectId, router, successKind, uploadState]);

  function resetToSelection() {
    setEntryMode("selection");
    setError(null);
    setUploadState("idle");
    setProgress({
      title: copy.waiting,
      detail: copy.waitingDetail,
      stage: 0,
      tone: "idle",
    });
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    event.target.value = "";

    if (!projectId) {
      setError(copy.needProject);
      return;
    }

    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > plan.maxFileSizeMb) {
      setError(copy.fileTooLarge(plan.maxFileSizeMb));
      return;
    }

    setUploadState("working");
    setError(null);
    setProgress({
      title: copy.uploadFile,
      detail: copy.uploadFileDetail,
      stage: 1,
      tone: "queued",
    });

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(copy.notAuthenticated);
      }

      const safeFileName = sanitizeFileName(file.name);
      const storagePath = `${user.id}/uploads/${crypto.randomUUID()}-${safeFileName}`;
      const mimeType = file.type || "application/octet-stream";
      const mediaFile = isMediaFile(file);

      const { error: storageError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, file, { contentType: mimeType, upsert: false });

      if (storageError) {
        throw new Error(storageError.message || copy.uploadFailed);
      }

      if (mediaFile) {
        setProgress({
          title: copy.createJob,
          detail: copy.createJobDetail,
          stage: 2,
          tone: "running",
        });

        const sourceType = mimeType.startsWith("video/") ? "video_upload" : "audio_upload";
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name,
            projectId,
            sourceType,
            captureMode: "upload",
            storagePath,
            fileName: file.name,
            fileSize: file.size,
            mimeType,
          }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {});
          throw new Error(json?.error?.message || copy.uploadFailed);
        }

        const createdJob = json.data.job as JobRow;

        setProgress({
          title: isZh ? "\u5f00\u59cb\u6574\u7406" : "Processing",
          detail: isZh ? "\u6b63\u5728\u63a8\u8fdb\u4e00\u6b21\u6027\u5bf9\u8bdd\u7a3f\u6574\u7406" : "Running the one-pass processing flow",
          stage: 3,
          tone: "ready",
        });

        await fetch(`/api/jobs/${createdJob.id}/run`, { method: "POST" }).catch(() => {});
        setSuccessKind("job");
        setRedirectId(createdJob.id);
        setUploadState("success");
        onCreated?.(createdJob);
        return;
      }

      setProgress({
        title: copy.archiveSource,
        detail: copy.archiveSourceDetail,
        stage: 2,
        tone: "running",
      });

      const documentText = await buildDocumentSourceText(file);
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name,
          sourceType: "file_upload",
          rawText: documentText,
          extractedText: documentText,
          metadata: {
            storage_path: storagePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: mimeType,
          },
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {});
        throw new Error(json?.error?.message || copy.importFailed);
      }

      setProgress({
        title: isZh ? "\u5df2\u5b8c\u6210" : "Completed",
        detail: copy.sourceReadyDetail,
        stage: 3,
        tone: "ready",
      });

      const source = json.data.source as SourceRow;
      setSuccessKind("source");
      setRedirectId(source.id);
      setUploadState("success");
      onImportedSource?.(source);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.uploadFailed);
      setUploadState("error");
    }
  }

  async function submitUrl() {
    if (!projectId) {
      setError(copy.needProject);
      return;
    }

    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError(copy.enterUrl);
      return;
    }

    try {
      new URL(/^https?:\/\//i.test(normalizedUrl) ? normalizedUrl : `https://${normalizedUrl}`);
    } catch {
      setError(copy.invalidUrl);
      return;
    }

    setUploadState("working");
    setError(null);
    setProgress({
      title: copy.verifyUrl,
      detail: copy.verifyUrlDetail,
      stage: 1,
      tone: "queued",
    });

    try {
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: null,
          url: normalizedUrl,
          sourceType: "url_import",
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || copy.importFailed);
      }

      setProgress({
        title: copy.archiveSource,
        detail: copy.archiveSourceDetail,
        stage: 2,
        tone: "running",
      });

      const source = json.data.source as SourceRow;

      setProgress({
        title: isZh ? "\u5df2\u5b8c\u6210" : "Completed",
        detail: isZh ? "\u6765\u6e90\u5df2\u5f52\u6863\uff0c\u53ef\u4ee5\u7ee7\u7eed\u5f15\u7528\u548c\u641c\u7d22" : "The source is archived and ready to be searched and reused",
        stage: 3,
        tone: "ready",
      });

      setSuccessKind("source");
      setRedirectId(source.id);
      setUploadState("success");
      onImportedSource?.(source);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : copy.importFailed);
      setUploadState("error");
    }
  }

  if (uploadState === "success") {
    return (
      <Card className={`border-0 shadow-none ${embedded ? "bg-transparent" : "bg-card"}`}>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
              {successKind === "job" ? copy.jobReady : copy.sourceReady}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {successKind === "job" ? copy.jobReadyDetail : copy.sourceReadyDetail}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (uploadState === "error") {
    return (
      <Card className={`border-0 shadow-none ${embedded ? "bg-transparent" : "bg-card"}`}>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <XCircle className="h-14 w-14 text-rose-500" />
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
              {copy.processFailed}
            </h2>
            <p className="text-sm font-medium text-rose-500 dark:text-rose-400">{error}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setUploadState("idle");
              setProgress({
                title: copy.waiting,
                detail: copy.waitingDetail,
                stage: 0,
                tone: "idle",
              });
              setError(null);
            }}
          >
            {copy.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState === "working") {
    return (
      <Card className={`border-0 shadow-none ${embedded ? "bg-transparent" : "bg-card"}`}>
        <CardContent className="py-8">
          <section className="workspace-primary-progress-card">
            <header className="workspace-primary-progress-card-head">
              <div className="workspace-card-title-row">
                <Loader2 className="workspace-card-title-icon animate-spin text-[#8a5a3c] dark:text-[#00dcbf]" />
                <div className="min-w-0">
                  <h4 className="workspace-heading text-[1rem]">{copy.fileProcessing}</h4>
                  <p className="workspace-muted-copy">{progress.detail}</p>
                </div>
              </div>
            </header>
            {renderProgressSnapshot(progress)}
            <div className="workspace-scroll-content whitespace-pre-wrap text-sm text-slate-700">
              {copy.nonStreamingHint}
            </div>
          </section>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${embedded ? "border-0 bg-transparent shadow-none" : "bg-card"} text-card-foreground`}>
      <CardContent className="grid gap-4 pb-2">
        {entryMode === "selection" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-2xl border border-[#dacfc3] bg-white/90 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#d8c0ab] hover:bg-[#fff8f0] dark:border-white/10 dark:bg-white/5 dark:hover:border-[#00dcbf]/35 dark:hover:bg-[#00dcbf]/6"
            >
              <div className="flex min-h-[11rem] flex-col justify-between">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1e2d4] text-[#8a5a3c] dark:bg-[#00dcbf]/15 dark:text-[#48f9db]">
                  <FileAudio className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {copy.audio}
                </h3>
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{copy.audioDesc}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setEntryMode("url");
                setError(null);
              }}
              className="rounded-2xl border border-[#dacfc3] bg-white/90 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#d8c0ab] hover:bg-[#fff8f0] dark:border-white/10 dark:bg-white/5 dark:hover:border-[#00dcbf]/35 dark:hover:bg-[#00dcbf]/6"
            >
              <div className="flex min-h-[11rem] flex-col justify-between">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1e2d4] text-[#8a5a3c] dark:bg-[#00dcbf]/15 dark:text-[#48f9db]">
                  <Globe className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {copy.url}
                </h3>
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{copy.urlDesc}</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="grid gap-4 rounded-2xl border border-[#dacfc3] bg-[#fffaf3] p-4 dark:border-slate-800 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetToSelection}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d1c8] text-[#7c6f66] transition-colors hover:border-[#d8c0ab] hover:text-[#1a1c1c] dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a09287]" />
                <Input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitUrl();
                    }
                  }}
                  placeholder="https://"
                  className="h-12 pl-10"
                />
              </div>
              <Button
                type="button"
                onClick={() => void submitUrl()}
                className="h-12 rounded-xl bg-[#8a5a3c] px-5 text-[#fff8f0] hover:bg-[#6f4a34]"
              >
                {copy.import}
              </Button>
            </div>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="audio/*,video/*,.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx"
          onChange={handleFileSelect}
        />

        {error ? <p className="text-sm font-medium text-rose-500">{error}</p> : null}
      </CardContent>
    </Card>
  );
}



