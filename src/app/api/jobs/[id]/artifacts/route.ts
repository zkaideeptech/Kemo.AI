import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { generateArtifactText } from "@/lib/providers/llmProvider";
import { synthesizePodcastAudio } from "@/lib/providers/ttsProvider";
import { getArtifactLabel, isArtifactKind, type ArtifactKind } from "@/lib/workspace";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];

function buildSourceContext(sources: SourceRow[]) {
  return sources
    .map((source, index) => {
      const header = `Source ${index + 1}: ${source.title || source.url || "Imported source"}`;
      const body = (source.extracted_text || "").slice(0, 2400);
      return `${header}\n${body}`;
    })
    .filter((item) => item.trim().length > 0)
    .join("\n\n---\n\n")
    .slice(0, 12000);
}

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

  const { data, error } = await supabase
    .from("artifacts")
    .select("*")
    .eq("job_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return jsonError("db_error", error.message, { status: 500 });
  }

  return jsonOk({ artifacts: data || [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = typeof body?.kind === "string" ? body.kind : "";

  if (!isArtifactKind(kind)) {
    return jsonError("invalid_payload", "Unsupported artifact kind", { status: 400 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== user.id) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const { data: transcriptData } = await supabase
    .from("transcripts")
    .select("*")
    .eq("job_id", id)
    .maybeSingle();

  const transcript = transcriptData as TranscriptRow | null;

  if (!transcript?.transcript_text) {
    return jsonError("not_ready", "Transcript is not ready yet", { status: 409 });
  }

  const { data: glossary } = await supabase
    .from("glossary_terms")
    .select("term")
    .eq("user_id", user.id);

  const { data: sourcesData } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", job.project_id || "")
    .order("created_at", { ascending: false })
    .limit(6);

  const glossaryTerms = (glossary || []).map((term) => term.term);
  const sourceContext = buildSourceContext((sourcesData || []) as SourceRow[]);
  let content = "";
  let audioUrl: string | null = null;
  let publishScriptText = "";
  const metadata: Record<string, string> = {
    generated_at: new Date().toISOString(),
    source_count: String((sourcesData || []).length),
  };

  if (kind === "roadshow_transcript" || kind === "meeting_minutes") {
    const { data: existingPublishArtifact } = await supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .eq("kind", "publish_script")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const upstreamArtifact = existingPublishArtifact as ArtifactRow | null;

    publishScriptText = upstreamArtifact?.content || "";

    if (!publishScriptText.trim()) {
      publishScriptText = await generateArtifactText("publish_script", {
        transcriptText: transcript.transcript_text,
        glossaryTerms,
        uncertainTerms: [],
        sourceContext,
        title: job.title || "",
        guestName: job.guest_name || "",
        interviewerName: job.interviewer_name || "",
      });

      await admin.from("artifacts").insert({
        user_id: user.id,
        project_id: job.project_id,
        job_id: job.id,
        kind: "publish_script",
        title: getArtifactLabel("publish_script"),
        content: publishScriptText,
        summary: publishScriptText.slice(0, 180),
        metadata: {
          generated_at: new Date().toISOString(),
          source_count: String((sourcesData || []).length),
          auto_generated_as_upstream: "true",
        },
        status: "ready",
      });
    }
  }

  if (kind === "podcast_audio") {
    const script = await generateArtifactText("podcast_script", {
      transcriptText: transcript.transcript_text,
      glossaryTerms,
      uncertainTerms: [],
      sourceContext,
      title: job.title || "",
      guestName: job.guest_name || "",
      interviewerName: job.interviewer_name || "",
    });

    content = script;
    metadata.script = script;

    try {
      const tts = await synthesizePodcastAudio({
        script,
        title: job.title || getArtifactLabel("podcast_audio"),
      });
      audioUrl = tts.audioUrl;
    } catch (error) {
      metadata.tts_error = error instanceof Error ? error.message : "Unknown TTS error";
    }
  } else {
    content = await generateArtifactText(kind as ArtifactKind, {
      transcriptText: transcript.transcript_text,
      glossaryTerms,
      uncertainTerms: [],
      sourceContext,
      title: job.title || "",
      guestName: job.guest_name || "",
      interviewerName: job.interviewer_name || "",
      publishScriptText,
    });
  }

  if (kind === "roadshow_transcript" || kind === "meeting_minutes") {
    metadata.export_format = "docx";
    metadata.upstream_kind = "publish_script";
  }

  const { data, error } = await admin
    .from("artifacts")
    .insert({
      user_id: user.id,
      project_id: job.project_id,
      job_id: job.id,
      kind,
      title: getArtifactLabel(kind as ArtifactKind),
      content,
      summary: content.slice(0, 180),
      metadata,
      audio_url: audioUrl,
      status: audioUrl || kind !== "podcast_audio" ? "ready" : "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("db_error", error?.message || "Artifact save failed", { status: 500 });
  }

  const artifact = data as ArtifactRow;

  if (kind === "roadshow_transcript" || kind === "meeting_minutes") {
    const nextMetadata = {
      ...((artifact.metadata as Record<string, string | null>) || {}),
      download_path: `/api/artifacts/${artifact.id}/download`,
    };

    await admin
      .from("artifacts")
      .update({ metadata: nextMetadata })
      .eq("id", artifact.id);

    artifact.metadata = nextMetadata;
  }

  return jsonOk({ artifact }, { status: 201 });
}
