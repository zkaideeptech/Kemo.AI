/**
 * @file new-job-form.tsx
 * @description 上传文件 / 导入 URL / 发起实时记录的统一入口
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Link2, Loader2, Mic, Upload, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanTier } from "@/lib/billing/plan";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { JobRow, SourceRow } from "@/lib/workspace";

type UploadState = "idle" | "uploading" | "success" | "error";
type SuccessKind = "job" | "source" | null;

const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
const TEXT_PREVIEW_LIMIT = 16000;
const MEDIA_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".mov", ".mkv", ".avi", ".webm", ".mpg", ".mpeg"]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".srt", ".vtt"]);

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, "_").replace(/_+/g, "_");
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function isMediaFile(file: File) {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  return MEDIA_EXTENSIONS.has(getFileExtension(file.name));
}

function isTextLikeFile(file: File) {
  if (file.type.startsWith("text/")) return true;
  if (file.type.includes("json") || file.type.includes("xml") || file.type.includes("yaml")) return true;
  return TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

async function buildDocumentSourceText(file: File) {
  const fileSummary = [`文件名：${file.name}`, `格式：${file.type || getFileExtension(file.name) || "未知"}`, `大小：${formatFileSize(file.size)}`].join("\n");

  if (!isTextLikeFile(file)) {
    return `${fileSummary}\n\n文件已归档到项目来源，当前版本暂不做正文提取。`;
  }

  const text = (await file.text().catch(() => "")).replace(/\u0000/g, "").trim();
  if (!text) {
    return `${fileSummary}\n\n文件已归档，但正文为空或暂不可读。`;
  }

  return `${fileSummary}\n\n${text.slice(0, TEXT_PREVIEW_LIMIT)}`;
}

export function NewJobForm({
  plan,
  projectId,
  embedded = false,
  onCreated,
  onImportedSource,
}: {
  plan: { plan: PlanTier; maxFileSizeMb: number };
  projectId?: string | null;
  embedded?: boolean;
  onCreated?: (job: JobRow) => void;
  onImportedSource?: (source: SourceRow) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();

  const [inputType, setInputType] = useState<"selection" | "url">("selection");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [redirectId, setRedirectId] = useState<string | null>(null);
  const [successKind, setSuccessKind] = useState<SuccessKind>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uploadState !== "success" || onCreated || onImportedSource) return;
    const timer = window.setTimeout(() => {
      router.push(successKind === "job" && redirectId ? `/${locale}/app/jobs?job=${redirectId}` : `/${locale}/app/jobs`);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [locale, onCreated, onImportedSource, redirectId, router, successKind, uploadState]);

  useEffect(() => {
    if (inputType === "url" && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [inputType]);

  async function startLive() {
    if (!projectId) {
      setError(t("workspace.errors.createProjectFirst"));
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t("workspace.live.defaultTitle"),
          projectId,
          captureMode: "live",
          sourceType: "live_audio",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || t("workspace.errors.createLiveJobFailed"));

      setSuccessKind("job");
      setRedirectId(json.data.jobId as string);
      setUploadState("success");
      if (json.data.job) onCreated?.(json.data.job as JobRow);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t("workspace.errors.createLiveJobFailed"));
      setUploadState("error");
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!projectId) {
      setError(t("workspace.errors.createProjectFirst"));
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const safeFileName = sanitizeFileName(file.name);
      const mimeType = file.type || "application/octet-stream";
      const mediaFile = isMediaFile(file);

      if (mediaFile) {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error(t("workspace.errors.notAuthenticated"));

        const storagePath = `${user.id}/uploads/${crypto.randomUUID()}-${safeFileName}`;
        const { error: storageError } = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, file, { contentType: mimeType, upsert: false });
        if (storageError) throw new Error(storageError.message || t("workspace.errors.uploadFailed"));

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
          throw new Error(json?.error?.message || t("workspace.errors.uploadFailed"));
        }

        setSuccessKind("job");
        setRedirectId(json.data.jobId as string);
        setUploadState("success");
        if (json.data.job) onCreated?.(json.data.job as JobRow);
        fetch(`/api/jobs/${json.data.jobId}/run`, { method: "POST" }).catch(() => {});
        return;
      }

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
            file_name: file.name,
            safe_file_name: safeFileName,
            file_size: file.size,
            mime_type: mimeType,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || t("workspace.errors.sourceImportFailed"));
      }

      setSuccessKind("source");
      setRedirectId((json.data.source as SourceRow).id);
      setUploadState("success");
      onImportedSource?.(json.data.source as SourceRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspace.errors.uploadFailed"));
      setUploadState("error");
    }
  }

  async function submitUrl() {
    if (!projectId) {
      setError(t("workspace.errors.createProjectFirst"));
      return;
    }
    if (!url.trim()) {
      setError(t("workspace.errors.urlRequired"));
      return;
    }

    const nextUrl = url.trim();
    try {
      new URL(/^https?:\/\//i.test(nextUrl) ? nextUrl : `https://${nextUrl}`);
    } catch {
      setError(t("workspace.errors.urlRequired"));
      return;
    }

    setUploadState("uploading");
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("workspace.errors.notAuthenticated"));

      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null, url: nextUrl, sourceType: "url_import" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || t("workspace.errors.sourceImportFailed"));

      setSuccessKind("source");
      setRedirectId((json.data.source as SourceRow).id);
      setUploadState("success");
      onImportedSource?.(json.data.source as SourceRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspace.errors.sourceImportFailed"));
      setUploadState("error");
    }
  }

  const statusTitle =
    uploadState === "success"
      ? successKind === "job"
        ? t("new.successJob")
        : t("new.successSource")
      : uploadState === "error"
        ? t("new.errorTitle")
        : t("new.title");

  return (
    <section className={embedded ? "w-full" : "mx-auto w-full max-w-2xl"}>
      <div className="rounded-[10px] border border-border/70 bg-background/90 p-5 text-foreground shadow-none">
        <div className="border-b border-border/60 pb-4">
          <p className="text-xs text-muted-foreground">
            {t("new.plan")} · {t(`plan.${plan.plan}`)}
          </p>
          <h2 className="mt-2 text-[22px] font-semibold leading-tight">{t("new.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("new.subtitle")}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t("workspace.plan.limitNote", { limit: plan.maxFileSizeMb })}
          </p>
        </div>

        {uploadState === "success" ? (
          <div className="grid min-h-56 place-items-center px-2 py-8 text-center">
            <div className="grid place-items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{statusTitle}</h3>
                <p className="text-sm text-muted-foreground">{t("new.autoRedirect")}</p>
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : uploadState === "error" ? (
          <div className="grid min-h-56 place-items-center px-2 py-8 text-center">
            <div className="grid place-items-center gap-4">
              <XCircle className="h-12 w-12 text-rose-600" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{statusTitle}</h3>
                <p className="max-w-md text-sm leading-6 text-muted-foreground">{error}</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setUploadState("idle");
                  setError(null);
                }}
              >
                {t("new.retry")}
              </Button>
            </div>
          </div>
        ) : uploadState === "uploading" ? (
          <div className="grid min-h-56 place-items-center px-2 py-8 text-center">
            <div className="grid place-items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-foreground" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{t("new.uploading")}</h3>
                <p className="text-sm text-muted-foreground">{t("new.autoRedirect")}</p>
              </div>
            </div>
          </div>
        ) : inputType === "selection" ? (
          <div className="grid gap-3 pt-5 sm:grid-cols-3">
            <button
              type="button"
              onClick={startLive}
              disabled={!projectId}
              className="group flex min-h-32 flex-col items-start justify-between rounded-[10px] border border-border/70 bg-background p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-muted/30 text-foreground transition-colors group-hover:bg-background">
                <Mic className="h-4 w-4" />
              </span>
              <span className="space-y-1">
                <strong className="block text-sm font-semibold">{t("workspace.captureDialog.liveTitle")}</strong>
                <span className="block text-xs leading-5 text-muted-foreground">{t("workspace.captureDialog.liveCopy")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!projectId}
              className="group flex min-h-32 flex-col items-start justify-between rounded-[10px] border border-border/70 bg-background p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-muted/30 text-foreground transition-colors group-hover:bg-background">
                <Upload className="h-4 w-4" />
              </span>
              <span className="space-y-1">
                <strong className="block text-sm font-semibold">{t("workspace.captureDialog.uploadTitle")}</strong>
                <span className="block text-xs leading-5 text-muted-foreground">{t("workspace.captureDialog.uploadCopy")}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setInputType("url")}
              disabled={!projectId}
              className="group flex min-h-32 flex-col items-start justify-between rounded-[10px] border border-border/70 bg-background p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-muted/30 text-foreground transition-colors group-hover:bg-background">
                <Link2 className="h-4 w-4" />
              </span>
              <span className="space-y-1">
                <strong className="block text-sm font-semibold">{t("workspace.captureDialog.urlTitle")}</strong>
                <span className="block text-xs leading-5 text-muted-foreground">{t("workspace.captureDialog.urlCopy")}</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setInputType("selection")}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("new.back")}
              </button>
              <span className="text-sm text-muted-foreground">{t("workspace.captureDialog.urlCopy")}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={urlInputRef}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitUrl();
                }}
                placeholder="https://..."
                className="h-11 flex-1 border-border/70 bg-background text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button onClick={submitUrl} className="h-11 px-5">
                {t("workspace.actions.import")}
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

        {uploadState === "idle" && !projectId ? (
          <p className="mt-4 text-xs text-muted-foreground">{t("workspace.errors.createProjectFirst")}</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
