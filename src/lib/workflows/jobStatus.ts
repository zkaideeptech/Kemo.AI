export const JOB_STATUS = {
  pending: "pending",
  queued: "queued",
  transcribing: "transcribing",
  extracting_terms: "extracting_terms",
  needs_review: "needs_review",
  summarizing: "summarizing",
  completed: "completed",
  failed: "failed",
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

