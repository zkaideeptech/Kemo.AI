/**
 * @file page.tsx
 * @description 任务详情页，展示转写结果、术语确认和输出内容
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobDetailTabs } from "@/components/job-detail-tabs";
import { JobRealtimeRefresher } from "@/components/job-realtime-refresher";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type MemoRow = Database["public"]["Tables"]["memos"]["Row"];
type TermOccurrenceRow = Database["public"]["Tables"]["term_occurrences"]["Row"];

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations();
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== user.id) {
    notFound();
  }

  const { data: transcriptData } = await supabase
    .from("transcripts")
    .select("*")
    .eq("job_id", id)
    .maybeSingle();
  const transcript = transcriptData as TranscriptRow | null;

  const { data: memoData } = await supabase
    .from("memos")
    .select("*")
    .eq("job_id", id)
    .maybeSingle();
  const memo = memoData as MemoRow | null;

  const { data: termsData } = await supabase
    .from("term_occurrences")
    .select("*")
    .eq("job_id", id);
  const terms = (termsData || []) as TermOccurrenceRow[];

  return (
    <div className="grid gap-4">
      <JobRealtimeRefresher userId={user.id} />
      <div>
        <h1 className="text-2xl font-semibold">{job.title || "Job"}</h1>
        <p className="text-sm text-muted">
          {t("job.status")}: {job.status}
        </p>
      </div>
      <JobDetailTabs
        jobId={job.id}
        transcriptText={transcript?.transcript_text || null}
        icQaText={memo?.ic_qa_text || null}
        wechatText={memo?.wechat_article_text || null}
        termOccurrences={terms.map((t) => ({
          id: t.id,
          term_text: t.term_text,
          confidence: t.confidence,
          context: t.context,
          status: t.status,
        }))}
      />
    </div>
  );
}
