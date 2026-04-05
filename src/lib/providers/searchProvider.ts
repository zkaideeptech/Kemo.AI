export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  source?: string | null;
};

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  source?: string | null;
};

const DEFAULT_TAVILY_BASE_URL = "https://api.tavily.com";

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY || "";
  const baseUrl = process.env.TAVILY_BASE_URL || DEFAULT_TAVILY_BASE_URL;

  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY");
  }

  const res = await fetch(`${baseUrl}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      topic: "general",
      search_depth: "basic",
      max_results: 6,
      include_raw_content: false,
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      json?.error || json?.message || `Tavily search failed with status ${res.status}`
    );
  }

  const results = Array.isArray(json?.results) ? json.results : [];

  return (results as TavilyResult[]).map((result) => ({
    title: typeof result?.title === "string" ? result.title : "Untitled result",
    url: typeof result?.url === "string" ? result.url : "",
    snippet: typeof result?.content === "string" ? result.content : "",
    source: typeof result?.source === "string" ? result.source : null,
  })).filter((result) => result.url);
}
