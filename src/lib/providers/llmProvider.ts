/**
 * @file llmProvider.ts
 * @description OpenAI Responses API 调用封装，统一生成 KEMO 各类 artifact
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactKind } from "@/lib/workspace";

const LOG = "[LLM/GPT-5.2]";

type ArtifactInput = {
  transcriptText: string;
  glossaryTerms: string[];
  uncertainTerms: string[];
  sourceContext?: string;
  title?: string;
  guestName?: string;
  interviewerName?: string;
};

function renderPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function loadPrompt(fileName: string) {
  const filePath = path.join(process.cwd(), "prompts", fileName);
  const content = await fs.readFile(filePath, "utf-8");
  return content;
}

async function callOpenAI(prompt: string, label: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const endpoint = `${baseUrl}/responses`;
  const startTime = Date.now();

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
  const text =
    (typeof json.output_text === "string" && json.output_text) ||
    json?.output?.[0]?.content?.[0]?.text ||
    null;

  if (!text || typeof text !== "string") {
    throw new Error(`Unexpected OpenAI response for ${label}`);
  }

  console.log(`${LOG} ✓ ${label} 完成 (${elapsed}s) / ${text.length} chars`);
  return text;
}

function getPromptFile(kind: ArtifactKind) {
  const files: Record<ArtifactKind, string> = {
    publish_script: "publish_script.md",
    quick_summary: "quick_summary.md",
    key_insights: "key_insights.md",
    inspiration_questions: "inspiration_questions.md",
    podcast_script: "podcast_script.md",
    podcast_audio: "podcast_script.md",
    mind_map: "mind_map.md",
    ppt_outline: "ppt_outline.md",
    ic_qa: "ic_qa.md",
    wechat_article: "wechat_article.md",
  };

  return files[kind];
}

export async function generateArtifactText(kind: ArtifactKind, input: ArtifactInput) {
  const template = await loadPrompt(getPromptFile(kind));
  const prompt = renderPrompt(template, {
    transcript_text: input.transcriptText,
    glossary_terms: input.glossaryTerms.join(", "),
    uncertain_terms: input.uncertainTerms.join(", "),
    source_context: input.sourceContext || "",
    title: input.title || "",
    guest_name: input.guestName || "",
    interviewer_name: input.interviewerName || "",
  });

  return callOpenAI(prompt, kind);
}

export async function generateIcQa(input: ArtifactInput) {
  return generateArtifactText("ic_qa", input);
}

export async function generateWeChatArticle(input: ArtifactInput) {
  return generateArtifactText("wechat_article", input);
}
