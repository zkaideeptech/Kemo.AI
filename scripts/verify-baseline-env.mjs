import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const timeoutMs = 15_000;

const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "TAVILY_API_KEY",
  "TAVILY_BASE_URL",
  "FIRECRAWL_API_KEY",
  "FIRECRAWL_BASE_URL",
  "DASHSCOPE_API_KEY",
  "DASHSCOPE_API_BASE_URL",
  "SUPABASE_STORAGE_BUCKET_AUDIO",
];

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function scrub(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[REDACTED]")
    .slice(0, 600);
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = text;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text.slice(0, 300);
    }

    if (!response.ok) {
      const summary = typeof body === "string" ? body : JSON.stringify(body);
      throw new Error(`HTTP ${response.status}: ${summary}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function check(name, run) {
  const start = Date.now();

  try {
    const detail = await run();
    console.log(`PASS ${name} (${Date.now() - start}ms) - ${detail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} (${Date.now() - start}ms) - ${scrub(message)}`);
    process.exitCode = 1;
  }
}

for (const name of requiredVars) {
  required(name);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const audioBucket = process.env.SUPABASE_STORAGE_BUCKET_AUDIO || "audio";

await check("Supabase auth", async () => {
  await requestJson(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
  });
  return "auth endpoint reachable";
});

await check("Supabase projects REST", async () => {
  await requestJson(`${supabaseUrl}/rest/v1/projects?select=id&limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
  });
  return "projects table reachable under current RLS";
});

await check("Supabase storage", async () => {
  const buckets = await requestJson(`${supabaseUrl}/storage/v1/bucket`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const bucketExists = Array.isArray(buckets) && buckets.some((bucket) => bucket?.name === audioBucket);

  if (!bucketExists) {
    throw new Error(`Storage bucket '${audioBucket}' not found`);
  }

  return `bucket '${audioBucket}' exists`;
});

await check("OpenAI-compatible models", async () => {
  const baseUrl = required("OPENAI_BASE_URL").replace(/\/$/, "");
  const apiKey = required("OPENAI_API_KEY");
  const model = required("OPENAI_MODEL");
  const body = await requestJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const modelExists = Array.isArray(body?.data) && body.data.some((item) => item?.id === model);

  if (!modelExists) {
    throw new Error(`Configured OPENAI_MODEL '${model}' was not listed by the models endpoint`);
  }

  return `model '${model}' listed`;
});

await check("Tavily search", async () => {
  const baseUrl = required("TAVILY_BASE_URL").replace(/\/$/, "");
  const apiKey = required("TAVILY_API_KEY");
  await requestJson(`${baseUrl}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: "connectivity test", max_results: 1 }),
  });
  return "search endpoint reachable";
});

await check("Firecrawl scrape", async () => {
  const baseUrl = required("FIRECRAWL_BASE_URL").replace(/\/$/, "");
  const apiKey = required("FIRECRAWL_API_KEY");
  await requestJson(`${baseUrl}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
  });
  return "scrape endpoint reachable";
});

await check("DashScope text generation", async () => {
  const baseUrl = required("DASHSCOPE_API_BASE_URL").replace(/\/$/, "");
  const apiKey = required("DASHSCOPE_API_KEY");
  await requestJson(`${baseUrl}/services/aigc/text-generation/generation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "qwen-turbo",
      input: { messages: [{ role: "user", content: "ping" }] },
      parameters: { max_tokens: 8 },
    }),
  });
  return "generation endpoint reachable";
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
