import { runQueuedJobs, cleanupStaleJobs } from "@/lib/workflows/queue";

async function main() {
  const limit = Number(process.env.WORKER_BATCH_LIMIT || 3);
  await cleanupStaleJobs();
  await runQueuedJobs(limit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

