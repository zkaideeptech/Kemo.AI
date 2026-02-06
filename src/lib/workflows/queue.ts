import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATUS } from "@/lib/workflows/jobStatus";
import { runJobPipeline } from "@/lib/workflows/jobPipeline";

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

export async function runQueuedJobs(limit = 3) {
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

  for (const job of jobs || []) {
    try {
      await runJobPipeline(job.id);
    } catch (err: unknown) {
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
}
