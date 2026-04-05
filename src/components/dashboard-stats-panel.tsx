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
  return `${h}h ${m}m`;
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

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  isDark,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note?: string;
  isDark: boolean;
}) {
  const panelClass = isDark
    ? "border-white/8 bg-white/[0.03]"
    : "border-[#dacfc3] bg-white/90";
  const labelClass = isDark ? "text-[#8fa39d]" : "text-[#6f6258]";
  const valueClass = isDark ? "text-[#e5e2e3]" : "text-[#1a1c1c]";
  const iconClass = isDark
    ? "border-[#48F9DB]/18 bg-[#00dcbf]/10 text-[#48F9DB]"
    : "border-[#d8c0ab] bg-[#fff1e1] text-[#8a5a3c]";

  return (
    <div className={`rounded-2xl border p-5 ${panelClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${labelClass}`}>{label}</p>
          <p className={`mt-3 text-3xl font-extrabold tracking-[-0.03em] ${valueClass}`}>{value}</p>
          {note && <p className={`mt-1 text-xs ${labelClass}`}>{note}</p>}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${iconClass}`}>
          <Icon className="h-4 w-4" />
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

  // 计算统计数据
  const totalDurationSeconds = useMemo(() => {
    return jobs.reduce((sum, job) => {
      if (job.started_at && job.ended_at) {
        return sum + Math.max(0, (new Date(job.ended_at).getTime() - new Date(job.started_at).getTime()) / 1000);
      }
      return sum;
    }, 0);
  }, [jobs]);

  // 嘉宾频次 Top
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

  // 行业分布（从项目标题+描述推理）
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

  // 最近纪要摘要
  const recentSummaries = useMemo(() => {
    return artifacts
      .filter((a) => ["quick_summary", "meeting_minutes"].includes(a.kind) && (a.summary || a.content))
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 5);
  }, [artifacts]);

  // 月度访谈趋势
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

  const shellBg = isDark ? "bg-[#0f1112]" : "bg-[#f8f2e8]";
  const panelClass = isDark ? "border-white/8 bg-[#1b1c1d]/80" : "border-[#dacfc3] bg-white/90";
  const headingClass = isDark ? "text-[#e5e2e3]" : "text-[#1a1c1c]";
  const mutedClass = isDark ? "text-[#8fa39d]" : "text-[#6f6258]";
  const eyebrowClass = `text-[10px] font-black uppercase tracking-[0.18em] ${mutedClass}`;
  const barBg = isDark ? "bg-white/8" : "bg-[#dacfc3]/40";
  const barFill = isDark ? "bg-[#48F9DB]" : "bg-[#8a5a3c]";
  const hoverRow = isDark ? "hover:bg-white/[0.03]" : "hover:bg-[#fff8f0]";

  return (
    <div className={`min-h-screen ${shellBg}`}>
      <div className="mx-auto max-w-5xl px-8 py-10 xl:px-12">
        {/* 标题 */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className={eyebrowClass}>{isZh ? "文件管理" : "File Manager"}</p>
            <h1 className={`mt-2 text-3xl font-extrabold tracking-[-0.04em] ${headingClass}`}>
              {isZh ? "数据仪表盘" : "Data Dashboard"}
            </h1>
            <p className={`mt-2 text-sm leading-7 ${mutedClass}`}>
              {isZh ? "访谈数据综述与多维度统计分析" : "Interview data overview and multi-dimensional analytics"}
            </p>
          </div>
          {onNewProject && (
            <button
              onClick={onNewProject}
              className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold tracking-[0.1em] uppercase transition-transform hover:scale-105 active:scale-95 ${isDark ? "bg-[#48F9DB] text-[#00382F]" : "bg-[#8a5a3c] text-white"}`}
            >
              <FolderPlus className="h-4 w-4" />
              {isZh ? "新建项目" : "New Project"}
            </button>
          )}
        </div>

        {/* 综述卡片行 */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Folder} label={isZh ? "项目" : "Projects"} value={projects.length} isDark={isDark} />
          <StatCard icon={AudioLines} label={isZh ? "访谈" : "Interviews"} value={jobs.length} isDark={isDark} />
          <StatCard
            icon={Clock}
            label={isZh ? "总时长" : "Total Duration"}
            value={formatDuration(Math.round(totalDurationSeconds))}
            isDark={isDark}
          />
          <StatCard icon={FileText} label={isZh ? "文档" : "Documents"} value={artifacts.length + sourceCount} isDark={isDark} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 月度趋势 */}
          <section className={`rounded-2xl border p-6 ${panelClass}`}>
            <div className="mb-5 flex items-center gap-2">
              <TrendingUp className={`h-4 w-4 ${isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`} />
              <h3 className={`text-sm font-bold ${headingClass}`}>
                {isZh ? "访谈趋势" : "Interview Trend"}
              </h3>
            </div>
            {monthlyTrend.length > 0 ? (
              <div className="flex items-end gap-2" style={{ height: 120 }}>
                {monthlyTrend.map(([month, count]) => (
                  <div key={month} className="flex flex-1 flex-col items-center gap-1">
                    <span className={`text-xs font-bold ${headingClass}`}>{count}</span>
                    <div className={`w-full rounded-t-lg ${barBg}`} style={{ height: 100 }}>
                      <div
                        className={`${barFill} w-full rounded-t-lg transition-all`}
                        style={{ height: `${(count / maxMonthly) * 100}%`, marginTop: `${100 - (count / maxMonthly) * 100}%` }}
                      />
                    </div>
                    <span className={`text-[10px] ${mutedClass}`}>{month.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${mutedClass}`}>{isZh ? "暂无数据" : "No data yet"}</p>
            )}
          </section>

          {/* 行业分布 */}
          <section className={`rounded-2xl border p-6 ${panelClass}`}>
            <div className="mb-5 flex items-center gap-2">
              <BarChart3 className={`h-4 w-4 ${isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`} />
              <h3 className={`text-sm font-bold ${headingClass}`}>
                {isZh ? "行业分布" : "Industry Distribution"}
              </h3>
            </div>
            {industryDistribution.length > 0 ? (
              <div className="space-y-3">
                {industryDistribution.map(([industry, count]) => {
                  const maxIndustry = Math.max(...industryDistribution.map(([, v]) => v), 1);
                  return (
                    <div key={industry} className="flex items-center gap-3">
                      <span className={`w-16 shrink-0 truncate text-xs font-semibold ${headingClass}`}>{industry}</span>
                      <div className={`h-2 flex-1 overflow-hidden rounded-full ${barBg}`}>
                        <div
                          className={`h-full rounded-full transition-all ${barFill}`}
                          style={{ width: `${(count / maxIndustry) * 100}%` }}
                        />
                      </div>
                      <span className={`w-6 text-right text-xs font-bold ${mutedClass}`}>{count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={`text-sm ${mutedClass}`}>{isZh ? "暂无数据" : "No data yet"}</p>
            )}
          </section>

          {/* 嘉宾访谈频次 Top */}
          <section className={`rounded-2xl border p-6 ${panelClass}`}>
            <div className="mb-5 flex items-center gap-2">
              <Users className={`h-4 w-4 ${isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`} />
              <h3 className={`text-sm font-bold ${headingClass}`}>
                {isZh ? "嘉宾访谈排名" : "Guest Ranking"}
              </h3>
            </div>
            {guestRanking.length > 0 ? (
              <div className="space-y-2">
                {guestRanking.map(([name, count], idx) => (
                  <div key={name} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${hoverRow}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isDark ? "bg-[#00dcbf]/12 text-[#48F9DB]" : "bg-[#fff1e1] text-[#8a5a3c]"}`}>
                      {idx + 1}
                    </span>
                    <span className={`flex-1 truncate text-sm font-semibold ${headingClass}`}>{name}</span>
                    <span className={`text-sm font-bold ${mutedClass}`}>{count}{isZh ? "次" : "x"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${mutedClass}`}>{isZh ? "暂无嘉宾数据" : "No guest data"}</p>
            )}
          </section>

          {/* 最近纪要摘要 */}
          <section className={`rounded-2xl border p-6 ${panelClass}`}>
            <div className="mb-5 flex items-center gap-2">
              <FileText className={`h-4 w-4 ${isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`} />
              <h3 className={`text-sm font-bold ${headingClass}`}>
                {isZh ? "最近纪要" : "Recent Summaries"}
              </h3>
            </div>
            {recentSummaries.length > 0 ? (
              <div className="space-y-3">
                {recentSummaries.map((artifact) => (
                  <div key={artifact.id} className={`rounded-xl border p-4 ${isDark ? "border-white/6 bg-white/[0.02]" : "border-[#eadfce] bg-[#fffaf4]"}`}>
                    <p className={`text-xs font-bold ${isDark ? "text-[#48F9DB]" : "text-[#8a5a3c]"}`}>
                      {artifact.kind === "quick_summary" ? (isZh ? "摘要" : "Summary") : (isZh ? "纪要" : "Minutes")}
                    </p>
                    <p className={`mt-1.5 text-sm leading-6 ${headingClass}`} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}>
                      {artifact.summary || (artifact.content || "").slice(0, 200)}
                    </p>
                    <p className={`mt-2 text-[10px] ${mutedClass}`}>
                      {new Date(artifact.updated_at || artifact.created_at).toLocaleDateString(isZh ? "zh-CN" : "en-US")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${mutedClass}`}>{isZh ? "暂无纪要数据" : "No summaries yet"}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
