"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { KemoMark } from "@/components/kemo-mark";
import { WorkspaceThemeSwitcher } from "@/components/workspace-theme-switcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface SettingsClientViewProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string;
  };
  plan: {
    plan: string;
    maxFileSizeMb: number;
  };
  stats: {
    jobCount: number;
    minutesUsed: number;
    filesUsed: number;
    monthlyJobLimit: number | null;
    periodEnd: string | null;
  };
  locale: string;
}

const SETTINGS_COPY = {
  en: {
    brandSubtitle: "Research Workbench",
    newProject: "New Project",
    theme: "Theme",
    navProjects: "Projects",
    navJobs: "Jobs",
    navSources: "Sources",
    navSettings: "Settings",
    navHelp: "Help",
    navFeedback: "Feedback",
    search: "Search workspace...",
    transcripts: "Transcripts",
    overview: "Overview",
    sources: "Sources",
    title: "Settings",
    profile: "Profile",
    fullName: "Full Name",
    email: "Email Address",
    appearance: "Appearance",
    themeTitle: "Interface Theme",
    themeHint: "Select your preferred working environment.",
    light: "Light",
    dark: "Dark",
    system: "System",
    usagePlan: "Usage & Plan",
    currentPlan: "Current Plan",
    freePlan: "Free Plan",
    proPlan: "Pro Plan",
    transcriptsAnalyzed: "Transcripts Analyzed",
    unlimited: "Unlimited",
    resetsIn: (days: number) => `Resets in ${days} ${days === 1 ? "day" : "days"}. Need more capacity for deep research?`,
    noReset: "Current usage period is not available yet.",
    freeBenefits: (limit: number, fileLimit: number) => [
      `${limit} transcripts per billing period`,
      `${fileLimit}MB single-file upload limit`,
      "Standard transcript and artifact generation",
    ],
    proBenefits: (fileLimit: number) => [
      "Expanded transcript capacity",
      `${fileLimit}MB single-file upload limit`,
      "Priority processing queue",
    ],
    cta: "Apply for Pro+",
    saving: "Saving...",
    save: "Save Changes",
    uploadFailed: "Avatar upload failed",
    updateFailed: "Update failed",
    record: "Record",
    input: "Input",
    avatarAlt: "Account avatar",
  },
  zh: {
    brandSubtitle: "研究工作台",
    newProject: "新建项目",
    theme: "主题",
    navProjects: "项目",
    navJobs: "任务",
    navSources: "资料来源",
    navSettings: "设置",
    navHelp: "帮助",
    navFeedback: "反馈",
    search: "搜索工作台...",
    transcripts: "转写记录",
    overview: "总览",
    sources: "资料来源",
    title: "设置",
    profile: "个人资料",
    fullName: "姓名",
    email: "邮箱地址",
    appearance: "外观",
    themeTitle: "界面主题",
    themeHint: "选择你偏好的工作环境。",
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
    usagePlan: "用量与套餐",
    currentPlan: "当前套餐",
    freePlan: "免费套餐",
    proPlan: "专业套餐",
    transcriptsAnalyzed: "已处理转写",
    unlimited: "不限量",
    resetsIn: (days: number) => `距离额度重置还有 ${days} 天。需要更高研究容量可申请 Pro+。`,
    noReset: "当前用量周期暂未生成。",
    freeBenefits: (limit: number, fileLimit: number) => [
      `每个计费周期 ${limit} 次转写`,
      `单文件上传上限 ${fileLimit}MB`,
      "标准转写与成果生成",
    ],
    proBenefits: (fileLimit: number) => [
      "更高转写容量",
      `单文件上传上限 ${fileLimit}MB`,
      "优先处理队列",
    ],
    cta: "尽快申请到 Pro+",
    saving: "保存中...",
    save: "保存更改",
    uploadFailed: "头像上传失败",
    updateFailed: "更新失败",
    record: "录音",
    input: "输入",
    avatarAlt: "账户头像",
  },
} as const;

function LocaleSegmentedControl({ locale }: { locale: string }) {
  const nextPath = (nextLocale: string) => `/${nextLocale}/app/settings`;

  return (
    <div className="kw-language-segment" aria-label="Language">
      <Link className={locale === "zh" ? "active" : ""} href={nextPath("zh")} aria-current={locale === "zh" ? "true" : undefined}>
        中文
      </Link>
      <Link className={locale === "en" ? "active" : ""} href={nextPath("en")} aria-current={locale === "en" ? "true" : undefined}>
        English
      </Link>
    </div>
  );
}

function getCopy(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? SETTINGS_COPY.zh : SETTINGS_COPY.en;
}

function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return "K";
  const [first = "", second = ""] = source.replace(/@.*/, "").split(/[\s._-]+/);
  return `${first[0] || "K"}${second[0] || ""}`.toUpperCase();
}

