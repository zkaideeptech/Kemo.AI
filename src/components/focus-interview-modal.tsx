"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Mic, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

type FocusArtifact = {
  kind: string;
  content: string | null;
  summary: string | null;
  status: string;
};

type SkillProgress = {
  kind: string;
  label: string;
  tone: "idle" | "draft" | "queued" | "running" | "ready";
  stage: number; // 0-3
};

export function FocusInterviewModal({
  open,
  onClose,
  theme = "dark",
  locale = "zh",
  projectTitle,
  jobTitle,
  isRecording = false,
  elapsedSeconds = 0,
  summaryArtifact,
  inspirationArtifact,
  skillProgresses = [],
}: {
  open: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
  locale?: string;
  projectTitle?: string;
  jobTitle?: string;
  isRecording?: boolean;
  elapsedSeconds?: number;
  summaryArtifact?: FocusArtifact | null;
  inspirationArtifact?: FocusArtifact | null;
  skillProgresses?: SkillProgress[];
}) {
  const isZh = locale !== "en";
  const isDark = theme === "dark";
  const [pulsePhase, setPulsePhase] = useState(0);

  // 收音脉冲动画
  useEffect(() => {
    if (!isRecording || !open) return;
    const timer = setInterval(() => {
      setPulsePhase((p) => (p + 1) % 360);
    }, 50);
    return () => clearInterval(timer);
  }, [isRecording, open]);

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
    return [m, sec].map((v) => String(v).padStart(2, "0")).join(":");
  }

  const stageToneColors: Record<string, string> = isDark
    ? { idle: "bg-white/10", draft: "bg-amber-500/60", queued: "bg-blue-400/50", running: "bg-[#48F9DB]", ready: "bg-emerald-400" }
    : { idle: "bg-[#dacfc3]", draft: "bg-amber-600/60", queued: "bg-blue-500/50", running: "bg-[#8a5a3c]", ready: "bg-emerald-500" };

  const cardBg = isDark
    ? "bg-[#1b1c1d]/95 border-white/10"
    : "bg-white/95 border-[#dacfc3]";
  const headingColor = isDark ? "text-white" : "text-[#1a1c1c]";
  const mutedColor = isDark ? "text-[#8fa39d]" : "text-[#6f6258]";
  const accentColor = isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]";

  // 音频柱状动画的高度
  const barHeights = Array.from({ length: 12 }, (_, i) =>
    isRecording ? 20 + 30 * Math.abs(Math.sin((pulsePhase + i * 30) * (Math.PI / 180))) : 8
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="fixed inset-0 flex items-center justify-center border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
        style={{ maxWidth: "100vw", maxHeight: "100vh", width: "100vw", height: "100vh" }}
      >
        <DialogTitle className="sr-only">{jobTitle || "Focus Interview"}</DialogTitle>
        {/* 虚化背景层 */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-xl"
          onClick={onClose}
        />

        {/* 聚焦卡片 */}
        <div className={`relative z-10 mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${cardBg}`}>
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            className={`absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${isDark ? "bg-white/8 text-white/60 hover:bg-white/14" : "bg-black/5 text-black/40 hover:bg-black/10"}`}
          >
            <X className="h-4 w-4" />
          </button>

          {/* 顶部：项目 + 标题 + 时长 */}
          <div className="px-8 pb-4 pt-8">
            {projectTitle && (
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${accentColor}`}>
                {projectTitle}
              </p>
            )}
            <h2 className={`mt-2 text-2xl font-extrabold tracking-[-0.03em] ${headingColor}`}>
              {jobTitle || (isZh ? "聚焦访谈" : "Focus Interview")}
            </h2>
            <div className={`mt-3 flex items-center gap-3 text-sm ${mutedColor}`}>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${isDark ? "border-[#48F9DB]/18 bg-[#00dcbf]/8 text-[#48F9DB]" : "border-[#d8c0ab] bg-[#fff1e1] text-[#8a5a3c]"}`}>
                {isRecording && <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${isDark ? "bg-[#48F9DB]" : "bg-[#8a5a3c]"}`} />}
                {isRecording ? (isZh ? "录制中" : "Recording") : (isZh ? "已停止" : "Stopped")}
              </span>
              <span className="font-mono font-bold tabular-nums">{formatTime(elapsedSeconds)}</span>
            </div>
          </div>

          {/* 收音动画 */}
          <div className="flex flex-col items-center px-8 py-6">
            {/* 脉冲环 */}
            <div className="relative mb-4 flex h-24 w-24 items-center justify-center">
              {isRecording && (
                <>
                  <div
                    className={`absolute inset-0 rounded-full border-2 ${isDark ? "border-[#48F9DB]/20" : "border-[#8a5a3c]/20"}`}
                    style={{ animation: "kemo-focus-pulse 2s ease-in-out infinite" }}
                  />
                  <div
                    className={`absolute inset-2 rounded-full border ${isDark ? "border-[#48F9DB]/30" : "border-[#8a5a3c]/30"}`}
                    style={{ animation: "kemo-focus-pulse 2s ease-in-out 0.3s infinite" }}
                  />
                  <div
                    className={`absolute inset-4 rounded-full border ${isDark ? "border-[#48F9DB]/40" : "border-[#8a5a3c]/40"}`}
                    style={{ animation: "kemo-focus-pulse 2s ease-in-out 0.6s infinite" }}
                  />
                </>
              )}
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#00dcbf]/15" : "bg-[#fff1e1]"}`}>
                <Mic className={`h-6 w-6 ${accentColor}`} />
              </div>
            </div>

            {/* 柱状音频波形 */}
            <div className="flex items-end justify-center gap-1" style={{ height: 52 }}>
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-100 ${isDark ? "bg-[#48F9DB]" : "bg-[#8a5a3c]"}`}
                  style={{ height: `${h}%`, opacity: isRecording ? 0.5 + 0.5 * (h / 50) : 0.2 }}
                />
              ))}
            </div>
          </div>

          {/* 摘要 + 灵感追问 */}
          <div className="space-y-3 px-8 pb-4">
            {/* 摘要 */}
            <div className={`rounded-2xl border p-5 ${isDark ? "border-white/6 bg-white/[0.02]" : "border-[#eadfce] bg-[#fffaf4]"}`}>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${accentColor}`} />
                <span className={`text-xs font-bold ${accentColor}`}>{isZh ? "摘要" : "Summary"}</span>
              </div>
              <p className={`text-sm leading-7 ${headingColor}`} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 4, overflow: "hidden" }}>
                {summaryArtifact?.summary || summaryArtifact?.content?.slice(0, 300) || (isZh ? "访谈进行中，摘要将在访谈结束后生成..." : "Summary will be generated after the interview...")}
              </p>
            </div>

            {/* 灵感追问 */}
            <div className={`rounded-2xl border p-5 ${isDark ? "border-white/6 bg-white/[0.02]" : "border-[#eadfce] bg-[#fffaf4]"}`}>
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb className={`h-4 w-4 ${accentColor}`} />
                <span className={`text-xs font-bold ${accentColor}`}>{isZh ? "灵感追问" : "Follow-ups"}</span>
              </div>
              <p className={`text-sm leading-7 ${headingColor}`} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 4, overflow: "hidden" }}>
                {inspirationArtifact?.summary || inspirationArtifact?.content?.slice(0, 300) || (isZh ? "灵感追问将在内容积累后自动生成..." : "Follow-up questions will be generated as content accumulates...")}
              </p>
            </div>
          </div>

          {/* 技能进程条 */}
          {skillProgresses.length > 0 && (
            <div className={`border-t px-8 py-5 ${isDark ? "border-white/8" : "border-[#dacfc3]"}`}>
              <p className={`mb-3 text-[10px] font-black uppercase tracking-[0.18em] ${mutedColor}`}>
                {isZh ? "技能进程" : "Skill Progress"}
              </p>
              <div className="space-y-2.5">
                {skillProgresses.map((sp) => (
                  <div key={sp.kind} className="flex items-center gap-3">
                    <span className={`w-16 truncate text-xs font-semibold ${headingColor}`}>{sp.label}</span>
                    <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${isDark ? "bg-white/8" : "bg-[#dacfc3]/40"}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${stageToneColors[sp.tone] || stageToneColors.idle}`}
                        style={{ width: `${(sp.stage / 3) * 100}%` }}
                      />
                    </div>
                    <span className={`w-12 text-right text-[10px] font-bold ${mutedColor}`}>{sp.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
