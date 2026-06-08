export type TermCandidate = {
  term: string;
  confidence: number;
  source: "rule" | "llm";
  context?: string;
};

// Seed layer (cold start)
export async function getSeedTerms(): Promise<string[]> {
  return [];
}

// Memory layer (user-confirmed glossary)
export async function getMemoryTerms(): Promise<string[]> {
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

  // Rule-based: capitalized/acronym tokens and common Chinese business terms.
  const regex = /\b[A-Z][A-Za-z0-9-]{2,}\b|[\u4e00-\u9fffA-Za-z0-9]{2,}(?:模型|平台|指标|系统|策略|流程|接口|数据源|工作台|过滤器|搜索|转写|摘要|纪要|问答|访谈|资料|项目|任务)/g;
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
