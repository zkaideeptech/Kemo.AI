/**
 * @file page.tsx
 * @description 个人设置页面
 * @author KEMO
 * @created 2026-02-06
 */

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
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  let plan: Awaited<ReturnType<typeof getUserPlan>> = { plan: "free", maxFileSizeMb: 50 };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let totalJobsHistorical = 0;
  let totalJobsThisMonth = 0;
  let totalMinutesThisMonth = 0;

  try {
    plan = await getUserPlan(supabase, user.id);

    const [allJobsRes, monthJobsRes, monthTranscriptsRes] = await Promise.all([
      supabase.from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .throwOnError(),
      supabase.from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .gte("created_at", startOfMonth)
        .throwOnError(),
      supabase.from("audio_assets")
        .select("duration_seconds")
        .eq("user_id", user.id)
        .gte("created_at", startOfMonth)
        .throwOnError(),
    ]);

    totalJobsHistorical = allJobsRes.count || 0;
    totalJobsThisMonth = monthJobsRes.count || 0;
    
    if (monthTranscriptsRes.data) {
      const totalSeconds = monthTranscriptsRes.data.reduce((acc, row) => acc + (row.duration_seconds || 0), 0);
      totalMinutesThisMonth = Math.ceil(totalSeconds / 60);
    }
  } catch (error) {
    console.error("Settings query error:", error);
    if (process.env.NODE_ENV !== "development") {
      throw error;
    }
  }

  const displayName = user.user_metadata?.name || user.user_metadata?.display_name || "";

  return (
    <SettingsClientView 
      user={{ id: user.id, email: user.email, name: displayName }} 
      plan={plan} 
      stats={{ totalJobsHistorical, totalJobsThisMonth, totalMinutesThisMonth }}
      locale={locale} 
    />
  );
}
