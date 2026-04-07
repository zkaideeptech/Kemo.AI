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

  if (id !== "all") {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!project) {
      return jsonError("not_found", "Project not found", { status: 404 });
    }
  }

  const jobsQuery = supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (id !== "all") {
    jobsQuery.eq("project_id", id);
  }
  const { data: jobsData } = await jobsQuery;

  const jobs = (jobsData || []) as JobRow[];
  const jobIds = jobs.map((job) => job.id);

  const transcriptsQuery = jobIds.length > 0
    ? supabase.from("transcripts").select("*").in("job_id", jobIds).order("created_at", { ascending: false })
    : Promise.resolve({ data: [] as TranscriptRow[], error: null });

  const artifactsQuery = supabase.from("artifacts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  const sourcesQuery = supabase.from("sources").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

  if (id !== "all") {
    artifactsQuery.eq("project_id", id);
    sourcesQuery.eq("project_id", id);
  }

  const [transcriptsData, artifactsData, sourcesData] = await Promise.all([
    transcriptsQuery,
    artifactsQuery,
    sourcesQuery,
  ]);

  const transcripts = (transcriptsData.data || []) as TranscriptRow[];
  const artifacts = (artifactsData.data || []) as ArtifactRow[];
  const sources = (sourcesData.data || []) as SourceRow[];

  const matchedJobs = new Map<string, ProjectSearchResult>();

  jobs.forEach((job) => {
    let snippetItem = `${job.interviewer_name || "Interviewer"} × ${job.guest_name || "Guest"}`;
    if (includesQuery(job.title, q)) snippetItem = "标题命中";
    else if (includesQuery(job.guest_name, q) || includesQuery(job.interviewer_name, q)) snippetItem = "被访者/访谈者命中";

    if (
      includesQuery(job.title, q) ||
      includesQuery(job.guest_name, q) ||
      includesQuery(job.interviewer_name, q)
    ) {
      matchedJobs.set(job.id, {
        id: `job-${job.id}`,
        kind: "job",
        title: job.title || "Untitled interview",
        snippet: snippetItem,
        job_id: job.id,
        artifact_id: null,
        source_id: null,
      });
    }
  });

  transcripts.forEach((transcript) => {
    if (includesQuery(transcript.transcript_text, q) && transcript.job_id) {
      const parentJob = jobs.find(j => j.id === transcript.job_id);
      if (parentJob && !matchedJobs.has(transcript.job_id)) {
        matchedJobs.set(transcript.job_id, {
          id: `job-${parentJob.id}`,
          kind: "job",
          title: parentJob.title || "Untitled interview",
          snippet: buildSnippet(transcript.transcript_text, q),
          job_id: parentJob.id,
          artifact_id: null,
          source_id: null,
        });
      } else if (parentJob) {
        // If already matched, prefer transcript snippet if it has the actual text
        const existing = matchedJobs.get(transcript.job_id)!;
        existing.snippet = buildSnippet(transcript.transcript_text, q);
      }
    }
  });

  artifacts.forEach((artifact) => {
    if (
        (includesQuery(artifact.title, q) ||
        includesQuery(artifact.summary, q) ||
        includesQuery(artifact.content, q)) && artifact.job_id
    ) {
      const parentJob = jobs.find(j => j.id === artifact.job_id);
      if (parentJob && !matchedJobs.has(artifact.job_id)) {
        matchedJobs.set(artifact.job_id, {
          id: `job-${parentJob.id}`,
          kind: "job",
          title: parentJob.title || "Untitled interview",
          snippet: buildSnippet(artifact.summary || artifact.content, q),
          job_id: parentJob.id,
          artifact_id: null,
          source_id: null,
        });
      }
    }
  });

  sources.forEach((source) => {
    if (
      (includesQuery(source.title, q) ||
        includesQuery(source.url, q) ||
        includesQuery(source.extracted_text, q)) && source.job_id
    ) {
      const parentJob = jobs.find(j => j.id === source.job_id);
      if (parentJob && !matchedJobs.has(source.job_id)) {
        matchedJobs.set(source.job_id, {
          id: `job-${parentJob.id}`,
          kind: "job",
          title: parentJob.title || "Untitled interview",
          snippet: buildSnippet(source.extracted_text || source.url, q),
          job_id: parentJob.id,
          artifact_id: null,
          source_id: null,
        });
      }
    }
  });

  const results = Array.from(matchedJobs.values());

  return jsonOk({ results: results.slice(0, 20) });
}
