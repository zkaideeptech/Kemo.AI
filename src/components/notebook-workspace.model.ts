import type { ArtifactKind } from "@/lib/workspace";

export type WorkspaceSection =
  | "projects"
  | "jobs"
  | "live"
  | "sources"
  | "artifacts"
  | "favorites"
  | "help"
  | "settings";

export type ArtifactDefinition = {
  kind: ArtifactKind;
  label: string;
  shortLabel: string;
  description: string;
  accent: "primary" | "secondary" | "tertiary";
  downloadable?: boolean;
};

export const WORKSPACE_NAV_ITEMS: Array<{
  id: WorkspaceSection;
  label: string;
  icon: string;
}> = [
  { id: "projects", label: "Projects", icon: "folder_open" },
  { id: "jobs", label: "Jobs", icon: "work_outline" },
  { id: "live", label: "Live Capture", icon: "mic" },
  { id: "sources", label: "Sources", icon: "book_2" },
  { id: "artifacts", label: "Artifacts", icon: "summarize" },
  { id: "favorites", label: "Favorites", icon: "star" },
  { id: "help", label: "Help", icon: "help_outline" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export const SUPPORTED_ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  {
    kind: "publish_script",
    label: "Publish Script",
    shortLabel: "Script",
    description: "Polished interview narrative generated from the transcript and project context.",
    accent: "primary",
  },
  {
    kind: "quick_summary",
    label: "Quick Summary",
    shortLabel: "Summary",
    description: "Compact synthesis for catching up on the session quickly.",
    accent: "secondary",
  },
  {
    kind: "inspiration_questions",
    label: "Question Coach",
    shortLabel: "Questions",
    description: "Follow-up questions grounded in the latest transcript.",
    accent: "secondary",
  },
  {
    kind: "meeting_minutes",
    label: "Meeting Minutes",
    shortLabel: "Minutes",
    description: "Structured minutes that can be exported as a document.",
    accent: "primary",
    downloadable: true,
  },
  {
    kind: "roadshow_transcript",
    label: "Roadshow Transcript",
    shortLabel: "Roadshow",
    description: "Clean long-form transcript prepared for presentation or sharing.",
    accent: "primary",
    downloadable: true,
  },
  {
    kind: "ic_qa",
    label: "IC Q&A",
    shortLabel: "IC Q&A",
    description: "Investor and research committee style questions and answers.",
    accent: "tertiary",
  },
  {
    kind: "wechat_article",
    label: "WeChat Article",
    shortLabel: "Article",
    description: "Public-facing article draft generated from the research material.",
    accent: "tertiary",
  },
];

export const SUPPORTED_ARTIFACT_KINDS = SUPPORTED_ARTIFACT_DEFINITIONS.map(
  (definition) => definition.kind
);

export function getArtifactDefinition(kind: string) {
  return (
    SUPPORTED_ARTIFACT_DEFINITIONS.find((definition) => definition.kind === kind) || {
      kind: "quick_summary" as ArtifactKind,
      label: "Artifact",
      shortLabel: "Artifact",
      description: "Generated research output.",
      accent: "primary" as const,
    }
  );
}

export function formatCount(value: number) {
  if (value >= 1000) {
    const compact = value / 1000;
    return `${compact.toFixed(compact >= 10 ? 0 : 1)}k`;
  }

  return String(value);
}
