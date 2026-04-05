import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonError, jsonOk } from "@/lib/api/response";
import type { Database } from "@/lib/supabase/types";
import type { ProjectSearchResult } from "@/lib/workspace";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

export const runtime = "nodejs";

function includesQuery(value: string | null | undefined, query: string) {
  return (value || "").toLowerCase().includes(query);
}

function buildSnippet(value: string | null | undefined, query: string) {
  const text = (value || "").trim();

  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  const index = lower.indexOf(query);

  if (index < 0) {
    return text.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + query.length + 120);
  return text.slice(start, end).trim();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("unauthorized", "Not authenticated", { status: 401 });
  }

  if (q.length < 2) {
    return jsonOk({ results: [] as ProjectSearchResult[] });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) {
    return jsonError("not_found", "Project not found", { status: 404 });
  }

  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const jobs = (jobsData || []) as JobRow[];
  const jobIds = jobs.map((job) => job.id);

  const [transcriptsData, artifactsData, sourcesData] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("transcripts").select("*").in("job_id", jobIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as TranscriptRow[], error: null }),
    supabase.from("artifacts").select("*").eq("user_id", user.id).eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("sources").select("*").eq("user_id", user.id).eq("project_id", id).order("created_at", { ascending: false }),
  ]);

  const transcripts = (transcriptsData.data || []) as TranscriptRow[];
  const artifacts = (artifactsData.data || []) as ArtifactRow[];
  const sources = (sourcesData.data || []) as SourceRow[];

  const results: ProjectSearchResult[] = [];

  jobs.forEach((job) => {
    if (
      includesQuery(job.title, q) ||
      includesQuery(job.guest_name, q) ||
      includesQuery(job.interviewer_name, q)
    ) {
      results.push({
        id: `job-${job.id}`,
        kind: "job",
        title: job.title || "Untitled interview",
        snippet: `${job.interviewer_name || "Interviewer"} × ${job.guest_name || "Guest"}`,
        job_id: job.id,
        artifact_id: null,
        source_id: null,
      });
    }
  });

  transcripts.forEach((transcript) => {
    if (includesQuery(transcript.transcript_text, q)) {
      results.push({
        id: `transcript-${transcript.id}`,
        kind: "transcript",
        title: "Transcript match",
        snippet: buildSnippet(transcript.transcript_text, q),
        job_id: transcript.job_id,
        artifact_id: null,
        source_id: null,
      });
    }
  });

  artifacts.forEach((artifact) => {
    if (
      includesQuery(artifact.title, q) ||
      includesQuery(artifact.summary, q) ||
      includesQuery(artifact.content, q)
    ) {
      results.push({
        id: `artifact-${artifact.id}`,
        kind: "artifact",
        title: artifact.title,
        snippet: buildSnippet(artifact.summary || artifact.content, q),
        job_id: artifact.job_id,
        artifact_id: artifact.id,
        source_id: null,
      });
    }
  });

  sources.forEach((source) => {
    if (
      includesQuery(source.title, q) ||
      includesQuery(source.url, q) ||
      includesQuery(source.extracted_text, q)
    ) {
      results.push({
        id: `source-${source.id}`,
        kind: "source",
        title: source.title || source.url || "Imported source",
        snippet: buildSnippet(source.extracted_text || source.url, q),
        job_id: source.job_id,
        artifact_id: null,
        source_id: source.id,
      });
    }
  });

  return jsonOk({ results: results.slice(0, 20) });
}
