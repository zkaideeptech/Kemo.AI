import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type AudioAssetRow = Database["public"]["Tables"]["audio_assets"]["Row"];

function sanitizeFileName(name: string) {
  return name
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_");
}

async function loadAuthorizedJob(id: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: jsonError("unauthorized", "Not authenticated", { status: 401 }),
      job: null,
      userId: null,
    } as const;
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== user.id) {
    return {
      errorResponse: jsonError("not_found", "Job not found", { status: 404 }),
      job: null,
      userId: null,
    } as const;
  }

  return {
    errorResponse: null,
    job,
    userId: user.id,
  } as const;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await loadAuthorizedJob(id);

  if (auth.errorResponse || !auth.job || !auth.userId) {
    return auth.errorResponse || jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const contentType = req.headers.get("content-type") || "";
  let storagePath = "";
  let safeFileName = "live_capture.wav";
  let fileSize = 0;
  let mimeType = "audio/wav";
  let durationSeconds: number | null = null;

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    storagePath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
    safeFileName = sanitizeFileName(typeof body?.fileName === "string" ? body.fileName : "live_capture.wav");
    fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;
    mimeType = typeof body?.mimeType === "string" && body.mimeType ? body.mimeType : "audio/wav";
    durationSeconds =
      typeof body?.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
        ? body.durationSeconds
        : null;
  } else {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const durationSecondsRaw = formData?.get("durationSeconds");

    if (!(file instanceof File)) {
      return jsonError("invalid_payload", "Missing live audio file", { status: 400 });
    }

    durationSeconds =
      typeof durationSecondsRaw === "string" && Number.isFinite(Number(durationSecondsRaw))
        ? Number(durationSecondsRaw)
        : null;
    safeFileName = sanitizeFileName(file.name || "live_capture.wav");
    storagePath = `${auth.userId}/${id}/${safeFileName}`;
    fileSize = file.size;
    mimeType = file.type || "audio/wav";
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      return jsonError("upload_failed", uploadError.message, { status: 500 });
    }
  }

  if (!storagePath || !fileSize) {
    return jsonError("invalid_payload", "Missing live audio metadata", { status: 400 });
  }

  if (!storagePath.startsWith(`${auth.userId}/`)) {
    return jsonError("invalid_payload", "Invalid live audio path", { status: 400 });
  }

  const { data: existingAssetData } = await admin
    .from("audio_assets")
    .select("*")
    .eq("job_id", id)
    .limit(1)
    .maybeSingle();

  const existingAsset = existingAssetData as AudioAssetRow | null;

  if (existingAsset) {
    const { data: updatedAssetData, error: updateError } = await admin
      .from("audio_assets")
      .update({
        storage_path: storagePath,
        file_name: safeFileName,
        file_size: fileSize,
        mime_type: mimeType,
        duration_seconds: durationSeconds,
        keep_source: true,
      })
      .eq("id", existingAsset.id)
      .select("*")
      .single();

    if (updateError || !updatedAssetData) {
      return jsonError("db_error", updateError?.message || "Failed to update live audio asset", { status: 500 });
    }

    await admin
      .from("jobs")
      .update({ audio_asset_id: existingAsset.id })
      .eq("id", id);

    return jsonOk({
      audioAsset: updatedAssetData,
      storagePath,
    });
  }

  const { data: createdAssetData, error: createError } = await admin
    .from("audio_assets")
    .insert({
      user_id: auth.userId,
      job_id: id,
      storage_path: storagePath,
      file_name: safeFileName,
      file_size: fileSize,
      mime_type: mimeType,
      duration_seconds: durationSeconds,
      keep_source: true,
    })
    .select("*")
    .single();

  const createdAsset = createdAssetData as AudioAssetRow | null;

  if (createError || !createdAsset) {
    return jsonError("db_error", createError?.message || "Failed to create live audio asset", { status: 500 });
  }

  await admin
    .from("jobs")
    .update({ audio_asset_id: createdAsset.id })
    .eq("id", id);

  return jsonOk({
    audioAsset: createdAsset,
    storagePath,
  });
}
