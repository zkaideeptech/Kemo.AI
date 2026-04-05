import { jsonError, jsonOk } from "@/lib/api/response";
import { ensureAsrGateway } from "@/lib/live/asrGatewayClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  await ensureAsrGateway();
  return jsonOk({ ready: true });
}
