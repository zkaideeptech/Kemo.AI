/**
 * @file page.tsx
 * @description 个人设置页面
 * @author KEMO
 */

import { requireUser } from "@/lib/auth";
import { FREE_MAX_JOBS_PER_MONTH, getUserPlan } from "@/lib/billing/plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SettingsClientView } from "./settings-client-view";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const plan = await getUserPlan(supabase, user.id);

  const { count: jobCount } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: usageCounters } = await supabase
    .from("usage_counters")
    .select("minutes_used, files_used, period_end")
    .eq("user_id", user.id)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: userData } = await supabase.auth.getUser();
  const metadata = userData.user?.user_metadata || {};

  return (
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
        monthlyJobLimit: plan.plan === "free" ? FREE_MAX_JOBS_PER_MONTH : null,
        periodEnd: usageCounters?.period_end || null,
      }}
      locale={locale}
    />
  );
}
