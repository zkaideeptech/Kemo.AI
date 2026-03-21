/**
 * @file new-job-form.tsx
 * @description 上传文件 / 导入 URL 的统一入口
 */

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanTier } from "@/lib/billing/plan";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { JobRow, SourceRow } from "@/lib/workspace";

type UploadState = "idle" | "uploading" | "success" | "error";
type SuccessKind = "job" | "source" | null;

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
    `文件名：${file.name}`,
    `格式：${file.type || getFileExtension(file.name) || "未知"}`,
    `大小：${formatFileSize(file.size)}`,
  ].join("\n");

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

  const [title, setTitle] = useState("");
  const [guestName, setGuestName] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [inputType, setInputType] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [redirectId, setRedirectId] = useState<string | null>(null);
  const [successKind, setSuccessKind] = useState<SuccessKind>(null);

  useEffect(() => {
    if (uploadState !== "success" || onCreated || onImportedSource) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (successKind === "job" && redirectId) {
        router.push(`/${locale}/app/jobs?job=${redirectId}`);
        return;
      }

      router.push(`/${locale}/app/jobs`);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [locale, onCreated, onImportedSource, redirectId, router, successKind, uploadState]);

  async function submit() {
    if (!projectId) {
      setError("请先创建并选中一个项目");
      return;
    }

    if (inputType === "url") {
      if (!url.trim()) {
        setError("请输入链接 / Missing URL");
        return;
      }

      try {
        new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
      } catch {
        setError("请输入有效的 URL 地址 / Invalid URL");
        return;
      }
    } else if (!file) {
      setError(t("new.missingFile") || "Missing file");
      return;
    }

    if (file) {
      const fileSizeMb = file.size / (1024 * 1024);
      if (fileSizeMb > plan.maxFileSizeMb) {
        setError(`File exceeds ${plan.maxFileSizeMb}MB limit`);
        return;
      }
    }

    setUploadState("uploading");
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Not authenticated");
      }

      if (inputType === "url") {
        const res = await fetch(`/api/projects/${projectId}/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || null,
            url: url.trim(),
            sourceType: "url_import",
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || "导入链接失败");
        }

        const source = json.data.source as SourceRow;
        setSuccessKind("source");
        setRedirectId(source.id);
        setUploadState("success");
        onImportedSource?.(source);
        return;
      }

      const currentFile = file as File;
      const safeFileName = sanitizeFileName(currentFile.name);
      const storagePath = `${user.id}/uploads/${crypto.randomUUID()}-${safeFileName}`;
      const mimeType = currentFile.type || "application/octet-stream";
      const mediaFile = isMediaFile(currentFile);

      const { error: storageError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, currentFile, {
          contentType: mimeType,
          upsert: false,
        });

      if (storageError) {
        throw new Error(storageError.message || "Upload failed");
      }

      if (mediaFile) {
        const sourceType = mimeType.startsWith("video/") ? "video_upload" : "audio_upload";
        const res = await fetch(`/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            projectId,
            guestName,
            interviewerName,
            sourceType,
            captureMode: "upload",
            storagePath,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            mimeType,
          }),
        });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
          await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {
            // ignore cleanup failure
          });
          throw new Error(json?.error?.message || "Upload failed");
        }

        const newJobId = json.data.jobId as string;
        const createdJob = json.data.job as JobRow | undefined;
        setSuccessKind("job");
        setRedirectId(newJobId);
        setUploadState("success");

        if (createdJob) {
          onCreated?.(createdJob);
        }

        fetch(`/api/jobs/${newJobId}/run`, { method: "POST" }).catch(() => {
          // ignore pipeline trigger failures here; the workspace will surface actual state
        });
        return;
      }

      const documentText = await buildDocumentSourceText(currentFile);
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || currentFile.name,
          sourceType: "file_upload",
          rawText: documentText,
          extractedText: documentText,
          metadata: {
            storage_path: storagePath,
            file_name: currentFile.name,
            file_size: currentFile.size,
            mime_type: mimeType,
          },
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {
          // ignore cleanup failure
        });
        throw new Error(json?.error?.message || "文件导入失败");
      }

      const source = json.data.source as SourceRow;
      setSuccessKind("source");
      setRedirectId(source.id);
      setUploadState("success");
      onImportedSource?.(source);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : (t("new.uploadFailed") || "Upload failed"));
      setUploadState("error");
    }
  }

  const selectedFileKind = file ? (isMediaFile(file) ? "media" : "document") : null;
  const successTitle = successKind === "job" ? "素材已进入转写" : "来源已导入项目";
  const successDescription =
    successKind === "job"
      ? "系统已开始处理音频/视频，稍后会在工作区生成摘要与主稿。"
      : "链接或文档已经归档到当前项目，可直接在工作区里查看和引用。";

  if (uploadState === "success") {
    return (
      <Card className="bg-card border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 py-12">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-green-500/20 rounded-full animate-pulse" />
            <CheckCircle2 className="relative h-20 w-20 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{successTitle}</h2>
            <p className="text-muted-foreground">{successDescription}</p>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          <Button
            variant="secondary"
            className="w-full sm:w-auto border-border hover:bg-background"
            onClick={() => router.push(successKind === "job" && redirectId ? `/${locale}/app/jobs?job=${redirectId}` : `/${locale}/app/jobs`)}
          >
            立即查看
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState === "error") {
    return (
      <Card className="bg-card border-destructive/20 shadow-sm">
        <CardContent className="flex flex-col items-center gap-6 py-12">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-destructive/10 rounded-full" />
            <XCircle className="relative h-20 w-20 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{t("new.uploadFailed") || "上传失败"}</h2>
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                setUploadState("idle");
                setError(null);
              }}
            >
              {t("new.retry") || "重试"}
            </Button>
            <Button
              variant="secondary"
              className="border-border hover:bg-background"
              onClick={() => router.push(`/${locale}/app/jobs`)}
            >
              返回工作台
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-card border-border shadow-sm transition-all duration-700 ${embedded ? "" : "animate-in fade-in slide-in-from-bottom-8 duration-1000"}`}>
      <CardHeader className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground self-center">
          上传文件
        </div>
        <div className="space-y-2">
          <CardTitle className={`${embedded ? "text-2xl" : "text-3xl"} font-black tracking-tighter bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent`}>
            音频转写 / 文档归档 / URL 导入
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            音频和视频会创建转写任务；文档与网页会进入当前项目的来源库。
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setInputType("file")}
            className={`rounded-2xl border p-4 text-left transition-all ${inputType === "file" ? "border-primary bg-primary/10 shadow-[0_12px_40px_rgba(16,185,129,0.12)]" : "border-border bg-background/60 hover:border-primary/40"}`}
          >
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-bold">上传文件</p>
              <p className="text-xs text-muted-foreground">支持音频、视频、TXT、Markdown、PDF、DOC、DOCX。</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setInputType("url")}
            className={`rounded-2xl border p-4 text-left transition-all ${inputType === "url" ? "border-primary bg-primary/10 shadow-[0_12px_40px_rgba(16,185,129,0.12)]" : "border-border bg-background/60 hover:border-primary/40"}`}
          >
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Link2 className="h-5 w-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-bold">导入 URL</p>
              <p className="text-xs text-muted-foreground">适合文章、YouTube、播客链接或其他网页来源。</p>
            </div>
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-3">
            <Label htmlFor="title" className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
              标题
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="给这次上传起个名字"
              className="bg-card border-border bg-background h-12"
            />
          </div>
          <div className="grid gap-3">
            <Label className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
              项目上限
            </Label>
            <div className="flex h-12 items-center rounded-lg border border-border bg-background px-4 text-sm text-muted-foreground">
              当前套餐 {t(`plan.${plan.plan}`)}，单文件上限 {plan.maxFileSizeMb}MB
            </div>
          </div>
        </div>

        {inputType === "file" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3">
                <Label htmlFor="guestName" className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
                  Guest
                </Label>
                <Input
                  id="guestName"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="受访者 / 会议对象"
                  className="bg-card border-border bg-background h-12"
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="interviewerName" className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
                  Interviewer
                </Label>
                <Input
                  id="interviewerName"
                  value={interviewerName}
                  onChange={(event) => setInterviewerName(event.target.value)}
                  placeholder="采访者 / 记录者"
                  className="bg-card border-border bg-background h-12"
                />
              </div>
            </div>

            <div className="grid gap-4">
              <Label htmlFor="file" className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
                选择文件
              </Label>
              <Input
                id="file"
                type="file"
                accept="audio/*,video/*,.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="relative bg-card border-border bg-background file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:mr-4 file:px-4 file:h-full file:font-bold transition-all duration-500 h-14 py-2 focus-visible:ring-primary"
              />
            </div>

            <div className="grid gap-3 rounded-3xl border border-border bg-background/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {selectedFileKind === "media" ? <AudioLines className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{file ? file.name : "尚未选择文件"}</p>
                    <p className="text-xs text-muted-foreground">
                      {file
                        ? `${formatFileSize(file.size)} · ${selectedFileKind === "media" ? "进入转写流程" : "导入来源库"}`
                        : "媒体文件会创建任务，文档会归档为来源。"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card/70 p-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">音频 / 视频</p>
                  <p className="mt-2 text-sm font-medium">创建 Job，自动进入转写与生成。</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 p-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">文本文档</p>
                  <p className="mt-2 text-sm font-medium">提取文本预览，归档为项目来源。</p>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 p-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">PDF / DOCX</p>
                  <p className="mt-2 text-sm font-medium">先归档文件，后续可以继续补正文提取。</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="grid gap-4">
            <Label htmlFor="url" className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
              URL
            </Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://... / YouTube / 播客 / 网页文章"
              className="bg-card border-border bg-background h-14 text-sm"
            />
            <div className="rounded-3xl border border-border bg-background/70 p-5">
              <p className="text-sm font-semibold">链接会直接进入当前项目 Sources</p>
              <p className="mt-2 text-sm text-muted-foreground">
                适合网页文章、YouTube、播客页、研究报告链接。导入后可在中间区域直接查看和引用。
              </p>
            </div>
          </div>
        )}

        {error ? <p className="text-sm font-bold text-destructive text-center">{error}</p> : null}

        <Button
          onClick={submit}
          disabled={uploadState === "uploading"}
          className="h-14 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-black tracking-widest uppercase transition-all duration-500 rounded-xl"
        >
          {uploadState === "uploading" ? (
            <span className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              {inputType === "url" ? "导入中" : t("new.uploading")}
            </span>
          ) : (
            <span className="flex items-center gap-3">
              {inputType === "url" ? <Link2 className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              {inputType === "url" ? "导入来源" : t("new.submit")}
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
