import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { searchWeb } from "@/lib/providers/searchProvider";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return jsonOk({ results: [] });
  }

  try {
    const results = await searchWeb(q);
    return jsonOk({ results });
  } catch (error) {
    return jsonError(
      "provider_error",
      error instanceof Error ? error.message : "Web search failed",
      { status: 502 }
    );
  }
}
