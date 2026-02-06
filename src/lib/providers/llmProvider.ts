/**
 * @file llmProvider.ts
 * @description OpenAI GPT-5.2 调用封装（Responses API），生成 IC Q&A 纪要和公众号长文
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

import fs from "node:fs/promises";
import path from "node:path";

const LOG = "[LLM/GPT-5.2]";

/**
 * 渲染 prompt 模板中的 {{变量}}
 */
function renderPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * 加载 prompts/ 目录下的模板文件
 */
async function loadPrompt(fileName: string) {
  const filePath = path.join(process.cwd(), "prompts", fileName);
  console.log(`${LOG} 加载 prompt: ${fileName}`);
  const content = await fs.readFile(filePath, "utf-8");
  console.log(`${LOG} prompt 模板长度: ${content.length} 字符`);
  return content;
}

/**
 * 调用 OpenAI Responses API (GPT-5.2)
 * 端点: POST /v1/responses
 * 文档: https://platform.openai.com/docs/api-reference/responses
 *
 * @param prompt - 完整的 prompt 文本
 * @param label - 调用标签（用于日志标识）
 * @returns 模型返回的文本
 */
async function callOpenAI(prompt: string, label: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    console.error(`${LOG} ✗ 缺少 OPENAI_API_KEY`);
    throw new Error("Missing OPENAI_API_KEY");
  }

  const endpoint = `${baseUrl}/responses`;

  console.log(`${LOG} ╔══════════════════════════════════════`);
  console.log(`${LOG} ║ 调用 OpenAI [${label}]`);
  console.log(`${LOG} ║ 模型: ${model}`);
  console.log(`${LOG} ║ 端点: ${endpoint}`);
  console.log(`${LOG} ║ Prompt: ${prompt.length} 字符`);
  console.log(`${LOG} ╚══════════════════════════════════════`);

  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: prompt,
        temperature: 0.2,
      }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`${LOG} ✗ HTTP ${res.status} [${label}] (${elapsed}s)`);
      console.error(`${LOG}   响应: ${errBody.slice(0, 500)}`);
      throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = await res.json();

    // Responses API 格式: output_text 或 output[0].content[0].text
    const text =
      (typeof json.output_text === "string" && json.output_text) ||
      json?.output?.[0]?.content?.[0]?.text ||
      null;

    if (text && text.length > 0) {
      console.log(`${LOG} ✓ 返回 [${label}] (${elapsed}s)`);
      console.log(`${LOG}   输出: ${text.length} 字符`);
      console.log(`${LOG}   用量: ${JSON.stringify(json?.usage || "N/A")}`);
      console.log(`${LOG}   预览: ${text.slice(0, 100)}...`);
      return text;
    }

    console.warn(`${LOG} ⚠ 返回格式异常 [${label}] (${elapsed}s)`);
    console.warn(`${LOG}   原始:`, JSON.stringify(json).slice(0, 500));
    return JSON.stringify(json);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`${LOG} ✗ 调用异常 [${label}] (${elapsed}s):`, err);
    throw err;
  }
}

/**
 * 生成 IC Q&A 纪要
 */
export async function generateIcQa({
  transcriptText,
  glossaryTerms,
  uncertainTerms,
}: {
  transcriptText: string;
  glossaryTerms: string[];
  uncertainTerms: string[];
}) {
  console.log(`\n${LOG} ── 开始生成 IC Q&A 纪要 ──`);

  const template = await loadPrompt("ic_qa.md");
  const prompt = renderPrompt(template, {
    transcript_text: transcriptText,
    glossary_terms: glossaryTerms.join(", "),
    uncertain_terms: uncertainTerms.join(", "),
  });

  return callOpenAI(prompt, "IC Q&A");
}

/**
 * 生成公众号长文
 */
export async function generateWeChatArticle({
  transcriptText,
  glossaryTerms,
  uncertainTerms,
}: {
  transcriptText: string;
  glossaryTerms: string[];
  uncertainTerms: string[];
}) {
  console.log(`\n${LOG} ── 开始生成公众号长文 ──`);

  const template = await loadPrompt("wechat_article.md");
  const prompt = renderPrompt(template, {
    transcript_text: transcriptText,
    glossary_terms: glossaryTerms.join(", "),
    uncertain_terms: uncertainTerms.join(", "),
  });

  return callOpenAI(prompt, "公众号长文");
}
