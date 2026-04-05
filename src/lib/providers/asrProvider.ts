/**
 * @file asrProvider.ts
 * @description 阿里云 DashScope Qwen3-ASR 服务封装
 *              模型: Qwen3-ASR-1.7B → API 名称 qwen3-asr-flash-filetrans（异步长音频转写）
 *              API 文档: https://www.alibabacloud.com/help/en/model-studio/qwen-speech-recognition
 * @author KEMO
 * @created 2026-02-05
 * @modified 2026-02-06
 */

// ============================================================
// 常量
// ============================================================

/** DashScope 默认 API 基础地址（北京区域） */
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

/** 异步文件转写模型（Qwen3-ASR-Filetrans） */
const FILETRANS_MODEL = "qwen3-asr-flash-filetrans";

/** 官方支持说话人分离的文件转写模型（Paraformer v2） */
const DIARIZATION_MODEL = "paraformer-v2";

/** 日志前缀 */
const LOG_PREFIX = "[ASR]";

// ============================================================
// 类型定义
// ============================================================

export type AsrStartResult = {
  vendorTaskId: string;
};

export type AsrPollResult = {
  status: "running" | "completed" | "failed";
  transcriptText?: string;
  raw?: unknown;
  errorMessage?: string;
};

export type SpeakerSegment = {
  speakerId: number;
  text: string;
  beginTime?: number;
  endTime?: number;
};

// ============================================================
// 公开方法
// ============================================================

/**
 * 提交异步转写任务
 * 调用 DashScope filetrans API，返回 vendor task_id 用于后续轮询
 *
 * @param audioUrl - 可公开访问的音频文件 URL（或 Supabase signed URL）
 * @param language - 语言提示（可选，如 "zh"、"en"）
 * @returns vendorTaskId
 * @throws DASHSCOPE_API_KEY 缺失、API 返回错误
 */
export async function startTranscription({
  audioUrl,
  language,
  model = FILETRANS_MODEL,
  diarizationEnabled = false,
  speakerCount,
}: {
  audioUrl: string;
  language?: string;
  model?: string;
  diarizationEnabled?: boolean;
  speakerCount?: number;
}): Promise<AsrStartResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  const baseUrl = process.env.DASHSCOPE_API_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error(`${LOG_PREFIX} 缺少 DASHSCOPE_API_KEY 环境变量`);
  }

  const endpoint = `${baseUrl}/services/audio/asr/transcription`;

  const body = {
    model,
    input: {
      file_url: audioUrl,
    },
    parameters: {
      ...(model === DIARIZATION_MODEL
        ? {
            ...(language ? { language_hints: [language] } : {}),
            diarization_enabled: diarizationEnabled,
            ...(typeof speakerCount === "number" ? { speaker_count: speakerCount } : {}),
          }
        : {
            ...(language ? { language } : {}),
            channel_id: [0],
            enable_words: true,
          }),
    },
  };

  console.log(`${LOG_PREFIX} ╔══════════════════════════════════════`);
  console.log(`${LOG_PREFIX} ║ 提交 ASR 转写任务`);
  console.log(`${LOG_PREFIX} ║ 模型: ${model}`);
  console.log(`${LOG_PREFIX} ║ 端点: ${endpoint}`);
  console.log(`${LOG_PREFIX} ║ 音频: ${audioUrl.slice(0, 80)}...`);
  console.log(`${LOG_PREFIX} ╚══════════════════════════════════════`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    const errMsg = json?.message || json?.error?.message || `HTTP ${res.status}`;
    console.error(`${LOG_PREFIX} ✗ 提交失败: ${errMsg}`);
    console.error(`${LOG_PREFIX}   响应:`, JSON.stringify(json));
    throw new Error(`${LOG_PREFIX} ASR 提交失败: ${errMsg}`);
  }

  const vendorTaskId = json?.output?.task_id;

  if (!vendorTaskId) {
    console.error(`${LOG_PREFIX} ✗ 响应中缺少 task_id:`, JSON.stringify(json));
    throw new Error(`${LOG_PREFIX} ASR 响应缺少 task_id`);
  }

  console.log(`${LOG_PREFIX} ✓ 任务已提交, task_id: ${vendorTaskId}`);
  console.log(`${LOG_PREFIX}   request_id: ${json?.request_id || "N/A"}`);

  return { vendorTaskId };
}

/**
 * 轮询转写任务结果
 * 向 DashScope tasks API 查询状态，完成后获取转写文本
 *
 * @param vendorTaskId - DashScope 返回的 task_id
 * @returns 状态 + 转写文本（如果完成）
 */
