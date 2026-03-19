import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type ConfirmationRow = Database["public"]["Tables"]["confirmations"]["Row"];

export type JobClarification = {
  question: string;
  answer: string;
  context: string | null;
  createdAt: string;
};

export async function loadJobClarifications(
  supabase: SupabaseClient<Database>,
  jobId: string
): Promise<JobClarification[]> {
  const { data } = await supabase
    .from("confirmations")
    .select("*")
    .eq("job_id", jobId)
    .eq("source", "artifact_clarification")
    .order("created_at", { ascending: false });

  const rows = (data || []) as ConfirmationRow[];
  const deduped = new Map<string, JobClarification>();

  for (const row of rows) {
    const question = (row.term_text || "").trim();
    const answer = (row.confirmed_text || "").trim();
    if (!question || !answer || deduped.has(question)) {
      continue;
    }

    deduped.set(question, {
      question,
      answer,
      context: row.context,
      createdAt: row.created_at,
    });
  }

  return Array.from(deduped.values());
}

export function buildClarificationContext(items: JobClarification[]) {
  if (!items.length) {
    return "";
  }

  return [
    "已确认补充信息：",
    ...items.map((item) => `- ${item.question} → ${item.answer}`),
  ].join("\n");
}
