import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import { generateArtifactText } from "@/lib/providers/llmProvider";
import { getArtifactLabel } from "@/lib/workspace";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];

function buildSourceContext(sources: SourceRow[]) {
  return sources
    .map((source, index) => {
      const header = `Source ${index + 1}: ${source.title || source.url || "Imported source"}`;
      const body = (source.extracted_text || "").slice(0, 2000);
      return `${header}\n${body}`;
    })
    .filter((item) => item.trim().length > 0)
    .join("\n\n---\n\n")
    .slice(0, 10000);
}

export const runtime = "nodejs";

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
  const userId = user.id;

  const body = await req.json().catch(() => ({}));
  const transcriptText = typeof body?.transcriptText === "string" ? body.transcriptText.trim() : "";
  const statusText = typeof body?.statusText === "string" ? body.statusText.trim() : "";

  if (!transcriptText) {
    return jsonError("invalid_payload", "Missing transcriptText", { status: 400 });
  }

  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const job = jobData as JobRow | null;

  if (!job || job.user_id !== userId) {
    return jsonError("not_found", "Job not found", { status: 404 });
  }

  const ensuredJob = job;

  const { data: updatedJobData, error: updateJobError } = await admin
    .from("jobs")
    .update({
      live_transcript_snapshot: transcriptText,
      capture_mode: "live",
      source_type: ensuredJob.capture_mode === "live" ? ensuredJob.source_type : "live_capture",
      started_at: ensuredJob.started_at || new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateJobError || !updatedJobData) {
    return jsonError("db_error", updateJobError?.message || "Failed to update live transcript", { status: 500 });
  }

  if (transcriptText.length < 80) {
    return jsonOk({ job: updatedJobData, draftArtifact: null, statusText });
  }

  const { data: glossary } = await supabase
    .from("glossary_terms")
    .select("term")
    .eq("user_id", userId);

  const { data: sourcesData } = await supabase
    .from("sources")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", ensuredJob.project_id || "")
    .order("created_at", { ascending: false })
    .limit(6);

  const glossaryTerms = (glossary || []).map((term) => term.term);
  const sourceContext = buildSourceContext((sourcesData || []) as SourceRow[]);

  async function upsertDraftArtifact(kind: "publish_script" | "inspiration_questions", content: string) {
    const { data: existingDraftData } = await supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .eq("kind", kind)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingDraft = existingDraftData as ArtifactRow | null;
    const nextMetadata = {
      generated_at: new Date().toISOString(),
      live_draft: "true",
      status_text: statusText,
    };

    if (existingDraft) {
      const { data: updatedDraftData, error: draftUpdateError } = await admin
        .from("artifacts")
        .update({
          title: `${getArtifactLabel(kind)}（实时草稿）`,
          content,
          summary: content.slice(0, 180),
          metadata: nextMetadata,
        })
        .eq("id", existingDraft.id)
        .select("*")
        .single();

      if (draftUpdateError || !updatedDraftData) {
        throw new Error(draftUpdateError?.message || `Failed to update ${kind} draft`);
      }

      return updatedDraftData as ArtifactRow;
    }

    const { data: createdDraftData, error: draftCreateError } = await admin
      .from("artifacts")
      .insert({
        user_id: userId,
        project_id: ensuredJob.project_id,
        job_id: ensuredJob.id,
        kind,
        title: `${getArtifactLabel(kind)}（实时草稿）`,
        content,
        summary: content.slice(0, 180),
        metadata: nextMetadata,
        status: "draft",
      })
      .select("*")
      .single();

    if (draftCreateError || !createdDraftData) {
      throw new Error(draftCreateError?.message || `Failed to create ${kind} draft`);
    }

    return createdDraftData as ArtifactRow;
  }

  try {
    const draftText = await generateArtifactText("publish_script", {
      transcriptText,
      glossaryTerms,
      uncertainTerms: [],
      sourceContext,
      title: ensuredJob.title || "",
      guestName: ensuredJob.guest_name || "",
      interviewerName: ensuredJob.interviewer_name || "",
      isLiveDraft: true,
    });

    const draftArtifacts: ArtifactRow[] = [];
    draftArtifacts.push(await upsertDraftArtifact("publish_script", draftText));

    if (transcriptText.length >= 120) {
      const inspirationText = await generateArtifactText("inspiration_questions", {
        transcriptText,
        glossaryTerms,
        uncertainTerms: [],
        sourceContext,
        title: ensuredJob.title || "",
        guestName: ensuredJob.guest_name || "",
        interviewerName: ensuredJob.interviewer_name || "",
        publishScriptText: draftText,
        isLiveDraft: true,
      });

      draftArtifacts.push(await upsertDraftArtifact("inspiration_questions", inspirationText));
    }

    return jsonOk({
      job: updatedJobData,
      draftArtifacts,
      statusText,
    });
  } catch (error) {
    return jsonOk({
      job: updatedJobData,
      draftArtifacts: [],
      statusText,
      warning: error instanceof Error ? error.message : "Live draft generation failed",
    });
  }
}
