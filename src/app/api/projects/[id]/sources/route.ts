import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { extractSourceFromUrl } from "@/lib/providers/sourceProvider";
import type { Database, Json } from "@/lib/supabase/types";

type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export const runtime = "nodejs";

function normalizeUrl(value: string) {
  const next = value.trim();
  return /^https?:\/\//i.test(next) ? next : `https://${next}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) {
    return jsonError("not_found", "Project not found", { status: 404 });
  }

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ sources: (data || []) as SourceRow[] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) {
    return jsonError("not_found", "Project not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const rawUrl = typeof body?.url === "string" ? body.url : "";
  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const jobId = typeof body?.jobId === "string" ? body.jobId : null;
  const sourceType = typeof body?.sourceType === "string" ? body.sourceType : "url";

  if (!rawUrl.trim()) {
    return jsonError("invalid_payload", "Missing url", { status: 400 });
  }

  let normalizedUrl = "";

  try {
    normalizedUrl = normalizeUrl(rawUrl);
    new URL(normalizedUrl);
  } catch {
    return jsonError("invalid_payload", "Invalid url", { status: 400 });
  }

  const { data: existing } = await supabase
    .from("sources")
    .select("*")
    .eq("project_id", id)
    .eq("url", normalizedUrl)
    .maybeSingle();

  if (existing) {
    return jsonOk({ source: existing });
  }

  let extractedText: string | null = null;
  let rawText: string | null = null;
  let title = rawTitle || null;
  let domain: string | null = null;
  let status = "ready";
  let metadata: Json = {};

  try {
    const extracted = await extractSourceFromUrl(normalizedUrl);
    extractedText = extracted.extractedText || null;
    rawText = extracted.rawText || null;
    title = title || extracted.title || new URL(normalizedUrl).hostname;
    domain = extracted.domain || new URL(normalizedUrl).hostname;
    metadata = {
      ...(typeof extracted.metadata === "object" && extracted.metadata ? extracted.metadata : {}),
      provider: extracted.provider,
      imported_at: new Date().toISOString(),
    } as Json;
  } catch (error) {
    title = title || new URL(normalizedUrl).hostname;
    domain = new URL(normalizedUrl).hostname.replace(/^www\./, "");
    status = "failed";
    metadata = {
      error: error instanceof Error ? error.message : "Unknown extraction error",
      imported_at: new Date().toISOString(),
    } as Json;
  }

  const { data, error } = await supabase
    .from("sources")
    .insert({
      user_id: user.id,
      project_id: id,
      job_id: jobId,
      source_type: sourceType,
      title,
      url: normalizedUrl,
      domain,
      raw_text: rawText,
      extracted_text: extractedText,
      status,
      metadata,
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("db_error", error?.message || "Unable to create source", { status: 500 });
  }

  return jsonOk({ source: data as SourceRow }, { status: 201 });
}
