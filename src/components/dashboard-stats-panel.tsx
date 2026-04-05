"use client";

import { useMemo } from "react";
import {
  AudioLines,
  BarChart3,
  Clock,
  FileText,
  Folder,
  FolderPlus,
  TrendingUp,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type JobRow = {
  id: string;
  title: string | null;
  guest_name: string | null;
  status: string;
  capture_mode: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  project_id: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

type ArtifactRow = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  content: string | null;
  status: string;
  job_id: string | null;
  created_at: string;
  updated_at: string;
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function inferIndustry(title: string | null, description: string | null): string {
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  const industries: [string[], string][] = [
    [["医疗", "医药", "健康", "医院", "pharma", "health", "medical"], "医疗健康"],
    [["金融", "投资", "银行", "基金", "finance", "invest", "bank"], "金融投资"],
    [["科技", "技术", "ai", "人工智能", "tech", "software"], "科技"],
    [["教育", "培训", "学校", "education", "training"], "教育"],
    [["消费", "零售", "品牌", "consumer", "retail"], "消费品"],
    [["地产", "房产", "建筑", "real estate", "property"], "房地产"],
    [["制造", "工业", "manufacture", "industrial"], "制造业"],
    [["能源", "电力", "新能源", "energy", "power"], "能源"],
    [["传媒", "娱乐", "文化", "media", "entertainment"], "传媒文化"],
    [["汽车", "出行", "auto", "vehicle", "mobility"], "汽车出行"],
  ];
  for (const [keywords, label] of industries) {
    if (keywords.some((k) => text.includes(k))) return label;
  }
  return "其他";
}

// ── Accent color palette for charts ──
const CHART_COLORS_DARK = [
  "rgba(72,249,219,0.85)",
  "rgba(0,220,191,0.65)",
  "rgba(120,255,230,0.50)",
  "rgba(72,249,219,0.38)",
  "rgba(0,180,158,0.45)",
  "rgba(72,249,219,0.25)",
];
const CHART_COLORS_LIGHT = [
  "rgba(138,90,60,0.82)",
  "rgba(180,120,75,0.65)",
  "rgba(207,169,138,0.55)",
  "rgba(138,90,60,0.40)",
  "rgba(160,100,65,0.50)",
  "rgba(138,90,60,0.28)",
];
const INDUSTRY_COLORS_DARK = [
  "#48F9DB", "#38D9BD", "#28C5AC", "#1AB39E", "#0EA390", "#089480",
];
const INDUSTRY_COLORS_LIGHT = [
  "#8a5a3c", "#a16e50", "#b88464", "#cf9a78", "#d8b08c", "#e3c6a2",
];

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  isDark,
  accentGlow,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  isDark: boolean;
  accentGlow?: boolean;
}) {
  const panelClass = isDark
    ? "border-white/[0.06] bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] backdrop-blur-xl"
    : "border-[#e8ddd0]/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(255,249,240,0.92))] shadow-[0_8px_32px_rgba(138,90,60,0.06)]";
  const labelClass = isDark ? "text-[#7fa29b]" : "text-[#8a7a6e]";
  const valueClass = isDark ? "text-white" : "text-[#1a1c1c]";
  const iconBgClass = isDark
    ? "border-[#48F9DB]/16 bg-[radial-gradient(circle,rgba(0,220,191,0.14),rgba(0,220,191,0.04))] text-[#48F9DB]"
    : "border-[#d4b89c]/50 bg-[radial-gradient(circle,rgba(138,90,60,0.10),rgba(138,90,60,0.03))] text-[#8a5a3c]";

  return (
    <div
      className={`group relative overflow-hidden rounded-[1.4rem] border p-6 transition-all duration-300 hover:scale-[1.02] ${panelClass}`}
      style={accentGlow && isDark ? { boxShadow: "0 0 40px rgba(72,249,219,0.06)" } : undefined}
    >
      {/* Subtle shimmer line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
        style={{
          background: isDark
            ? "linear-gradient(90deg,transparent,rgba(72,249,219,0.2) 50%,transparent)"
            : "linear-gradient(90deg,transparent,rgba(138,90,60,0.12) 50%,transparent)",
        }}
      />
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${labelClass}`}>{label}</p>
          <p className={`mt-3 text-[2.2rem] font-extrabold tracking-[-0.04em] leading-none ${valueClass}`}>{value}</p>
          {subtitle && <p className={`mt-2 text-[11px] font-medium ${labelClass}`}>{subtitle}</p>}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] border ${iconBgClass}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

export function DashboardStatsPanel({
  locale,
  theme = "dark",
  projects,
  jobs,
  artifacts,
  sourceCount = 0,
  onNewProject,
}: {
  locale: string;
  theme?: "light" | "dark";
  projects: ProjectRow[];
  jobs: JobRow[];
  artifacts: ArtifactRow[];
  sourceCount?: number;
  onNewProject?: () => void;
}) {
  const isZh = locale !== "en";
  const isDark = theme === "dark";

  const totalDurationSeconds = useMemo(() => {
    return jobs.reduce((sum, job) => {
      if (job.started_at && job.ended_at) {
        return sum + Math.max(0, (new Date(job.ended_at).getTime() - new Date(job.started_at).getTime()) / 1000);
      }
      return sum;
    }, 0);
  }, [jobs]);

  const guestRanking = useMemo(() => {
    const counts = new Map<string, number>();
    jobs.forEach((job) => {
      const name = job.guest_name?.trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [jobs]);

  const industryDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((p) => {
      const industry = inferIndustry(p.title, p.description);
      counts.set(industry, (counts.get(industry) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [projects]);

  const recentSummaries = useMemo(() => {
    return artifacts
      .filter((a) => ["quick_summary", "meeting_minutes"].includes(a.kind) && (a.summary || a.content))
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 5);
  }, [artifacts]);

  const monthlyTrend = useMemo(() => {
    const months = new Map<string, number>();
    jobs.forEach((job) => {
      const d = new Date(job.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, (months.get(key) || 0) + 1);
    });
    return Array.from(months.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6);
  }, [jobs]);

  const maxMonthly = Math.max(...monthlyTrend.map(([, v]) => v), 1);

  // ── Theme tokens ──
  const shellBg = isDark
    ? "bg-[radial-gradient(ellipse_at_top,rgba(0,220,191,0.04),transparent_50%),linear-gradient(180deg,#0c0d0e,#0f1112)]"
    : "bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.8),transparent_40%),linear-gradient(180deg,#faf5ee,#f4ede3)]";
  const sectionClass = isDark
    ? "rounded-[1.6rem] border border-white/[0.06] bg-[linear-gradient(160deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] shadow-[0_24px_72px_rgba(0,0,0,0.16)] backdrop-blur-xl"
    : "rounded-[1.6rem] border border-[#e4d8cb]/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,250,244,0.92))] shadow-[0_20px_64px_rgba(138,90,60,0.06)]";
  const headingClass = isDark ? "text-[#e5e2e3]" : "text-[#1a1c1c]";
  const mutedClass = isDark ? "text-[#7fa29b]" : "text-[#8a7a6e]";
  const eyebrowClass = `text-[10px] font-black uppercase tracking-[0.22em] ${mutedClass}`;
  const accentClass = isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]";
  const chartColors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const industryColors = isDark ? INDUSTRY_COLORS_DARK : INDUSTRY_COLORS_LIGHT;
  const barTrackClass = isDark
    ? "bg-white/[0.05]"
    : "bg-[#dacfc3]/30";
  const hoverRow = isDark ? "hover:bg-white/[0.03]" : "hover:bg-[#fff8f0]";
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const avgDuration = jobs.length > 0 ? Math.round(totalDurationSeconds / jobs.length) : 0;

  // Month label helper 
  const monthLabel = (key: string) => {
    const [, mm] = key.split("-");
    if (!isZh) {
      const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return names[parseInt(mm, 10) - 1] || mm;
    }
    return `${parseInt(mm, 10)}月`;
  };

  return (
    <div className={`min-h-screen ${shellBg}`}>
      <div className="mx-auto max-w-[1200px] px-8 py-12 xl:px-14">
        {/* ── Header ── */}
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className={`h-4 w-4 ${accentClass}`} />
              <p className={eyebrowClass}>{isZh ? "数据总览" : "Analytics"}</p>
            </div>
            <h1 className={`mt-3 text-[2.4rem] font-extrabold tracking-[-0.05em] leading-tight ${headingClass}`}>
              {isZh ? "数据仪表盘" : "Data Dashboard"}
            </h1>
            <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>
              {isZh ? "访谈数据综述与多维度统计分析" : "Interview data overview and multi-dimensional analytics"}
            </p>
          </div>
          {onNewProject && (
            <button
              onClick={onNewProject}
              className={`flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-sm font-bold tracking-[0.08em] uppercase transition-all duration-200 hover:scale-[1.04] hover:shadow-lg active:scale-95 ${isDark ? "bg-[linear-gradient(135deg,#48F9DB,#00dcbf)] text-[#00382F] shadow-[0_8px_32px_rgba(72,249,219,0.2)]" : "bg-[linear-gradient(135deg,#8a5a3c,#6f4530)] text-white shadow-[0_8px_28px_rgba(138,90,60,0.2)]"}`}
            >
              <FolderPlus className="h-4 w-4" />
              {isZh ? "新建项目" : "New Project"}
            </button>
          )}
        </div>

        {/* ── Stat Cards ── */}
        <div className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Folder}
            label={isZh ? "项目" : "Projects"}
            value={projects.length}
            subtitle={isZh ? `${completedCount} 个已完成` : `${completedCount} completed`}
            isDark={isDark}
            accentGlow
          />
          <StatCard
            icon={AudioLines}
            label={isZh ? "访谈" : "Interviews"}
            value={jobs.length}
            subtitle={isZh ? `本月 ${monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1][1] : 0} 场` : `${monthlyTrend.length > 0 ? monthlyTrend[monthlyTrend.length - 1][1] : 0} this month`}
            isDark={isDark}
          />
          <StatCard
            icon={Clock}
            label={isZh ? "总时长" : "Total Duration"}
            value={formatDuration(Math.round(totalDurationSeconds))}
            subtitle={isZh ? `平均 ${formatDuration(avgDuration)}/场` : `Avg ${formatDuration(avgDuration)}/session`}
            isDark={isDark}
          />
          <StatCard
            icon={FileText}
            label={isZh ? "文档" : "Documents"}
            value={artifacts.length + sourceCount}
            subtitle={isZh ? `${sourceCount} 个来源文件` : `${sourceCount} source files`}
            isDark={isDark}
          />
        </div>

        {/* ── Chart Grid ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* ── Monthly Trend Bar Chart ── */}
          <section className={`${sectionClass} p-7`}>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className={`h-[18px] w-[18px] ${accentClass}`} />
                <h3 className={`text-[15px] font-bold tracking-[-0.02em] ${headingClass}`}>
                  {isZh ? "访谈趋势" : "Interview Trend"}
                </h3>
              </div>
              {monthlyTrend.length > 0 && (
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${mutedClass}`}>
                  {isZh ? `近 ${monthlyTrend.length} 个月` : `Last ${monthlyTrend.length} mo`}
                </span>
              )}
            </div>
            {monthlyTrend.length > 0 ? (
              <div className="relative">
                {/* Grid lines */}
                <div className="absolute inset-0" style={{ height: 160 }}>
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                    <div
                      key={pct}
                      className="absolute inset-x-0 border-t"
                      style={{
                        top: `${(1 - pct) * 100}%`,
                        borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(138,90,60,0.06)",
                      }}
                    />
                  ))}
                </div>
                <div className="relative flex items-end gap-3" style={{ height: 160 }}>
                  {monthlyTrend.map(([month, count], idx) => {
                    const heightPct = Math.max(8, (count / maxMonthly) * 100);
                    return (
                      <div key={month} className="group/bar relative flex flex-1 flex-col items-center gap-2">
                        {/* Value label */}
                        <span
                          className={`text-xs font-extrabold tabular-nums transition-all duration-200 group-hover/bar:scale-110 ${headingClass}`}
                          style={{ opacity: 0.9 }}
                        >
                          {count}
                        </span>
                        {/* Bar */}
                        <div
                          className="w-full overflow-hidden rounded-xl transition-all duration-500 ease-out"
                          style={{
                            height: `${heightPct}%`,
                            minHeight: 12,
                            background: isDark
                              ? `linear-gradient(180deg, ${chartColors[idx % chartColors.length]}, rgba(0,220,191,0.12))`
                              : `linear-gradient(180deg, ${chartColors[idx % chartColors.length]}, rgba(138,90,60,0.08))`,
                            boxShadow: isDark
                              ? `0 4px 20px ${chartColors[idx % chartColors.length].replace("0.85", "0.2").replace("0.65", "0.15").replace("0.50", "0.1")}`
                              : "0 4px 16px rgba(138,90,60,0.08)",
                          }}
                        />
                        {/* Month label */}
                        <span className={`text-[11px] font-semibold ${mutedClass}`}>
                          {monthLabel(month)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`flex h-[160px] items-center justify-center text-sm ${mutedClass}`}>
                <div className="flex flex-col items-center gap-2">
                  <TrendingUp className="h-8 w-8 opacity-20" />
                  <span>{isZh ? "暂无趋势数据" : "No trend data yet"}</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Industry Distribution ── */}
          <section className={`${sectionClass} p-7`}>
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarChart3 className={`h-[18px] w-[18px] ${accentClass}`} />
                <h3 className={`text-[15px] font-bold tracking-[-0.02em] ${headingClass}`}>
                  {isZh ? "行业分布" : "Industry Distribution"}
                </h3>
              </div>
              {industryDistribution.length > 0 && (
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${mutedClass}`}>
                  {isZh ? `${industryDistribution.length} 个行业` : `${industryDistribution.length} industries`}
                </span>
              )}
            </div>
            {industryDistribution.length > 0 ? (
              <div className="space-y-4">
                {industryDistribution.map(([industry, count], idx) => {
                  const maxIndustry = Math.max(...industryDistribution.map(([, v]) => v), 1);
                  const widthPct = Math.max(6, (count / maxIndustry) * 100);
                  const color = industryColors[idx % industryColors.length];
                  return (
                    <div key={industry} className="group/industry flex items-center gap-4">
                      <span className={`w-[4.5rem] shrink-0 truncate text-[13px] font-semibold ${headingClass}`}>
                        {industry}
                      </span>
                      <div className={`h-[10px] flex-1 overflow-hidden rounded-full ${barTrackClass}`}>
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out group-hover/industry:brightness-110"
                          style={{
                            width: `${widthPct}%`,
                            background: isDark
                              ? `linear-gradient(90deg, ${color}, ${color}88)`
                              : `linear-gradient(90deg, ${color}, ${color}aa)`,
                            boxShadow: isDark
                              ? `0 0 12px ${color}33`
                              : `0 0 8px ${color}22`,
                          }}
                        />
                      </div>
                      <span className={`w-7 text-right text-[13px] font-extrabold tabular-nums ${accentClass}`}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`flex h-[140px] items-center justify-center text-sm ${mutedClass}`}>
                <div className="flex flex-col items-center gap-2">
                  <BarChart3 className="h-8 w-8 opacity-20" />
                  <span>{isZh ? "暂无行业数据" : "No industry data"}</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Guest Ranking ── */}
          <section className={`${sectionClass} p-7`}>
            <div className="mb-6 flex items-center gap-2.5">
              <Users className={`h-[18px] w-[18px] ${accentClass}`} />
              <h3 className={`text-[15px] font-bold tracking-[-0.02em] ${headingClass}`}>
                {isZh ? "嘉宾访谈排名" : "Guest Ranking"}
              </h3>
            </div>
            {guestRanking.length > 0 ? (
              <div className="space-y-1.5">
                {guestRanking.map(([name, count], idx) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const medal = idx < 3 ? medals[idx] : null;
                  return (
                    <div
                      key={name}
                      className={`flex items-center gap-3.5 rounded-[1rem] px-4 py-3 transition-all duration-200 ${hoverRow}`}
                    >
                      {medal ? (
                        <span className="flex h-8 w-8 items-center justify-center text-lg">{medal}</span>
                      ) : (
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black ${isDark ? "bg-white/[0.05] text-[#7fa29b]" : "bg-[#f5ede4] text-[#8a7a6e]"}`}
                        >
                          {idx + 1}
                        </span>
                      )}
                      <span className={`flex-1 truncate text-[14px] font-semibold ${headingClass}`}>{name}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-black tabular-nums ${isDark ? "bg-[#00dcbf]/10 text-[#48F9DB]" : "bg-[#fff1e1] text-[#8a5a3c]"}`}
                      >
                        {count}{isZh ? " 次" : "x"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`flex h-[140px] items-center justify-center text-sm ${mutedClass}`}>
                <div className="flex flex-col items-center gap-2">
                  <Users className="h-8 w-8 opacity-20" />
                  <span>{isZh ? "暂无嘉宾数据" : "No guest data"}</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Recent Summaries ── */}
          <section className={`${sectionClass} p-7`}>
            <div className="mb-6 flex items-center gap-2.5">
              <FileText className={`h-[18px] w-[18px] ${accentClass}`} />
              <h3 className={`text-[15px] font-bold tracking-[-0.02em] ${headingClass}`}>
                {isZh ? "最近纪要" : "Recent Summaries"}
              </h3>
            </div>
            {recentSummaries.length > 0 ? (
              <div className="space-y-3">
                {recentSummaries.map((artifact) => {
                  const isQuickSummary = artifact.kind === "quick_summary";
                  return (
                    <div
                      key={artifact.id}
                      className={`group/memo rounded-[1.1rem] border p-4.5 transition-all duration-200 hover:scale-[1.01] ${isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]" : "border-[#efe4d8]/80 bg-[linear-gradient(135deg,#fffcf8,#fff8f0)] hover:shadow-sm"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${isDark ? "bg-[#00dcbf]/10 text-[#48F9DB]" : "bg-[#fff1e1] text-[#8a5a3c]"}`}
                        >
                          {isQuickSummary ? (isZh ? "摘要" : "Summary") : (isZh ? "纪要" : "Minutes")}
                        </span>
                        <span className={`ml-auto text-[10px] font-medium tabular-nums ${mutedClass}`}>
                          {new Date(artifact.updated_at || artifact.created_at).toLocaleDateString(isZh ? "zh-CN" : "en-US")}
                        </span>
                      </div>
                      <p
                        className={`mt-2.5 text-[13px] leading-[1.7] ${isDark ? "text-[#c2ccca]" : "text-[#4e463e]"}`}
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                          overflow: "hidden",
                        }}
                      >
                        {artifact.summary || (artifact.content || "").slice(0, 200)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`flex h-[140px] items-center justify-center text-sm ${mutedClass}`}>
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 opacity-20" />
                  <span>{isZh ? "暂无纪要数据" : "No summaries yet"}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
