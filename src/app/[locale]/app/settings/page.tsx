/**
 * @file page.tsx
 * @description 个人设置页面
 * @author KEMO
 */

import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/billing/plan";
import { SettingsClientView } from "./settings-client-view";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const plan = await getUserPlan(supabase, user.id);

  // Get total jobs
  const { count: jobCount } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Get usage data for current period
  const { data: usageCounters } = await supabase
    .from("usage_counters")
    .select("minutes_used, files_used")
    .eq("user_id", user.id)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get metadata (avatar and name)
  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata || {};

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-12 w-full">
      <div className="mb-8 flex items-center gap-4">
        <Link 
          href={`/${locale}/app/jobs`}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t("nav.settings") || "个人中心"}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">管理你的仪表盘、个人资料、安全信息和偏好设置。</p>
        </div>
      </div>

      <SettingsClientView
        user={{
          id: user.id,
          email: user.email || "",
          fullName: metadata.full_name || "",
          avatarUrl: metadata.avatar_url || "",
        }}
        plan={plan}
        stats={{
          jobCount: jobCount || 0,
          minutesUsed: usageCounters?.minutes_used || 0,
          filesUsed: usageCounters?.files_used || 0,
        }}
        locale={locale}
      />
    </div>
  );
}