function getDaysUntil(value: string | null) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export function SettingsClientView({ user, plan, stats, locale }: SettingsClientViewProps) {
  const copy = getCopy(locale);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [fullName, setFullName] = useState(user.fullName || user.email.split("@")[0] || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const transcriptCount = stats.filesUsed || stats.jobCount;
  const hasLimitedJobs = stats.monthlyJobLimit !== null;
  const monthlyLimit = stats.monthlyJobLimit ?? Math.max(transcriptCount, 1);
  const usagePercent = hasLimitedJobs ? Math.min(100, Math.round((transcriptCount / monthlyLimit) * 100)) : 100;
  const monthlyLimitLabel = hasLimitedJobs ? String(monthlyLimit) : copy.unlimited;
  const resetDays = getDaysUntil(stats.periodEnd);
  const planLabel = plan.plan === "free" ? copy.freePlan : copy.proPlan;
  const benefits = plan.plan === "free" ? copy.freeBenefits(monthlyLimit, plan.maxFileSizeMb) : copy.proBenefits(plan.maxFileSizeMb);
  const initials = getInitials(fullName, user.email);

  const handleUpdateProfile = async () => {
    try {
      setIsSavingProfile(true);
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl },
      });
      if (error) throw error;
      router.refresh();
    } catch (error) {
      alert(`${copy.updateFailed}: ${(error as Error).message}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    } catch (error) {
      alert(`${copy.uploadFailed}: ${(error as Error).message}`);
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleCheckout = async () => {
    try {
      setIsStartingCheckout(true);
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok || !json.data?.url) {
        throw new Error(json?.error?.message || "Checkout is not available");
      }
      window.location.href = json.data.url;
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setIsStartingCheckout(false);
    }
  };

  return (
    <div className="kemo-reference-settings antialiased min-h-screen flex selection:bg-surface-container-high bg-background text-on-background">
      <nav className="kw-designer-nav">
        <Link className="kw-designer-brand" href={`/${locale}/app/jobs`}>
          <span className="kw-designer-avatar"><KemoMark /></span>
          <span><strong>Kemo.AI</strong><small>{copy.brandSubtitle}</small></span>
        </Link>
        <button className="kw-designer-new" type="button" onClick={() => router.push(`/${locale}/app/jobs?new=1`)}>
          <span className="material-symbols-outlined">add</span>
          {copy.newProject}
        </button>
        <div className="kw-sidebar-control-row">
          <span>{copy.theme}</span>
          <WorkspaceThemeSwitcher />
        </div>
        <LocaleSegmentedControl locale={locale} />
        <div className="kw-designer-nav-list">
          <Link className="kw-designer-nav-item" href={`/${locale}/app/jobs`}>
            <span className="material-symbols-outlined">folder_open</span>
            {copy.navProjects}
          </Link>
          <Link className="kw-designer-nav-item" href={`/${locale}/app/jobs`}>
            <span className="material-symbols-outlined">work_outline</span>
            {copy.navJobs}
          </Link>
          <Link className="kw-designer-nav-item" href={`/${locale}/app/jobs`}>
            <span className="material-symbols-outlined">database</span>
            {copy.navSources}
          </Link>
          <Link className="kw-designer-nav-item active" href={`/${locale}/app/settings`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>settings</span>
            {copy.navSettings}
          </Link>
        </div>
        <div className="kw-designer-footer-nav">
          <Link className="kw-designer-nav-item" href={`/${locale}/app/jobs`}>
            <span className="material-symbols-outlined">help_outline</span>
            {copy.navHelp}
          </Link>
          <Link className="kw-designer-nav-item" href={`/${locale}/app/jobs`}>
            <span className="material-symbols-outlined">chat_bubble_outline</span>
            {copy.navFeedback}
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col min-h-screen md:ml-[280px]">
        <header className="sticky top-0 w-full z-30 flex justify-between items-center px-gutter h-16 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
          <div className="flex items-center gap-unit text-on-surface-variant">
            <span className="material-symbols-outlined text-lg">search</span>
            <input className="bg-transparent border-none focus:ring-0 font-body-md text-body-md placeholder-on-surface-variant/70 hidden sm:block w-48" placeholder={copy.search} type="text" />
          </div>
          <nav className="hidden md:flex items-center gap-gutter">
            <Link className="font-body-lg text-body-lg text-on-surface-variant hover:text-primary transition-colors opacity-80 active:opacity-100" href={`/${locale}/app/jobs`}>{copy.transcripts}</Link>
            <Link className="font-body-lg text-body-lg text-on-surface-variant hover:text-primary transition-colors opacity-80 active:opacity-100" href={`/${locale}/app/jobs`}>{copy.overview}</Link>
            <Link className="font-body-lg text-body-lg text-on-surface-variant hover:text-primary transition-colors opacity-80 active:opacity-100" href={`/${locale}/app/jobs`}>{copy.sources}</Link>
          </nav>
          <div className="flex items-center gap-stack-md text-on-surface-variant">
            <button className="hover:text-primary transition-colors opacity-80 active:opacity-100" type="button">
              <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
            </button>
            <button className="hover:text-primary transition-colors opacity-80 active:opacity-100" type="button">
              <span className="material-symbols-outlined" data-icon="help">help</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden ml-2 cursor-pointer border border-outline-variant">
              {avatarUrl ? (
                <span
                  aria-label={copy.avatarAlt}
                  className="block h-full w-full bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url(${avatarUrl})` }}
                />
              ) : <span className="flex h-full w-full items-center justify-center font-label-sm text-label-sm text-primary">{initials}</span>}
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[800px] mx-auto px-margin-mobile md:px-margin-desktop py-stack-lg pb-32">
          <h1 className="font-display-lg text-display-lg text-on-background mb-stack-lg">{copy.title}</h1>
          <div className="flex flex-col gap-12">
            <section className="flex flex-col gap-stack-md">
              <h2 className="font-headline-md text-headline-md text-on-background border-b border-outline-variant pb-2">{copy.profile}</h2>
              <div className="flex items-start gap-stack-lg mt-4">
                <label className="w-20 h-20 rounded-full bg-surface-container-high overflow-hidden flex-shrink-0 border border-outline-variant relative group cursor-pointer">
                  {avatarUrl ? (
                    <span
                      aria-label={copy.avatarAlt}
                      className="block h-full w-full bg-cover bg-center"
                      role="img"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                    />
                  ) : <span className="flex h-full w-full items-center justify-center font-headline-md text-headline-md text-primary">{initials}</span>}
                  <span className="absolute inset-0 bg-primary/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-on-primary">{isUploadingAvatar ? "progress_activity" : "edit"}</span>
                  </span>
                  <input accept="image/*" className="hidden" disabled={isUploadingAvatar} onChange={handleAvatarUpload} type="file" />
                </label>
                <div className="flex-1 flex flex-col gap-6 w-full">
                  <div className="relative w-full">
                    <label className="font-label-sm text-label-sm text-on-surface-variant absolute -top-4 left-0">{copy.fullName}</label>
                    <input className="w-full bg-transparent border-0 border-b border-outline-variant py-2 px-0 focus:ring-0 focus:border-primary transition-colors font-body-lg text-body-lg text-on-background placeholder-on-surface-variant/50" type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </div>
                  <div className="relative w-full mt-2">
                    <label className="font-label-sm text-label-sm text-on-surface-variant absolute -top-4 left-0">{copy.email}</label>
                    <input className="w-full bg-transparent border-0 border-b border-outline-variant py-2 px-0 focus:ring-0 focus:border-primary transition-colors font-body-lg text-body-lg text-on-background placeholder-on-surface-variant/50" readOnly type="email" value={user.email} />
                  </div>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-stack-md">
              <h2 className="font-headline-md text-headline-md text-on-background border-b border-outline-variant pb-2">{copy.appearance}</h2>
              <div className="mt-4 flex items-center justify-between gap-stack-md max-sm:flex-col max-sm:items-stretch">
                <div>
                  <p className="font-body-lg text-body-lg text-on-background">{copy.themeTitle}</p>
                  <p className="font-body-md text-body-md text-on-surface-variant">{copy.themeHint}</p>
                </div>
                <WorkspaceThemeSwitcher />
              </div>
            </section>

            <section className="flex flex-col gap-stack-md">
              <h2 className="font-headline-md text-headline-md text-on-background border-b border-outline-variant pb-2">{copy.usagePlan}</h2>
              <div className="mt-4 rounded-lg border border-outline-variant bg-surface p-stack-lg relative overflow-hidden flex flex-col md:flex-row gap-stack-lg items-start md:items-center justify-between">
                <div className="flex flex-col gap-4 relative z-10 w-full max-w-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-label-sm text-label-sm bg-surface-container-high px-2 py-1 rounded text-on-surface-variant tracking-wider uppercase">{copy.currentPlan}</span>
                    <h3 className="font-display-lg-mobile text-display-lg-mobile text-on-background">{planLabel}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between font-label-sm text-label-sm">
                      <span className="text-on-surface-variant">{copy.transcriptsAnalyzed}</span>
                      <span className="text-on-background font-medium">{transcriptCount} / {monthlyLimitLabel}</span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: `${usagePercent}%` }} />
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-1">{resetDays === null ? copy.noReset : copy.resetsIn(resetDays)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4 relative z-10 md:w-[300px] border-t md:border-t-0 md:border-l border-outline-variant pt-stack-md md:pt-0 md:pl-stack-md">
                  <ul className="flex flex-col gap-2 font-body-md text-body-md text-on-background">
                    {benefits.map((benefit) => (
                      <li className="flex items-center gap-2" key={benefit}>
                        <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  <button className="mt-2 w-full bg-primary text-on-primary py-3 px-6 rounded-md font-label-sm text-label-sm hover:bg-inverse-surface transition-colors flex items-center justify-center gap-2 shadow-none disabled:opacity-60" disabled={isStartingCheckout} type="button" onClick={() => void handleCheckout()}>
                    {isStartingCheckout ? copy.saving : copy.cta}
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            </section>

            <div className="flex justify-end mt-4">
              <button className="bg-transparent border border-outline text-on-background py-2 px-6 rounded-md font-label-sm text-label-sm hover:bg-surface-container-low transition-colors" disabled={isSavingProfile} type="button" onClick={handleUpdateProfile}>
                {isSavingProfile ? copy.saving : copy.save}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
