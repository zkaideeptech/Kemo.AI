import { NextResponse } from "next/server";

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
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.max(1, Number(process.env.WORKER_BATCH_LIMIT || 1));
  const startedAt = Date.now();

  try {
    const summary = await runQueuedJobs(limit);
    return NextResponse.json({
      ok: true,
      limit,
      elapsedMs: Date.now() - startedAt,
      ...summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Worker cron failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
