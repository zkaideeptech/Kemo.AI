import { requireUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildLegacyArtifacts,
  ensureDefaultProject,
  type ArtifactRow,
  type FavoriteRow,
  type JobRow,
  type ProjectRow,
  type SourceRow,
  type TranscriptRow,
  type WorkspaceArtifact,
} from "@/lib/workspace";
import { NotebookWorkspace } from "@/components/notebook-workspace";

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const supabase = await createSupabaseServerClient();
  const plan = await getUserPlan(supabase, user.id);

  const defaultProject = await ensureDefaultProject(supabase, user.id);

  const [{ data: projects }, { data: jobs }, { data: transcripts }, { data: memos }, { data: artifacts }, { data: favorites }, { data: sources }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("jobs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("transcripts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("memos").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("artifacts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("favorites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("sources").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);

  const safeProjects = projects?.length ? projects : [defaultProject];
  const safeProjectsTyped = safeProjects as ProjectRow[];
  const safeJobs = (jobs || []) as JobRow[];
  const safeTranscripts = (transcripts || []) as TranscriptRow[];
  const safeMemos = (memos || []) as Array<{
    id: string;
    user_id: string;
    job_id: string | null;
    ic_qa_text: string | null;
    wechat_article_text: string | null;
    created_at: string;
  }>;
  const safeArtifacts = (artifacts || []) as ArtifactRow[];
  const safeFavorites = (favorites || []) as FavoriteRow[];
  const safeSources = (sources || []) as SourceRow[];

  const legacyArtifacts: WorkspaceArtifact[] = safeJobs.flatMap((job) => {
    const transcript = safeTranscripts.find((item) => item.job_id === job.id) || null;
    const memo = safeMemos.find((item) => item.job_id === job.id) || null;

    return buildLegacyArtifacts({
      job,
      transcript,
      memo,
    }).map((artifact) => ({
      user_id: user.id,
      project_id: job.project_id,
      job_id: job.id,
      metadata: null,
      audio_url: null,
      is_favorite: false,
      isLegacy: true,
      ...artifact,
    })) as WorkspaceArtifact[];
  });

  return (
    <NotebookWorkspace
      locale={locale}
      userEmail={user.email || null}
      plan={plan}
      projects={safeProjectsTyped}
      jobs={safeJobs}
      transcripts={safeTranscripts}
      artifacts={[...(safeArtifacts as WorkspaceArtifact[]), ...legacyArtifacts]}
      favorites={safeFavorites}
      sources={safeSources}
    />
  );
}
