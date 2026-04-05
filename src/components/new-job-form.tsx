/**
 * @file new-job-form.tsx
 * @description 上传文件 / 导入 URL 的统一入口
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Link2,
  Loader2,
  Upload,
  XCircle,
  Mic,
  ArrowLeft
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

  const [inputType, setInputType] = useState<"selection" | "url">("selection");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [redirectId, setRedirectId] = useState<string | null>(null);
  const [successKind, setSuccessKind] = useState<SuccessKind>(null);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uploadState !== "success" || onCreated || onImportedSource) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (successKind === "job" && redirectId) {
        router.push(`/${locale}/app/jobs?job=${redirectId}`);
      } else {
        router.push(`/${locale}/app/jobs`);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [locale, onCreated, onImportedSource, redirectId, router, successKind, uploadState]);

  useEffect(() => {
    if (inputType === "url" && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [inputType]);

  async function startLive() {
    if (!projectId) return setError("请先创建并选中一个项目");
    setUploadState("uploading");
    setError(null);
    try {
      const res = await fetch(`/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "实时记录",
          projectId,
          captureMode: "live",
          sourceType: "live_audio",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "创建失败");

      const newJobId = json.data.jobId as string;
      const createdJob = json.data.job as JobRow | undefined;
      setSuccessKind("job");
      setRedirectId(newJobId);
      setUploadState("success");
      if (createdJob) onCreated?.(createdJob);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "创建失败");
      setUploadState("error");
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset
    if (!projectId) return setError("请先创建并选中一个项目");

    setUploadState("uploading");
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const safeFileName = sanitizeFileName(file.name);
      const storagePath = `${user.id}/uploads/${crypto.randomUUID()}-${safeFileName}`;
      const mimeType = file.type || "application/octet-stream";
      const mediaFile = isMediaFile(file);

      const { error: storageError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, file, { contentType: mimeType, upsert: false });

      if (storageError) throw new Error(storageError.message || "上传失败");

      if (mediaFile) {
        const sourceType = mimeType.startsWith("video/") ? "video_upload" : "audio_upload";
        const res = await fetch(`/api/jobs`, {
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
          throw new Error(json?.error?.message || "处理失败");
        }

        const newJobId = json.data.jobId;
        const createdJob = json.data.job;
        setSuccessKind("job");
        setRedirectId(newJobId);
        setUploadState("success");
        if (createdJob) onCreated?.(createdJob);
        fetch(`/api/jobs/${newJobId}/run`, { method: "POST" }).catch(() => {});
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
          metadata: { storage_path: storagePath, file_name: file.name, file_size: file.size, mime_type: mimeType },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {});
        throw new Error(json?.error?.message || "导入失败");
      }

      const source = json.data.source;
      setSuccessKind("source");
      setRedirectId(source.id);
      setUploadState("success");
      onImportedSource?.(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
      setUploadState("error");
    }
  }

  async function submitUrl() {
    if (!projectId) return setError("请先创建并选中一个项目");
    if (!url.trim()) return setError("请输入链接");
    try {
      new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    } catch {
      return setError("请输入有效的 URL 地址");
    }

    setUploadState("uploading");
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null, url: url.trim(), sourceType: "url_import" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "导入链接失败");

      const source = json.data.source;
      setSuccessKind("source");
      setRedirectId(source.id);
      setUploadState("success");
      onImportedSource?.(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
      setUploadState("error");
    }
  }

  if (uploadState === "success") {
    const successTitle = successKind === "job" ? "素材已转接" : "来源已导入";
    return (
      <Card className="bg-transparent border-0 shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">{successTitle}</h2>
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  if (uploadState === "error") {
    return (
      <Card className="bg-transparent border-0 shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <XCircle className="h-16 w-16 text-rose-500" />
          <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">操作失败</h2>
          <p className="text-sm text-rose-500 dark:text-rose-400 font-medium">{error}</p>
          <Button variant="secondary" onClick={() => { setUploadState("idle"); setError(null); }}>重试</Button>
        </CardContent>
      </Card>
    );
  }

  if (uploadState === "uploading") {
    return (
      <Card className="bg-transparent border-0 shadow-none">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-slate-800 dark:text-white">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h2 className="text-xl font-bold tracking-tight">处理中...</h2>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border shadow-2xl overflow-hidden text-card-foreground w-full max-w-lg mx-auto">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-medium text-slate-800 dark:text-slate-200">添加来源</CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400 text-sm">
          点击以直接开启新记录，或导入你的离线灵感。
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        {inputType === "selection" ? (
          <div className="grid grid-cols-3 gap-3">
            <button
               type="button"
               onClick={startLive}
               className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-border bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
            >
               <div className="h-10 w-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center group-hover:bg-rose-500/20 group-hover:scale-110 transition-all">
                 <Mic className="h-5 w-5" />
               </div>
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300">实时录音</span>
            </button>

            <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-border bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
            >
               <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:scale-110 transition-all">
                 <Upload className="h-5 w-5" />
               </div>
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300">上传文件</span>
            </button>

            <button
               type="button"
               onClick={() => setInputType("url")}
               className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-border bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
            >
               <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:scale-110 transition-all">
                 <Link2 className="h-5 w-5" />
               </div>
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300">导入链接</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2">
               <button type="button" onClick={() => setInputType("selection")} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors">
                 <ArrowLeft className="h-5 w-5" />
               </button>
               <span className="text-sm font-medium">输入网址</span>
            </div>
            <div className="flex gap-2">
              <Input
                ref={urlInputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitUrl()}
                placeholder="https://..."
                className="bg-transparent border-border text-slate-800 dark:text-white h-12 flex-1 focus-visible:ring-1 focus-visible:ring-emerald-500"
              />
              <Button onClick={submitUrl} className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg">
                导入
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
        {error && <p className="mt-4 text-sm text-center text-rose-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
