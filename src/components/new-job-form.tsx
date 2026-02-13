/**
 * @file new-job-form.tsx
 * @description 新建任务表单组件，上传音频后显示成功/失败界面，成功后自动跳转任务详情
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Upload, Loader2 } from "lucide-react";

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

type UploadState = "idle" | "uploading" | "success" | "error";

/**
 * 新建任务表单
 * 流程：选择文件 → 上传 → 显示成功/失败 → 成功后自动跳转任务详情
 * @param plan - 用户当前套餐信息
 */
export function NewJobForm({
  plan,
}: {
  plan: { plan: PlanTier; maxFileSizeMb: number };
}) {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);

  // 上传成功后 2 秒自动跳转任务详情
  useEffect(() => {
    if (uploadState === "success" && jobId) {
      const timer = setTimeout(() => {
        router.push(`/${locale}/app/jobs/${jobId}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [uploadState, jobId, locale, router]);

  /**
   * 提交表单，上传音频并创建任务
   */
  const submit = async () => {
    if (!file) {
      setError(t("new.missingFile") || "Missing audio file");
      return;
    }

    setUploadState("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);

    try {
      const res = await fetch(`/api/jobs`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json?.error?.message || t("new.uploadFailed") || "Upload failed");
        setUploadState("error");
        return;
      }

      const newJobId = json.data.jobId;
      setJobId(newJobId);
      setUploadState("success");

      // 触发任务执行管道
      fetch(`/api/jobs/${newJobId}/run`, { method: "POST" }).catch(() => {
        // 静默处理，任务详情页会显示实际状态
      });
    } catch {
      setError(t("new.uploadFailed") || "Upload failed");
      setUploadState("error");
    }
  };

  // 上传成功界面
  if (uploadState === "success") {
    return (
      <Card className="glass border-white/10 shadow-2xl">
        <CardContent className="flex flex-col items-center gap-6 py-12">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-green-500/20 rounded-full animate-pulse" />
            <CheckCircle2 className="relative h-20 w-20 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("new.uploadSuccess") || "上传成功"}
            </h2>
            <p className="text-muted-foreground">
              {t("new.autoRedirect") || "正在自动跳转到任务详情..."}
            </p>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
          <Button
            variant="secondary"
            className="w-full sm:w-auto border-white/10 hover:bg-white/5"
            onClick={() => router.push(`/${locale}/app/jobs/${jobId}`)}
          >
            {t("new.goToJob") || "立即查看"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 上传失败界面
  if (uploadState === "error") {
    return (
      <Card className="glass border-destructive/20 shadow-2xl">
        <CardContent className="flex flex-col items-center gap-6 py-12">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-destructive/20 rounded-full" />
            <XCircle className="relative h-20 w-20 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {t("new.uploadFailed") || "上传失败"}
            </h2>
            <p className="text-sm text-destructive font-medium">{error}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <Button
              className="neon-button"
              onClick={() => {
                setUploadState("idle");
                setError(null);
              }}
            >
              {t("new.retry") || "重试"}
            </Button>
            <Button
              variant="secondary"
              className="border-white/10 hover:bg-white/5"
              onClick={() => router.push(`/${locale}/app/jobs`)}
            >
              {t("new.backToJobs") || "返回任务列表"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 默认表单界面
  return (
    <Card className="glass border-white/5 shadow-2xl hover:shadow-primary/5 transition-all duration-700 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-black tracking-tighter bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
          {t("new.title")}
        </CardTitle>
        <CardDescription className="text-muted-foreground font-medium italic">
          {t("new.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8 p-8">
        <div className="grid gap-4">
          <Label htmlFor="title" className="text-sm font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
            {t("new.titleLabel")}
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Interview with ..."
            className="glass border-white/5 bg-white/5 focus-visible:ring-primary focus-visible:border-primary/50 transition-all duration-500 h-12 text-lg"
          />
        </div>
        <div className="grid gap-4">
          <Label htmlFor="file" className="text-sm font-bold tracking-widest uppercase text-muted-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60"></span>
            {t("new.uploadLabel")}
          </Label>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-transparent rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-1000"></div>
            <Input
              id="file"
              type="file"
              accept="audio/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="relative glass border-white/5 bg-white/5 file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:mr-4 file:px-4 file:h-full file:font-bold hover:file:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition-all duration-500 h-14 py-2 focus-visible:ring-primary"
            />
          </div>
        </div>
        <div className="rounded-2xl glass-dark border border-white/5 p-6 text-sm text-muted-foreground space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-xs uppercase tracking-widest">{t("new.plan")}</span>
            <strong className="text-primary font-bold neon-glow">{t(`plan.${plan.plan}`)}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-xs uppercase tracking-widest">{t("new.limit")}</span>
            <strong className="text-foreground font-bold">{plan.maxFileSizeMb}MB</strong>
          </div>
          <p className="mt-4 text-xs opacity-50 leading-relaxed border-t border-white/5 pt-4 text-center">
            Supabase Storage is project-level. We enforce Free/Pro limits.
          </p>
        </div>
        {error ? <p className="text-sm font-bold text-destructive animate-bounce text-center">{error}</p> : null}
        <Button
          onClick={submit}
          disabled={uploadState === "uploading"}
          className="h-14 w-full neon-button text-lg font-black tracking-widest uppercase transition-all duration-500 rounded-xl"
        >
          {uploadState === "uploading" ? (
            <span className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              {t("new.uploading")}
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <Upload className="h-6 w-6" />
              {t("new.submit")}
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
