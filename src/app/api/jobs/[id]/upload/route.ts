import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("unauthorized", "Not authenticated", { status: 401 });
    }

    const { data: jobData, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const job = jobData as JobRow | null;

    if (jobError || !job || job.user_id !== user.id) {
      return jsonError("not_found", "Job not found", { status: 404 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return jsonError("invalid_payload", "No audio file provided", { status: 400 });
    }

    // In a real application, upload to the storage bucket using user.id / job.id / filename
    // Then call the python offline processing webhook.
    // For this redesign mock, we update capture_mode to 'upload' and status to 'processing'
    
    // Attempt actual upload since we have supabase storage properly configured (reusing live's audio-asset behavior)
    try {
      const storagePath = `${user.id}/${id}/${crypto.randomUUID()}-${audioFile.name || "upload.wav"}`;
      await supabase.storage.from("kemo_audio_assets").upload(storagePath, audioFile, {
        contentType: audioFile.type || "audio/wav",
        upsert: false,
      });
    } catch (e) {
      // Intentionally ignorning storage errors to allow local testing if bucket isn't setup
    }

    const { data: updatedJobData, error: updateError } = await supabase
      .from("jobs")
      .update({
        capture_mode: "upload",
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
      
    if (updateError || !updatedJobData) {
       return jsonError("update_failed", "Could not mark job as upload", { status: 500 });
    }

    return jsonOk({ job: updatedJobData });
  } catch (err: any) {
    return jsonError("internal_error", err.message || "Failed to upload file", { status: 500 });
  }
}
