import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/billing/plan";
import { NewJobForm } from "@/components/new-job-form";

export default async function NewJobPage({
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
        <h1 className="text-2xl font-semibold">{t("new.title")}</h1>
        <p className="text-sm text-muted">{t("new.subtitle")}</p>
      </div>
      <NewJobForm plan={plan} />
    </div>
  );
}

