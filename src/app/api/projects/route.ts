import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { DEFAULT_PROJECT_TITLE } from "@/lib/workspace";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ projects: data || [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" && body.title.trim()
    ? body.title.trim()
    : DEFAULT_PROJECT_TITLE;
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      description,
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("db_error", error?.message || "Unable to create project", { status: 500 });
  }

  return jsonOk({ project: data }, { status: 201 });
}
