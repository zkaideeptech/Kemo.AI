import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import { runJobPipeline } from "@/lib/workflows/jobPipeline";
import type { Database } from "@/lib/supabase/types";

type QueuedJobRow = Pick<Database["public"]["Tables"]["jobs"]["Row"], "id">;

export type QueueRunSummary = {
  scanned: number;
  processed: number;
  failed: number;
};

export async function enqueueJob(jobId: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update({ status: JOB_STATUS.queued, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function cleanupStaleJobs() {
  const supabase = createSupabaseAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const staleStatuses = [
    JOB_STATUS.transcribing,
    JOB_STATUS.extracting_terms,
    JOB_STATUS.summarizing,
    JOB_STATUS.queued,
  ];

  const { data, error } = await supabase
    .from("jobs")
    .update({
      status: JOB_STATUS.failed,
      error_message: "Job stuck in intermediate state for over 1 hour. Automatically failed by worker cleanup.",
      updated_at: new Date().toISOString(),
    })
    .in("status", staleStatuses)
    .lt("updated_at", oneHourAgo)
    .select("id");

  if (error) {
    console.error("[Queue] ✗ Failed to cleanup stale jobs:", error);
  } else if (data && data.length > 0) {
    console.log(`[Queue] 🧹 Cleaned up (failed) ${data.length} stale/zombie jobs.`);
  }
}

export async function runQueuedJobs(limit = 3): Promise<QueueRunSummary> {
  const supabase = createSupabaseAdminClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("status", JOB_STATUS.queued)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const queuedJobs = (jobs || []) as QueuedJobRow[];
  let processed = 0;
  let failed = 0;

  for (const job of queuedJobs) {
    try {
      await runJobPipeline(job.id);
      processed += 1;
    } catch (err: unknown) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Job failed";
      await supabase
        .from("jobs")
        .update({
          status: JOB_STATUS.failed,
          error_message: message,
        })
        .eq("id", job.id);
    }
  }

  return {
    scanned: queuedJobs.length,
    processed,
    failed,
  };
}
