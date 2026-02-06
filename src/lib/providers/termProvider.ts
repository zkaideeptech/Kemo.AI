export type TermCandidate = {
  term: string;
  confidence: number;
  source: "rule" | "llm";
  context?: string;
};

// Seed layer (cold start)
export async function getSeedTerms(): Promise<string[]> {
  // TODO: load from DB or offline import (seed dataset)
  return [];
}

// Memory layer (user-confirmed glossary)
export async function getMemoryTerms(): Promise<string[]> {
  // TODO: load from glossary_terms for the current user
  return [];
}

export async function extractTerms({
  transcriptText,
  glossaryTerms,
}: {
  transcriptText: string;
  glossaryTerms: string[];
}): Promise<{ candidates: TermCandidate[] }> {
  const candidates: TermCandidate[] = [];
  const seen = new Set<string>();

  const glossarySet = new Set(glossaryTerms.map((t) => t.toLowerCase()));
  const contextWindow = 40;
  const getContext = (term: string) => {
    const index = transcriptText.indexOf(term);
    if (index === -1) return undefined;
    const start = Math.max(0, index - contextWindow);
    const end = Math.min(transcriptText.length, index + term.length + contextWindow);
    return transcriptText.slice(start, end);
  };

  // Rule-based: glossary terms present in transcript
  for (const term of glossaryTerms) {
    if (term && transcriptText.includes(term) && !seen.has(term.toLowerCase())) {
      seen.add(term.toLowerCase());
      candidates.push({ term, confidence: 0.9, source: "rule", context: getContext(term) });
    }
  }

  // Rule-based: capitalized or acronym-like tokens
  const regex = /\b[A-Z][A-Za-z0-9-]{2,}\b/g;
  const matches = transcriptText.match(regex) || [];
  for (const match of matches) {
    const key = match.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      term: match,
      confidence: glossarySet.has(key) ? 0.9 : 0.6,
      source: "rule",
      context: getContext(match),
    });
  }

  // LLM stub (reserved)
  // TODO: call LLM to extract more candidate terms with confidence

  return { candidates };
}

// Reserved: search + wikidata providers
export async function searchTerms(_query: string) {
  void _query;
  return [] as string[];
}

export async function resolveWikidataAliases(_term: string) {
  void _term;
  return [] as string[];
}
