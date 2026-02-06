/**
 * @file job-detail-tabs.tsx
 * @description 任务详情标签页组件
 *   - 转写查看
 *   - 术语确认（逐个确认/拒绝 → 拒绝后输入修正 → 全部完成后提交）
 *   - IC纪要和公众号长文（对话框内直接生成）
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, Loader2, CheckCircle2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type TermOccurrence = {
  id: string;
  term_text: string;
  confidence: number | null;
  context: string | null;
  status: string | null;
};

type TermAction = "pending" | "accepted" | "rejected_editing" | "rejected_confirmed";

export function JobDetailTabs({
  jobId,
  transcriptText,
  icQaText,
  wechatText,
  termOccurrences,
}: {
  jobId: string;
  transcriptText: string | null;
  icQaText: string | null;
  wechatText: string | null;
  termOccurrences: TermOccurrence[];
}) {
  const t = useTranslations();

  const pendingTerms = termOccurrences.filter((term) => term.status === "pending");
  const hasTerms = pendingTerms.length > 0;

  // 每个术语的独立状态
  const [termStates, setTermStates] = useState<
    Record<string, { action: TermAction; editText: string }>
  >(() => {
    const init: Record<string, { action: TermAction; editText: string }> = {};
    for (const term of pendingTerms) {
      init[term.id] = { action: "pending", editText: "" };
    }
    return init;
  });

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 对话框
  const [icDialogOpen, setIcDialogOpen] = useState(false);
  const [wechatDialogOpen, setWechatDialogOpen] = useState(false);
  const [copied, setCopied] = useState<"ic" | "wechat" | null>(null);

  /**
   * 计算所有术语是否已全部处理完
   */
  const allHandled = useMemo(() => {
    if (pendingTerms.length === 0) return false;
    return pendingTerms.every((term) => {
      const state = termStates[term.id];
      return state?.action === "accepted" || state?.action === "rejected_confirmed";
    });
  }, [pendingTerms, termStates]);

  /**
   * 确认单个术语
   */
  const acceptTerm = useCallback((id: string) => {
    setTermStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], action: "accepted" },
    }));
  }, []);

  /**
   * 拒绝单个术语 → 进入编辑模式
   */
  const rejectTerm = useCallback((id: string) => {
    setTermStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], action: "rejected_editing", editText: "" },
    }));
  }, []);

  /**
   * 更新拒绝后的修正文本
   */
  const updateEditText = useCallback((id: string, text: string) => {
    setTermStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], editText: text },
    }));
  }, []);

  /**
   * 确认拒绝后的修正
   */
  const confirmRejection = useCallback((id: string) => {
    setTermStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], action: "rejected_confirmed" },
    }));
  }, []);

  /**
   * 全部确认后提交到后台
   */
  const submitAll = async () => {
    setSubmitting(true);
    setError(null);

    const terms = pendingTerms.map((term) => {
      const state = termStates[term.id];
      if (state.action === "accepted") {
        return {
          id: term.id,
          termText: term.term_text,
          confirmedText: term.term_text,
          action: "accept" as const,
          context: term.context || "",
        };
      }
      // rejected_confirmed → 用用户输入的修正文本
      return {
        id: term.id,
        termText: term.term_text,
        confirmedText: state.editText || term.term_text,
        action: state.editText ? ("edit" as const) : ("reject" as const),
        context: term.context || "",
      };
    });

    const res = await fetch(`/api/jobs/${jobId}/confirm-terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json?.error?.message || "提交失败");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  /**
   * 复制内容到剪贴板
   */
  const copyToClipboard = async (text: string, type: "ic" | "wechat") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* 静默 */ }
  };

  const transcriptValue = transcriptText || t("job.noTranscript");
  const icMemoValue = icQaText || t("job.noMemo");
  const wechatValue = wechatText || t("job.noMemo");

  return (
    <>
      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">{t("job.transcript")}</TabsTrigger>
          <TabsTrigger value="terms">
            {t("job.termsReview")}
            {hasTerms && !submitted && (
              <Badge variant="secondary" className="ml-2">
                {pendingTerms.length}
              </Badge>
            )}
            {submitted && (
              <Badge className="ml-2 bg-green-600 text-white">已提交</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="output">{t("job.output") || "输出"}</TabsTrigger>
        </TabsList>

        {/* ── 转写 ── */}
        <TabsContent value="transcript">
          <Textarea value={transcriptValue} readOnly className="min-h-[300px]" />
        </TabsContent>

        {/* ── 术语确认 ── */}
        <TabsContent value="terms">
          {!hasTerms ? (
            <p className="text-sm text-muted">{t("job.noTerms")}</p>
          ) : submitted ? (
            /* 已提交状态 */
            <div className="flex flex-col items-center gap-3 py-12">
              <CheckCircle2 className="h-14 w-14 text-green-600" />
              <h3 className="text-lg font-semibold text-green-700">
                术语已全部提交
              </h3>
              <p className="text-sm text-muted">
                后台正在生成 IC 纪要和公众号长文...
              </p>
            </div>
          ) : (
            /* 逐个确认界面 */
            <div className="grid gap-3">
              {pendingTerms.map((term) => {
                const state = termStates[term.id];
                const action = state?.action || "pending";

                return (
                  <div
                    key={term.id}
                    className={`rounded-lg border p-4 transition-all ${
                      action === "accepted"
                        ? "border-green-300 bg-green-50/60"
                        : action === "rejected_confirmed"
                          ? "border-blue-300 bg-blue-50/60"
                          : "border-border bg-card"
                    }`}
                  >
                    {/* 行 1：术语 + 操作按钮 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{term.term_text}</span>
                        {term.confidence !== null && (
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(term.confidence * 100)}%
                          </Badge>
                        )}
                        {term.context && (
                          <span className="text-xs text-muted">
                            "{term.context.slice(0, 30)}..."
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 已确认状态 */}
                        {action === "accepted" && (
                          <Badge className="bg-green-600 text-white flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            已确认
                          </Badge>
                        )}

                        {/* 拒绝修正已确认状态 */}
                        {action === "rejected_confirmed" && (
                          <Badge className="bg-blue-600 text-white flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            已修正
                          </Badge>
                        )}

                        {/* 待操作状态：显示确认+拒绝按钮 */}
                        {action === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => acceptTerm(term.id)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              确认
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => rejectTerm(term.id)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              拒绝
                            </Button>
                          </>
                        )}

                        {/* 编辑中状态：不显示按钮，下方有输入框 */}
                      </div>
                    </div>

                    {/* 行 2：拒绝后的修正输入框 */}
                    {action === "rejected_editing" && (
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          value={state?.editText || ""}
                          onChange={(e) => updateEditText(term.id, e.target.value)}
                          placeholder="请输入正确的术语..."
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => confirmRejection(term.id)}
                          disabled={!state?.editText?.trim()}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          确认
                        </Button>
                      </div>
                    )}

                    {/* 拒绝修正后显示修正结果 */}
                    {action === "rejected_confirmed" && state?.editText && (
                      <p className="mt-2 text-sm text-blue-700">
                        修正为：<strong>{state.editText}</strong>
                      </p>
                    )}
                  </div>
                );
              })}

              {/* 全部处理完后显示提交按钮 */}
              {error && <p className="text-sm text-destructive">{error}</p>}

              {allHandled && (
                <div className="mt-2 flex items-center justify-between rounded-lg border-2 border-green-400 bg-green-50 p-4">
                  <span className="text-sm font-medium text-green-800">
                    所有术语已确认完毕
                  </span>
                  <Button
                    onClick={submitAll}
                    disabled={submitting}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        提交中...
                      </span>
                    ) : (
                      "提交全部"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── 输出 ── */}
        <TabsContent value="output">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-2 text-base font-semibold">{t("job.icMemo")}</h3>
              <p className="mb-4 text-sm text-muted">
                {icQaText ? t("job.memoReady") || "纪要已生成" : t("job.noMemo")}
              </p>
              <Button onClick={() => setIcDialogOpen(true)} disabled={!icQaText} className="w-full">
                {t("job.viewIcMemo") || "查看 IC 纪要"}
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-2 text-base font-semibold">{t("job.wechat")}</h3>
              <p className="mb-4 text-sm text-muted">
                {wechatText ? t("job.memoReady") || "长文已生成" : t("job.noMemo")}
              </p>
              <Button onClick={() => setWechatDialogOpen(true)} disabled={!wechatText} className="w-full">
                {t("job.viewWechat") || "查看公众号长文"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* IC 纪要对话框 */}
      <Dialog open={icDialogOpen} onOpenChange={setIcDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("job.icMemo")}</DialogTitle>
            <DialogDescription>{t("job.icDialogDesc") || "由 AI 生成的 IC Q&A 纪要"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-accent/30 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">{icMemoValue}</pre>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => copyToClipboard(icQaText || "", "ic")}>
              {copied === "ic" ? "已复制" : "复制"}
            </Button>
            <Button onClick={() => setIcDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 公众号长文对话框 */}
      <Dialog open={wechatDialogOpen} onOpenChange={setWechatDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("job.wechat")}</DialogTitle>
            <DialogDescription>{t("job.wechatDialogDesc") || "由 AI 生成的公众号长文"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-accent/30 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">{wechatValue}</pre>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => copyToClipboard(wechatText || "", "wechat")}>
              {copied === "wechat" ? "已复制" : "复制"}
            </Button>
            <Button onClick={() => setWechatDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
