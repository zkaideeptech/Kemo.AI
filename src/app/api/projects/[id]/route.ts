import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { id } = await context.params;

  if (!id) {
    return jsonError("invalid_project", "Missing project id", { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError) {
    return jsonError("db_error", projectError.message, { status: 500 });
  }

  if (!project) {
    return jsonError("not_found", "Project not found", { status: 404 });
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ removed: true });
}
