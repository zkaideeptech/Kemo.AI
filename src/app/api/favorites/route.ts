import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const artifactId = typeof body?.artifactId === "string" ? body.artifactId : null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const jobId = typeof body?.jobId === "string" ? body.jobId : null;
  const itemType = typeof body?.itemType === "string" ? body.itemType : "artifact";
  const label = typeof body?.label === "string" ? body.label : null;
  const excerpt = typeof body?.excerpt === "string" ? body.excerpt : null;

  if (!artifactId && !jobId) {
    return jsonError("invalid_payload", "Missing favorite target", { status: 400 });
  }

  const { data: existing } = await supabase
    .from("favorites")
    .select("*")
    .eq("user_id", user.id)
    .eq("artifact_id", artifactId)
    .maybeSingle();

  if (existing) {
    return jsonOk({ favorite: existing });
  }

  const { data, error } = await supabase
    .from("favorites")
    .insert({
      user_id: user.id,
      project_id: projectId,
      job_id: jobId,
      artifact_id: artifactId,
      item_type: itemType,
      label,
      excerpt,
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("db_error", error?.message || "Unable to save favorite", { status: 500 });
  }

  return jsonOk({ favorite: data });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const artifactId = searchParams.get("artifactId");

  if (!artifactId) {
    return jsonError("invalid_payload", "Missing artifactId", { status: 400 });
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("artifact_id", artifactId);

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ removed: true });
}
