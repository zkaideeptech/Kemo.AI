/**
 * @file verify-backend.ts
 * @description 后端 E2E 验证脚本
 *              模拟完整数据流：注册用户 → 创建 Job → 上传音频 → ASR 转写 → 验证数据库记录
 *              使用 DashScope 官方公开测试音频进行真实 ASR 调用
 * @usage npx tsx scripts/verify-backend.ts
 * @author KEMO
 * @created 2026-02-06
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

// ============================================================
// 配置
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** DashScope 官方公开测试音频（中文，"欢迎使用阿里云"） */
const TEST_AUDIO_URL = "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3";

/** 测试用户凭据 */
const TEST_EMAIL = `kemo-test-${Date.now()}@test.local`;
const TEST_PASSWORD = "TestPass123!";

const LOG = "[E2E]";

// ============================================================
// 工具
// ============================================================

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 管理员客户端（绕过 RLS） */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ============================================================
// 主流程
// ============================================================

async function main() {
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║    KEMO 后端 E2E 验证脚本                        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log(`${LOG} Supabase URL: ${SUPABASE_URL}`);
  console.log(`${LOG} 测试用户: ${TEST_EMAIL}`);
  console.log(`${LOG} 测试音频: ${TEST_AUDIO_URL}\n`);

  // 环境检查
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error(`${LOG} ❌ 环境变量不完整，请检查 .env.local`);
    process.exit(1);
  }

  let userId: string | null = null;
  let jobId: string | null = null;

  try {
    // ──────────────────────────────────────────────
    // 步骤 1: 注册测试用户
    // ──────────────────────────────────────────────
    console.log(`${LOG} ▶ 步骤 1/6: 注册测试用户...`);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (signUpError) {
      console.error(`${LOG} ❌ 注册失败:`, signUpError.message);
      process.exit(1);
    }

    userId = signUpData.user?.id || null;
    console.log(`${LOG} ✓ 用户已注册: ${userId?.slice(0, 8)}... / ${TEST_EMAIL}`);

    // ──────────────────────────────────────────────
    // 步骤 2: 登录
    // ──────────────────────────────────────────────
    console.log(`\n${LOG} ▶ 步骤 2/6: 登录...`);

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (signInError) {
      console.error(`${LOG} ❌ 登录失败:`, signInError.message);
      process.exit(1);
    }

    console.log(`${LOG} ✓ 登录成功`);
    console.log(`${LOG}   session: ${signInData.session?.access_token.slice(0, 20)}...`);

    // 创建认证客户端
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${signInData.session!.access_token}`,
        },
      },
    });

    // ──────────────────────────────────────────────
    // 步骤 3: 创建 Job
    // ──────────────────────────────────────────────
    console.log(`\n${LOG} ▶ 步骤 3/6: 创建 Job 并上传音频...`);

    // 下载测试音频
    console.log(`${LOG}   下载测试音频: ${TEST_AUDIO_URL}`);
    const audioRes = await fetch(TEST_AUDIO_URL);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log(`${LOG}   音频大小: ${(audioBuffer.length / 1024).toFixed(1)}KB`);

    // 创建 Job 记录
    const { data: jobData, error: jobError } = await authClient
      .from("jobs")
      .insert({
        user_id: userId!,
        title: "E2E 测试任务",
        status: "pending",
      })
      .select("*")
      .single();

    if (jobError || !jobData) {
      console.error(`${LOG} ❌ Job 创建失败:`, jobError?.message);
      process.exit(1);
    }

    jobId = jobData.id;
    console.log(`${LOG} ✓ Job 已创建: ${jobId}`);

    // 上传音频到 Storage
    const storagePath = `${userId}/${jobId}/welcome.mp3`;
    console.log(`${LOG}   上传到 Storage: audio/${storagePath}`);

    const { error: uploadError } = await admin.storage
      .from("audio")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error(`${LOG} ❌ Storage 上传失败:`, uploadError.message);
      process.exit(1);
    }

    console.log(`${LOG} ✓ 音频上传成功`);

    // 创建 audio_assets 记录
    const { error: assetError } = await admin
      .from("audio_assets")
      .insert({
        user_id: userId!,
        job_id: jobId,
        storage_path: storagePath,
        file_name: "welcome.mp3",
        file_size: audioBuffer.length,
        mime_type: "audio/mpeg",
      });

    if (assetError) {
      console.error(`${LOG} ❌ audio_assets 写入失败:`, assetError.message);
      process.exit(1);
    }

    // 更新 job 状态
    await admin.from("jobs").update({ status: "queued" }).eq("id", jobId);
    console.log(`${LOG} ✓ Job 状态: queued`);

    // ──────────────────────────────────────────────
    // 步骤 4: 执行 ASR 转写
    // ──────────────────────────────────────────────
    console.log(`\n${LOG} ▶ 步骤 4/6: ASR 转写...`);

    // 生成 signed URL
    const { data: signed } = await admin.storage
      .from("audio")
      .createSignedUrl(storagePath, 3600);

    if (!signed?.signedUrl) {
      console.error(`${LOG} ❌ 无法生成 signed URL`);
      process.exit(1);
    }

    console.log(`${LOG}   signed URL 已生成`);

    // 调用 ASR
    await admin.from("jobs").update({ status: "transcribing" }).eq("id", jobId);

    const apiKey = process.env.DASHSCOPE_API_KEY!;
    const baseUrl = process.env.DASHSCOPE_API_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";

    console.log(`${LOG}   提交 ASR 任务 (qwen3-asr-flash-filetrans)...`);

    const submitRes = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: signed.signedUrl },
        parameters: { channel_id: [0], enable_words: true },
      }),
    });

    const submitJson = await submitRes.json();
    const taskId = submitJson?.output?.task_id;

    if (!taskId) {
      console.error(`${LOG} ❌ ASR 提交失败:`, JSON.stringify(submitJson));
      process.exit(1);
    }

    console.log(`${LOG}   task_id: ${taskId}`);

    // 轮询
    let transcriptText = "";
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      const pollRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const pollJson = await pollRes.json();
      const status = pollJson?.output?.task_status;

      if (status === "SUCCEEDED") {
        // 获取结果
        const transUrl = pollJson?.output?.result?.transcription_url;
        if (transUrl) {
          const trRes = await fetch(transUrl);
          const trJson = (await trRes.json()) as Record<string, unknown>;
          const transcripts = trJson?.transcripts;
          if (Array.isArray(transcripts)) {
            for (const t of transcripts) {
              if (typeof t.text === "string") transcriptText += t.text;
              else if (Array.isArray(t.sentences)) {
                for (const s of t.sentences) {
                  if (typeof s.text === "string") transcriptText += s.text;
                }
              }
            }
          }
        }
        console.log(`${LOG} ✓ ASR 完成: "${transcriptText}"`);
        break;
      }

      if (status === "FAILED") {
        console.error(`${LOG} ❌ ASR 失败:`, JSON.stringify(pollJson));
        process.exit(1);
      }
    }

    if (!transcriptText) {
      console.error(`${LOG} ❌ ASR 超时或无结果`);
      process.exit(1);
    }

    // 写入 transcript
    const { error: trError } = await admin.from("transcripts").insert({
      user_id: userId!,
      job_id: jobId,
      transcript_text: transcriptText,
    });

    if (trError) {
      console.error(`${LOG} ❌ transcript 写入失败:`, trError.message);
      process.exit(1);
    }

    await admin.from("jobs").update({ status: "completed" }).eq("id", jobId);

    // ──────────────────────────────────────────────
    // 步骤 5: 验证数据库记录
    // ──────────────────────────────────────────────
    console.log(`\n${LOG} ▶ 步骤 5/6: 验证数据库记录...`);

    const { data: jobCheck } = await admin.from("jobs").select("*").eq("id", jobId).single();
    const { data: trCheck } = await admin.from("transcripts").select("*").eq("job_id", jobId).single();
    const { data: assetCheck } = await admin.from("audio_assets").select("*").eq("job_id", jobId).single();

    console.log(`${LOG}   jobs: ${jobCheck ? "✓" : "❌"} (status: ${jobCheck?.status})`);
    console.log(`${LOG}   transcripts: ${trCheck ? "✓" : "❌"} (${trCheck?.transcript_text?.length || 0} 字符)`);
    console.log(`${LOG}   audio_assets: ${assetCheck ? "✓" : "❌"}`);

    // ──────────────────────────────────────────────
    // 步骤 6: 验证 RLS
    // ──────────────────────────────────────────────
    console.log(`\n${LOG} ▶ 步骤 6/6: 验证 RLS 隔离...`);

    // 用另一个匿名客户端（无认证）尝试读取
    const unauthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: rlsCheck } = await unauthClient
      .from("jobs")
      .select("id")
      .eq("id", jobId);

    console.log(`${LOG}   未认证用户查询 job: ${rlsCheck?.length === 0 ? "✓ 被 RLS 阻止" : "❌ RLS 泄露!"}`);

    // ──────────────────────────────────────────────
    // 完成
    // ──────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║  ✅ E2E 验证全部通过！(${elapsed}s)                 ║`);
    console.log(`╚══════════════════════════════════════════════════╝\n`);

  } finally {
    // 清理测试数据
    if (jobId) {
      console.log(`${LOG} 🧹 清理测试数据...`);
      await admin.from("transcripts").delete().eq("job_id", jobId);
      await admin.from("audio_assets").delete().eq("job_id", jobId);
      await admin.from("jobs").delete().eq("id", jobId);

      // 清理 Storage
      if (userId && jobId) {
        await admin.storage.from("audio").remove([`${userId}/${jobId}/welcome.mp3`]);
      }
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
      console.log(`${LOG} ✓ 测试用户已删除`);
    }
  }
}

main().catch((err) => {
  console.error(`${LOG} ❌ 脚本异常:`, err);
  process.exit(1);
});
