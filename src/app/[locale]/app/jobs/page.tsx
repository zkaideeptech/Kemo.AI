import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobsList } from "@/components/jobs-list";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,title,status,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("jobs.title")}</h1>
      </div>
      <JobsList
        initialJobs={jobs || []}
        userId={user.id}
        locale={locale}
      />
    </div>
  );
}

