export type LiveQuestionCoachArtifact = {
  content?: string | null;
  summary?: string | null;
};

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function isJsonLike(text: string) {
  const trimmed = stripJsonFence(text);
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getReadableCoachText(value: unknown): string {
  if (typeof value === "string") {
    const cleaned = value.replace(/\s+/g, " ").trim();
    return isJsonLike(cleaned) ? "" : cleaned;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const record = value as Record<string, unknown>;
  const primary = ["follow_up", "how_to_ask", "question", "text", "content"]
    .map((key) => getReadableCoachText(record[key]))
    .find(Boolean);
  const title = getReadableCoachText(record.title);
  const secondary = ["narrative", "context", "reason", "status_reason"]
    .map((key) => getReadableCoachText(record[key]))
    .find(Boolean);

  if (title && primary && title !== primary) return `${title}: ${primary}`;
  return primary || title || secondary || "";
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function getQuestionCoachArtifactText(artifact: LiveQuestionCoachArtifact | null) {
  return artifact?.content?.trim() || artifact?.summary?.trim() || "";
}

export function formatLiveQuestionCoachPreview(artifact: LiveQuestionCoachArtifact | null, fallback: string) {
  const text = getQuestionCoachArtifactText(artifact);

  if (!text) return fallback;

  try {
    const parsed = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
    const poolA = parsed.pool_a as Record<string, unknown> | undefined;
    const poolB = parsed.pool_b as Record<string, unknown> | undefined;
    const candidates = [
      ...asArray(poolA?.items),
      poolA?.callback_to_pool_b,
      ...asArray(poolB?.current_state),
      ...asArray(poolB?.operations),
    ];
    const lines = candidates
      .map(getReadableCoachText)
      .filter(Boolean)
      .map((line) => (line.length > 120 ? `${line.slice(0, 117)}...` : line));

    return lines.length ? lines.slice(0, 3).map((line, index) => `${index + 1}. ${line}`).join(" ") : fallback;
  } catch {
    return isJsonLike(text) ? fallback : text.slice(0, 180);
  }
}
