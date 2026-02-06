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
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <CheckCircle2 className="h-16 w-16 text-green-600" />
          <h2 className="text-xl font-semibold">
            {t("new.uploadSuccess") || "上传成功"}
          </h2>
          <p className="text-sm text-muted">
            {t("new.autoRedirect") || "正在自动跳转到任务详情..."}
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
          <Button
            variant="secondary"
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
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <XCircle className="h-16 w-16 text-destructive" />
          <h2 className="text-xl font-semibold">
            {t("new.uploadFailed") || "上传失败"}
          </h2>
          <p className="text-sm text-destructive">{error}</p>
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setUploadState("idle");
                setError(null);
              }}
            >
              {t("new.retry") || "重试"}
            </Button>
            <Button
              variant="secondary"
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
    <Card>
      <CardHeader>
        <CardTitle>{t("new.title")}</CardTitle>
        <CardDescription>{t("new.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="title">{t("new.titleLabel")}</Label>
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Interview with ..."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="file">{t("new.uploadLabel")}</Label>
          <Input
            id="file"
            type="file"
            accept="audio/*"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </div>
        <div className="rounded-md border border-border bg-accent/60 p-3 text-sm text-muted">
          <p>
            {t("new.plan")}: <strong>{t(`plan.${plan.plan}`)}</strong>
          </p>
          <p>
            {t("new.limit")}: <strong>{plan.maxFileSizeMb}MB</strong>
          </p>
          <p className="text-xs text-muted">{t("new.limitNote")}</p>
          <p className="text-xs text-muted">
            Supabase Storage is project-level. We enforce Free/Pro limits in the app.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={submit} disabled={uploadState === "uploading"}>
          {uploadState === "uploading" ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("new.uploading")}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {t("new.submit")}
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
