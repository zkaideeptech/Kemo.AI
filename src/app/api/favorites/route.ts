import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

/**
 * 收藏 API — 使用 admin client 绕过 RLS（因为 SSR Route Handler 中
 * auth.uid() 在 RLS 层经常无法正确获取，但 getUser() 可以正常验证身份）。
 * 所有写操作都严格限定 user_id = user.id，安全性等效于 RLS。
 */

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const admin = createSupabaseAdminClient();

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

  // 检查是否已收藏
  const existingQuery = admin
    .from("favorites")
    .select("*")
    .eq("user_id", user.id);

  const { data: existing } = artifactId
    ? await existingQuery.eq("artifact_id", artifactId).maybeSingle()
    : await existingQuery
        .eq("job_id", jobId)
        .is("artifact_id", null)
        .eq("item_type", itemType)
        .maybeSingle();

  if (existing) {
    return jsonOk({ favorite: existing });
  }

  // 插入新收藏
  const { data, error } = await admin
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
    console.error("收藏插入失败:", error);
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

  const admin = createSupabaseAdminClient();

  const { searchParams } = new URL(req.url);
  const artifactId = searchParams.get("artifactId");
  const jobId = searchParams.get("jobId");

  if (!artifactId && !jobId) {
    return jsonError("invalid_payload", "Missing favorite target", { status: 400 });
  }

  // 严格限定 user_id，安全等效于 RLS
  const deleteQuery = admin
    .from("favorites")
    .delete()
    .eq("user_id", user.id);

  let error;
  if (artifactId) {
    ({ error } = await deleteQuery.eq("artifact_id", artifactId));
  } else if (jobId) {
    ({ error } = await deleteQuery.eq("job_id", jobId).is("artifact_id", null));
  }

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ removed: true });
}
