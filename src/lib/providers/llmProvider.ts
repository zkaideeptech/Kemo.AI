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
  publishScriptText?: string;
  isLiveDraft?: boolean;
};

function renderPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function loadTextFile(folder: string, fileName: string) {
  const filePath = path.join(process.cwd(), folder, fileName);
  const content = await fs.readFile(filePath, "utf-8");
  return content;
}

async function loadPrompt(fileName: string) {
  return loadTextFile("prompts", fileName);
}

async function loadSkillPrompt(skillDir: string) {
  return loadTextFile(path.join("skills", skillDir), "SKILL.md");
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
    roadshow_transcript: "publish_script.md",
    meeting_minutes: "publish_script.md",
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

function isSkillBackedArtifact(kind: ArtifactKind) {
  return ["publish_script", "roadshow_transcript", "meeting_minutes"].includes(kind);
}

async function buildSkillBackedPrompt(kind: ArtifactKind, input: ArtifactInput) {
  const skillDirMap: Record<ArtifactKind, string> = {
    publish_script: "00-interview-editor",
    roadshow_transcript: "01-roadshow-transcript",
    meeting_minutes: "02-meeting-minutes",
    quick_summary: "00-interview-editor",
    key_insights: "00-interview-editor",
    inspiration_questions: "00-interview-editor",
    podcast_script: "00-interview-editor",
    podcast_audio: "00-interview-editor",
    mind_map: "00-interview-editor",
    ppt_outline: "00-interview-editor",
    ic_qa: "00-interview-editor",
    wechat_article: "00-interview-editor",
  };

  const skillText = await loadSkillPrompt(skillDirMap[kind]);
  const sourceBlock = input.sourceContext?.trim()
    ? `\n[补充来源，仅用于名词校对或结构补强]\n${input.sourceContext.trim()}\n`
    : "";

  if (kind === "publish_script") {
    return [
      "你正在执行 KEMO 的正式 skill。严格遵循以下 skill 说明，不要省略规则。",
      skillText,
      "",
      "[运行模式]",
      input.isLiveDraft ? "当前是实时流式草稿更新。允许保留待确认项，但必须持续产出可发布对话稿草稿。" : "当前是最终整理模式。请输出最终版可发布对话稿。",
      "",
      "[结构化输入]",
      `标题线索：${input.title || ""}`,
      `采访者：${input.interviewerName || ""}`,
      `嘉宾：${input.guestName || ""}`,
      `已确认术语：${input.glossaryTerms.join(", ") || "无"}`,
      `待确认术语：${input.uncertainTerms.join(", ") || "无"}`,
      sourceBlock,
      "[原始转写稿]",
      input.transcriptText,
      "",
      "[输出要求]",
      "直接输出结果正文，不要解释执行过程。",
    ].join("\n");
  }

  const upstreamScript = input.publishScriptText?.trim() || input.transcriptText.trim();

  return [
    "你正在执行 KEMO 的正式 skill。严格遵循以下 skill 说明，不要省略规则。",
    skillText,
    "",
    "[上游输入说明]",
    "以下内容优先视为 00-interview-editor 产出的可发布对话稿；若仍有待确认项，请在不编造信息的前提下继续整理。",
    `标题线索：${input.title || ""}`,
    `采访者：${input.interviewerName || ""}`,
    `嘉宾：${input.guestName || ""}`,
    sourceBlock,
    "[可发布对话稿]",
    upstreamScript,
    "",
    "[输出要求]",
    "输出完整正文内容本身，不要补充解释。该正文后续会被导出为 docx。",
  ].join("\n");
}

export async function generateArtifactText(kind: ArtifactKind, input: ArtifactInput) {
  const prompt = isSkillBackedArtifact(kind)
    ? await buildSkillBackedPrompt(kind, input)
    : renderPrompt(await loadPrompt(getPromptFile(kind)), {
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
