import type { Json } from "@/lib/supabase/types";

const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeWithFirecrawl(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY || "";
  const baseUrl = process.env.FIRECRAWL_BASE_URL || DEFAULT_FIRECRAWL_BASE_URL;

  if (!apiKey) {
    throw new Error("Missing FIRECRAWL_API_KEY");
  }

  const res = await fetch(`${baseUrl}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "html"],
      onlyMainContent: true,
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    throw new Error(
      json?.error || json?.message || `Firecrawl scrape failed with status ${res.status}`
    );
  }

  const metadata = json?.data?.metadata ?? {};
  const extractedText =
    typeof json?.data?.markdown === "string" && json.data.markdown.trim()
      ? json.data.markdown.trim()
      : typeof json?.data?.content === "string"
        ? json.data.content.trim()
        : "";

  return {
    title: typeof metadata?.title === "string" ? metadata.title : null,
    domain: typeof metadata?.ogUrl === "string"
      ? new URL(metadata.ogUrl).hostname.replace(/^www\./, "")
      : new URL(url).hostname.replace(/^www\./, ""),
    extractedText,
    rawText: typeof json?.data?.html === "string" ? json.data.html : null,
    metadata: metadata as Json,
    provider: "firecrawl",
  };
}

async function scrapeWithDirectFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KemoBot/1.0)",
    },
  });

  if (!res.ok) {
    throw new Error(`Direct fetch failed with status ${res.status}`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const extractedText = stripHtml(html);

  return {
    title: titleMatch?.[1]?.trim() || null,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    extractedText,
    rawText: null,
    metadata: {
      fallback: "direct_fetch",
    } as Json,
    provider: "direct_fetch",
  };
}

export async function extractSourceFromUrl(url: string) {
  try {
    return await scrapeWithFirecrawl(url);
  } catch (firecrawlError) {
    const fallback = await scrapeWithDirectFetch(url);

    return {
      ...fallback,
      metadata: {
        ...(typeof fallback.metadata === "object" && fallback.metadata ? fallback.metadata : {}),
        firecrawl_error:
          firecrawlError instanceof Error ? firecrawlError.message : "Unknown Firecrawl error",
      } as Json,
    };
  }
}
