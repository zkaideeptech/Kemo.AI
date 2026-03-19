import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createAsrGatewayBrowserSession,
  getAsrGatewaySnapshot,
} from "@/lib/live/asrGatewayClient";
import { getEmptyRealtimeAsrSnapshot } from "@/lib/live/realtimeAsrSession";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

async function loadAuthorizedJob(id: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: jsonError("unauthorized", "Not authenticated", { status: 401 }),
      job: null,
      userId: null,
    } as const;
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== user.id) {
    return {
      errorResponse: jsonError("not_found", "Job not found", { status: 404 }),
      job: null,
      userId: null,
    } as const;
  }

  return {
    errorResponse: null,
    job,
    userId: user.id,
  } as const;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await loadAuthorizedJob(id);

  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  if (!auth.userId) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const payload = await getAsrGatewaySnapshot(id).catch(() => ({
    ...getEmptyRealtimeAsrSnapshot(id),
    debug: {
      exists: false,
      isOpen: false,
      hasFinished: false,
      updatedAt: null,
      closeCode: null,
      closeReason: null,
      wsState: "missing" as const,
    },
  }));

  return jsonOk(payload);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await loadAuthorizedJob(id);

  if (auth.errorResponse) {
    return auth.errorResponse;
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const language = typeof body?.language === "string" ? body.language : "zh";
  const turnDetectionMode = body?.turnDetectionMode === "manual" ? "manual" : "server_vad";

  if (action === "start") {
    const session = await createAsrGatewayBrowserSession({
      jobId: id,
      userId: auth.userId,
      language,
      turnDetectionMode,
    });

    return jsonOk(session);
  }

  return jsonError("invalid_payload", "Unsupported live audio action", { status: 400 });
}
