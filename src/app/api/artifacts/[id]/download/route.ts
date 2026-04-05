import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/response";
import { buildArtifactDocxFileName, buildDocxBuffer } from "@/lib/export/docx";
import type { Database } from "@/lib/supabase/types";

type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];

export const runtime = "nodejs";

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

  const { data } = await supabase
    .from("artifacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const artifact = data as ArtifactRow | null;

  if (!artifact || artifact.user_id !== user.id) {
    return jsonError("not_found", "Artifact not found", { status: 404 });
  }

  if (!artifact.content?.trim()) {
    return jsonError("not_ready", "Artifact content is empty", { status: 409 });
  }

  const buffer = await buildDocxBuffer({
    title: artifact.title,
    content: artifact.content,
  });
  const fileName = buildArtifactDocxFileName(artifact.title);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
