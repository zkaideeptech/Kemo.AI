/**
 * @file page.tsx
 * @description 个人设置页面
 * @author KEMO
 * @created 2026-02-06
 */

import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/billing/plan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("nav.settings") || "个人设置"}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">邮箱</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">用户 ID</span>
            <span className="font-mono text-xs">{user.id}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted">当前套餐</span>
            <span>{plan.plan === "pro" ? "专业版" : "免费版"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">单文件上限</span>
            <span>{plan.maxFileSizeMb}MB</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