export async function pollResult({
  vendorTaskId,
}: {
  vendorTaskId: string;
}): Promise<AsrPollResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  const baseUrl = process.env.DASHSCOPE_API_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error(`${LOG_PREFIX} 缺少 DASHSCOPE_API_KEY 环境变量`);
  }

  const endpoint = `${baseUrl}/tasks/${vendorTaskId}`;

  console.log(`${LOG_PREFIX} ⏳ 轮询任务状态: ${vendorTaskId}`);

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const json = await res.json();

  if (!res.ok) {
    const errMsg = json?.message || `HTTP ${res.status}`;
    console.error(`${LOG_PREFIX} ✗ 轮询失败: ${errMsg}`);
    return { status: "failed", errorMessage: errMsg, raw: json };
  }

  const taskStatus = json?.output?.task_status;
  console.log(`${LOG_PREFIX}   状态: ${taskStatus}`);

  // 任务成功完成
  if (taskStatus === "SUCCEEDED") {
    console.log(`${LOG_PREFIX} ✓ 转写完成`);

    // Filetrans 模型返回 transcription_url，需要再请求一次获取结果
    const transcriptionUrl = json?.output?.result?.transcription_url;
    let transcriptText = "";
    let raw: unknown = json;

    if (transcriptionUrl) {
      console.log(`${LOG_PREFIX}   获取转写结果: ${transcriptionUrl.slice(0, 80)}...`);
      const transRes = await fetch(transcriptionUrl);
      const transJson = await transRes.json();
      transcriptText = extractTranscript(transJson);
      raw = { task: json, transcription: transJson };
    } else {
      transcriptText = extractTranscript(json);
    }

    const textPreview = transcriptText.slice(0, 100);
    console.log(`${LOG_PREFIX}   文本预览: ${textPreview}...`);
    console.log(`${LOG_PREFIX}   文本长度: ${transcriptText.length} 字符`);

    return { status: "completed", transcriptText, raw };
  }

  // 任务失败
  if (taskStatus === "FAILED") {
    const errMsg = json?.output?.message || "ASR task failed";
    console.error(`${LOG_PREFIX} ✗ 转写失败: ${errMsg}`);
    return { status: "failed", errorMessage: errMsg, raw: json };
  }

  // 仍在运行（PENDING / RUNNING）
  return { status: "running", raw: json };
}

export async function transcribeWithSpeakerDiarization({
  audioUrl,
  language,
  speakerCount,
}: {
  audioUrl: string;
  language?: string;
  speakerCount?: number;
}) {
  const { vendorTaskId } = await startTranscription({
    audioUrl,
    language,
    model: DIARIZATION_MODEL,
    diarizationEnabled: true,
    speakerCount,
  });

  return vendorTaskId;
}

// ============================================================
// 内部方法
// ============================================================

/**
 * 从 ASR 返回的各种格式中提取纯文本
 * DashScope filetrans 返回格式多样，这里做兼容处理
 *
 * @param payload - ASR 返回的 JSON 数据
 * @returns 提取的纯文本
 */
function extractTranscript(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return "";

  const data = payload as Record<string, unknown>;

  // 格式 1: filetrans transcription_url 返回的结构
  // { "transcripts": [{ "sentences": [{ "text": "..." }] }] }
  const transcripts = data.transcripts as Array<Record<string, unknown>> | undefined;
  if (transcripts && Array.isArray(transcripts)) {
    const allText: string[] = [];
    for (const t of transcripts) {
      // 直接有 text 字段
      if (typeof t.text === "string") {
        allText.push(t.text);
        continue;
      }
      // 有 sentences 数组
      const sentences = t.sentences as Array<Record<string, unknown>> | undefined;
      if (sentences && Array.isArray(sentences)) {
        for (const s of sentences) {
          if (typeof s.text === "string") {
            allText.push(s.text);
          }
        }
      }
    }
    if (allText.length > 0) {
      return allText.join("");
    }
  }

  // 格式 2: output.text
  const output = data.output as Record<string, unknown> | undefined;
  if (typeof output?.text === "string") return output.text;

  // 格式 3: output.result.text
  const result = output?.result as Record<string, unknown> | undefined;
  if (typeof result?.text === "string") return result.text;

  // 格式 4: 直接 text
  if (typeof data.text === "string") return data.text;

  // 格式 5: transcript
  if (typeof data.transcript === "string") return data.transcript;

  // 兜底：序列化全部数据
  console.warn(`${LOG_PREFIX} ⚠ 无法识别转写格式，返回原始 JSON`);
  return JSON.stringify(data);
}

export function extractSpeakerSegments(payload: unknown): SpeakerSegment[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = payload as Record<string, unknown>;
  const transcripts = data.transcripts as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(transcripts)) {
    return [];
  }

  const segments: SpeakerSegment[] = [];
  for (const transcript of transcripts) {
    const sentences = transcript.sentences as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(sentences)) {
      continue;
    }

    for (const sentence of sentences) {
      const text = typeof sentence.text === "string" ? sentence.text.trim() : "";
      const speakerId = typeof sentence.speaker_id === "number" ? sentence.speaker_id : null;
      if (!text || speakerId === null) {
        continue;
      }

      segments.push({
        speakerId,
        text,
        beginTime: typeof sentence.begin_time === "number" ? sentence.begin_time : undefined,
        endTime: typeof sentence.end_time === "number" ? sentence.end_time : undefined,
      });
    }
  }

  return segments;
}

export function formatSpeakerTranscript(segments: SpeakerSegment[]) {
  if (!segments.length) {
    return "";
  }

  const speakerOrder = new Map<number, string>();
  const speakerLabel = (speakerId: number) => {
    if (!speakerOrder.has(speakerId)) {
      const index = speakerOrder.size;
      const alphabet = String.fromCharCode("A".charCodeAt(0) + index);
      speakerOrder.set(speakerId, `访谈者${alphabet}`);
    }
    return speakerOrder.get(speakerId)!;
  };

  const merged: Array<{ speakerId: number; text: string }> = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.speakerId === segment.speakerId) {
      previous.text = `${previous.text}${segment.text}`.trim();
      continue;
    }

    merged.push({
      speakerId: segment.speakerId,
      text: segment.text,
    });
  }

  return merged
    .map((segment) => `${speakerLabel(segment.speakerId)}：${segment.text}`)
    .join("\n\n");
}
