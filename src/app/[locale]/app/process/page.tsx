import { KemoWorkspace } from "@/components/kemo-workspace";
import { loadWorkspacePageData } from "@/lib/server/workspace-page-data";

export default async function ProcessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const workspace = await loadWorkspacePageData(locale);
  const requestedJobId =
    typeof query.job === "string" && workspace.jobs.some((job) => job.id === query.job) ? query.job : null;

  return (
    <KemoWorkspace
      locale={locale}
      landing="processing"
      plan={workspace.plan}
      projects={workspace.projects}
      jobs={workspace.jobs}
      transcripts={workspace.transcripts}
      artifacts={workspace.workspaceArtifacts}
      favorites={workspace.favorites}
      sources={workspace.sources}
      initialJobId={requestedJobId}
    />
  );
}
