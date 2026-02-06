/**
 * @file test-asr.ts
 * @description ASR 服务独立验证脚本
 *              使用 DashScope 官方公开测试音频验证 Qwen3-ASR-1.7B 调用链路
 * @usage npx tsx scripts/test-asr.ts
 * @author KEMO
 * @created 2026-02-06
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ============================================================
// 直接内联 ASR 调用（不依赖 Next.js 运行时）
// ============================================================

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const FILETRANS_MODEL = "qwen3-asr-flash-filetrans";

/** DashScope 官方公开测试音频 */
const TEST_AUDIO_URL =
  "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3";

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 60;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = process.env.DASHSCOPE_API_BASE_URL || DEFAULT_BASE_URL;

  console.log("========================================");
  console.log("  KEMO ASR 验证脚本");
  console.log("========================================");
  console.log(`API Key: ${apiKey ? apiKey.slice(0, 8) + "..." : "❌ 缺失"}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${FILETRANS_MODEL} (Qwen3-ASR-1.7B)`);
  console.log(`Test Audio: ${TEST_AUDIO_URL}`);
  console.log("========================================\n");

  if (!apiKey) {
    console.error("❌ DASHSCOPE_API_KEY 未设置，请检查 .env.local");
    process.exit(1);
  }

  // 第一步：提交转写任务
  console.log("▶ 步骤 1/3: 提交转写任务...");

  const endpoint = `${baseUrl}/services/audio/asr/transcription`;

  const submitRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: FILETRANS_MODEL,
      input: { file_url: TEST_AUDIO_URL },
      parameters: { channel_id: [0], enable_words: true },
    }),
  });

  const submitJson = await submitRes.json();

  if (!submitRes.ok) {
    console.error("❌ 提交失败:", JSON.stringify(submitJson, null, 2));
    process.exit(1);
  }

  const taskId = submitJson?.output?.task_id;
  if (!taskId) {
    console.error("❌ 响应缺少 task_id:", JSON.stringify(submitJson, null, 2));
    process.exit(1);
  }

  console.log(`✓ 任务已提交`);
  console.log(`  task_id: ${taskId}`);
  console.log(`  request_id: ${submitJson?.request_id || "N/A"}\n`);

  // 第二步：轮询任务状态
  console.log("▶ 步骤 2/3: 轮询任务状态...");

  let attempt = 0;
  let finalResult: Record<string, unknown> | null = null;

  while (attempt < MAX_ATTEMPTS) {
    await sleep(POLL_INTERVAL_MS);
    attempt++;

    const pollRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const pollJson = await pollRes.json();
    const status = pollJson?.output?.task_status;

    process.stdout.write(`  [${attempt}/${MAX_ATTEMPTS}] 状态: ${status}\r`);

    if (status === "SUCCEEDED") {
      console.log(`\n✓ 转写完成 (${attempt * POLL_INTERVAL_MS / 1000}s)`);
      finalResult = pollJson;
      break;
    }

    if (status === "FAILED") {
      console.error("\n❌ 转写失败:", JSON.stringify(pollJson, null, 2));
      process.exit(1);
    }
  }

  if (!finalResult) {
    console.error("\n❌ 轮询超时");
    process.exit(1);
  }

  // 第三步：获取转写文本
  console.log("\n▶ 步骤 3/3: 获取转写文本...");

  const transcriptionUrl = (finalResult as any)?.output?.result?.transcription_url;

  if (transcriptionUrl) {
    console.log(`  transcription_url: ${transcriptionUrl.slice(0, 80)}...`);
    const transRes = await fetch(transcriptionUrl);
    const transJson = await transRes.json();

    // 提取文本
    const transcripts = (transJson as any)?.transcripts;
    let text = "";
    if (Array.isArray(transcripts)) {
      for (const t of transcripts) {
        if (typeof t.text === "string") {
          text += t.text;
        } else if (Array.isArray(t.sentences)) {
          for (const s of t.sentences) {
            if (typeof s.text === "string") text += s.text;
          }
        }
      }
    }

    if (!text) {
      text = JSON.stringify(transJson);
    }

    console.log("\n========================================");
    console.log("  转写结果");
    console.log("========================================");
    console.log(text);
    console.log("========================================");
    console.log(`字符数: ${text.length}`);
  } else {
    console.log("  无 transcription_url，直接输出:");
    console.log(JSON.stringify(finalResult, null, 2));
  }

  console.log("\n✅ ASR 验证通过！");
}

main().catch((err) => {
  console.error("❌ 脚本异常:", err);
  process.exit(1);
});
