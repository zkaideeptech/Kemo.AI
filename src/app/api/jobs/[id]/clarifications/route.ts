import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { loadJobClarifications } from "@/lib/clarifications";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("id,user_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!jobData || jobData.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const items = await loadJobClarifications(supabase, jobId);
  return jsonOk({ items });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("id,user_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!jobData || jobData.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!items.length) {
    return jsonError("invalid_payload", "Missing clarification items", { status: 400 });
  }

  const rows = items
    .map((item: { question?: string; answer?: string; context?: string | null }) => {
      const question = typeof item?.question === "string" ? item.question.trim() : "";
      const answer = typeof item?.answer === "string" ? item.answer.trim() : "";
      const context = typeof item?.context === "string" ? item.context.trim() : null;
      if (!question || !answer) {
        return null;
      }

      return {
        user_id: user.id,
        job_id: jobId,
        term_text: question,
        confirmed_text: answer,
        action: "edit",
        source: "artifact_clarification",
        context,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return jsonError("invalid_payload", "Clarification answers cannot be empty", { status: 400 });
  }

  const { error } = await admin.from("confirmations").insert(rows);

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ ok: true });
}
