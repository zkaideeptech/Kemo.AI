import { runQueuedJobs } from "@/lib/workflows/queue";

async function main() {
  const limit = Number(process.env.WORKER_BATCH_LIMIT || 3);
  await runQueuedJobs(limit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

