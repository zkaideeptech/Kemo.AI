import { jsonError, jsonOk } from "@/lib/api/response";
import { runQueuedJobs } from "@/lib/workflows/queue";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return jsonError("unauthorized", "Unauthorized", { status: 401 });
  }

  const limit = Math.max(1, Number(process.env.WORKER_BATCH_LIMIT || 1));
  const startedAt = Date.now();

  try {
    const summary = await runQueuedJobs(limit);
    return jsonOk({
      limit,
      elapsedMs: Date.now() - startedAt,
      ...summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Worker cron failed";
    return jsonError("worker_failed", message, { status: 500 });
  }
}
