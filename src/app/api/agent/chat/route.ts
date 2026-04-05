import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const LOG = "[Agent]";

async function callLlm(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const apiStyle = process.env.OPENAI_API_STYLE || "auto";
  const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || "";
  const dashscopeBaseUrl =
    process.env.DASHSCOPE_LLM_BASE_URL ||
    "https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1";
  const dashscopeModel = process.env.DASHSCOPE_LLM_MODEL || "qwen3.5-plus";

  async function callChat(key: string, url: string, m: string, provider: string) {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: m,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`${provider} ${res.status}`);
    const json = await res.json();
    return json?.choices?.[0]?.message?.content || "";
  }

  async function callResponses(key: string, url: string, m: string, provider: string) {
    const res = await fetch(`${url}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, input: prompt, temperature: 0.3 }),
    });
    if (!res.ok) throw new Error(`${provider} ${res.status}`);
    const json = await res.json();
    const messageText = Array.isArray(json?.output)
      ? json.output
          .filter((item: { type?: string }) => item?.type === "message")
          .flatMap((item: { content?: Array<{ text?: string }> }) => item.content || [])
          .map((part: { text?: string }) => part?.text || "")
          .filter(Boolean)
          .join("\n")
      : "";
    return json?.output_text || messageText || json?.choices?.[0]?.message?.content || "";
  }

  // 优先 OpenAI
  if (apiKey) {
    try {
      if (apiStyle === "chat") return await callChat(apiKey, baseUrl, model, "OpenAI");
      try {
        return await callResponses(apiKey, baseUrl, model, "OpenAI");
      } catch {
        return await callChat(apiKey, baseUrl, model, "OpenAI");
      }
    } catch (err) {
      if (!dashscopeApiKey) throw err;
      console.warn(`${LOG} OpenAI 回退 DashScope`);
    }
  }

  if (dashscopeApiKey) {
    try {
      return await callResponses(dashscopeApiKey, dashscopeBaseUrl, dashscopeModel, "DashScope");
    } catch {
      return await callChat(dashscopeApiKey, dashscopeBaseUrl, dashscopeModel, "DashScope");
    }
  }

  throw new Error("No LLM API key");
}

// GET: 获取知识库统计
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("stats") === "1") {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ stats: { totalDocs: 0, totalChars: 0, lastUpdated: null } });

      const { count: jobCount } = await supabase.from("jobs").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const { count: artifactCount } = await supabase.from("artifacts").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const { data: latestJob } = await supabase.from("jobs").select("updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();

      return NextResponse.json({
        stats: {
          totalDocs: (jobCount || 0) + (artifactCount || 0),
          totalChars: 0, // 后续可增加文本量统计
          lastUpdated: latestJob?.updated_at || null,
        },
      });
    } catch {
      return NextResponse.json({ stats: { totalDocs: 0, totalChars: 0, lastUpdated: null } });
    }
  }
  return NextResponse.json({ ok: true });
}

// POST: 知识库问答
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 检索知识库：取最近的转写 + artifact 内容
    const { data: recentTranscripts } = await supabase
      .from("transcripts")
      .select("transcript_text, job_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: recentArtifacts } = await supabase
      .from("artifacts")
      .select("kind, title, content, summary, job_id, created_at")
      .eq("user_id", user.id)
      .in("kind", ["quick_summary", "meeting_minutes", "publish_script", "inspiration_questions"])
      .order("created_at", { ascending: false })
      .limit(30);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, guest_name, project_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const { data: projects } = await supabase
      .from("projects")
      .select("id, title")
      .eq("user_id", user.id);

    // 构建带有搜索相关性的知识上下文
    const questionLower = question.toLowerCase();
    const keywords = questionLower.split(/[\s,，。？！、]+/).filter((k: string) => k.length >= 2);

    // 简单文本相关性评分
    function relevanceScore(text: string): number {
      if (!text) return 0;
      const lower = text.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score += 1;
      }
      return score;
    }

    // 构建上下文片段
    type ContextChunk = { text: string; score: number; label: string };
    const contextChunks: ContextChunk[] = [];

    // 添加项目和任务概览
    const projectMap = new Map((projects || []).map((p: any) => [p.id, p.title]));
    const jobSummary = (jobs || []).map((j: any) => {
      const pTitle = j.project_id ? projectMap.get(j.project_id) || "" : "";
      return `- 访谈「${j.title || "未命名"}」嘉宾:${j.guest_name || "未知"} 项目:${pTitle} 时间:${j.created_at.slice(0, 10)}`;
    }).join("\n");

    if (jobSummary) {
      contextChunks.push({
        text: `[访谈列表]\n${jobSummary}`,
        score: 1,
        label: "job-list",
      });
    }

    // 添加 artifact 内容
    for (const art of (recentArtifacts || [])) {
      const content = art.summary || (art.content || "").slice(0, 3000);
      if (!content.trim()) continue;
      const jobInfo = (jobs || []).find((j: any) => j.id === art.job_id);
      const label = `${art.kind}:${jobInfo?.title || ""}`;
      contextChunks.push({
        text: `[${art.kind} - ${jobInfo?.title || "未知"}]\n${content}`,
        score: relevanceScore(content) + relevanceScore(art.title || ""),
        label,
      });
    }

    // 添加转写内容（截断到前 2000 字）
    for (const t of (recentTranscripts || [])) {
      const text = (t.transcript_text || "").slice(0, 2000);
      if (!text.trim()) continue;
      const jobInfo = (jobs || []).find((j: any) => j.id === t.job_id);
      contextChunks.push({
        text: `[转写 - ${jobInfo?.title || "未知"}]\n${text}`,
        score: relevanceScore(text),
        label: `transcript:${jobInfo?.title || ""}`,
      });
    }

    // 排序并截取 top 上下文
    contextChunks.sort((a, b) => b.score - a.score);
    let totalChars = 0;
    const maxContextChars = 24000; // 控制在 2.4 万字以内
    const selectedChunks: string[] = [];
    for (const chunk of contextChunks) {
      if (totalChars + chunk.text.length > maxContextChars) {
        const remaining = maxContextChars - totalChars;
        if (remaining > 200) selectedChunks.push(chunk.text.slice(0, remaining) + "...");
        break;
      }
      selectedChunks.push(chunk.text);
      totalChars += chunk.text.length;
    }

    const systemPrompt = [
      "你是 Kemo 知识 Agent，拥有用户所有访谈记录作为知识库。",
      "你只能基于以下知识库内容回答问题，绝不编造信息。",
      "如果知识库中没有相关信息，请如实说明。",
      "回答要简洁、精准、有条理、使用中文。",
      "",
      "===知识库===",
      selectedChunks.join("\n\n"),
      "===END===",
      "",
      `用户问题：${question}`,
      "",
      "请基于知识库内容回答：",
    ].join("\n");

    console.log(`${LOG} 问答请求: ${question.slice(0, 60)}... | 上下文 ${totalChars} 字 | ${selectedChunks.length} 片段`);

    const answer = await callLlm(systemPrompt);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${LOG} ✓ 回答完成 (${elapsed}s) | ${answer.length} chars`);

    return NextResponse.json({ ok: true, answer });
  } catch (error) {
    console.error(`${LOG} ✗ 问答失败:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent error" },
      { status: 500 }
    );
  }
}
