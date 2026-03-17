import WebSocket from "ws";

type SessionSnapshot = {
  jobId: string;
  statusText: string;
  previewText: string;
  finalTranscriptText: string;
  isReady: boolean;
  hasFinished: boolean;
  errorMessage: string | null;
};

type LiveAsrSession = {
  jobId: string;
  ws: WebSocket;
  language: string;
  corpusText: string;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  finishPromise: Promise<void>;
  resolveFinish: () => void;
  rejectFinish: (error: Error) => void;
  statusText: string;
  partialConfirmedText: string;
  partialStashText: string;
  finalSegments: string[];
  isReady: boolean;
  hasFinished: boolean;
  errorMessage: string | null;
  updatedAt: number;
  closeCode: number | null;
  closeReason: string | null;
};

const LOG = "[LiveASR]";
const DEFAULT_MODEL = process.env.DASHSCOPE_REALTIME_MODEL || "qwen3-asr-flash-realtime";

declare global {
  var __kemoLiveAsrSessions: Map<string, LiveAsrSession> | undefined;
}

function getSessionStore() {
  if (!globalThis.__kemoLiveAsrSessions) {
    globalThis.__kemoLiveAsrSessions = new Map<string, LiveAsrSession>();
  }

  return globalThis.__kemoLiveAsrSessions;
}

function createDeferred() {
  let resolve = () => {};
  let reject: (error: Error) => void = () => {};

  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function resolveRealtimeWsUrl() {
  if (process.env.DASHSCOPE_REALTIME_WS_URL) {
    return process.env.DASHSCOPE_REALTIME_WS_URL;
  }

  const apiBase = process.env.DASHSCOPE_API_BASE_URL || "";

  if (apiBase.includes("dashscope-intl.aliyuncs.com")) {
    return "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime";
  }

  return "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
}

function buildSnapshot(session: LiveAsrSession): SessionSnapshot {
  const confirmedPrefix = session.finalSegments.join("\n").trim();
  const currentSentence = `${session.partialConfirmedText}${session.partialStashText}`.trim();
  const previewText = [confirmedPrefix, currentSentence].filter(Boolean).join(confirmedPrefix && currentSentence ? "\n" : "");

  return {
    jobId: session.jobId,
    statusText: session.errorMessage || session.statusText,
    previewText,
    finalTranscriptText: session.finalSegments.join("\n").trim(),
    isReady: session.isReady,
    hasFinished: session.hasFinished,
    errorMessage: session.errorMessage,
  };
}

function isSessionOpen(session: LiveAsrSession) {
  return session.ws.readyState === WebSocket.OPEN && !session.hasFinished;
}

function sendJson(session: LiveAsrSession, payload: Record<string, unknown>) {
  if (session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Realtime ASR websocket is not open");
  }

  session.ws.send(JSON.stringify(payload));
}

function updateFromEvent(session: LiveAsrSession, payload: Record<string, unknown>) {
  const type = typeof payload.type === "string" ? payload.type : "";
  session.updatedAt = Date.now();

  switch (type) {
    case "session.updated":
      session.isReady = true;
      session.statusText = "阿里实时 ASR 已连接";
      session.resolveReady();
      break;
    case "input_audio_buffer.speech_started":
      session.statusText = "检测到语音，正在实时转写";
      break;
    case "input_audio_buffer.speech_stopped":
      session.statusText = "检测到一句结束，正在整理当前片段";
      break;
    case "conversation.item.input_audio_transcription.text":
      session.partialConfirmedText = typeof payload.text === "string" ? payload.text : "";
      session.partialStashText = typeof payload.stash === "string" ? payload.stash : "";
      session.statusText = "正在生成实时转写";
      break;
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
      if (transcript) {
        session.finalSegments.push(transcript);
      }
      session.partialConfirmedText = "";
      session.partialStashText = "";
      session.statusText = "当前句已确认";
      break;
    }
    case "conversation.item.input_audio_transcription.failed":
      session.errorMessage =
        typeof payload.error === "object" && payload.error && typeof (payload.error as { message?: unknown }).message === "string"
          ? ((payload.error as { message: string }).message)
          : "阿里实时转写失败";
      session.statusText = session.errorMessage;
      break;
    case "session.finished":
      session.hasFinished = true;
      session.statusText = session.errorMessage || "实时转写已结束";
      session.resolveFinish();
      break;
    case "error": {
      const errorMessage =
        typeof payload.error === "object" && payload.error && typeof (payload.error as { message?: unknown }).message === "string"
          ? ((payload.error as { message: string }).message)
          : "阿里实时转写发生错误";
      session.errorMessage = errorMessage;
      session.statusText = errorMessage;
      session.rejectReady(new Error(errorMessage));
      session.rejectFinish(new Error(errorMessage));
      break;
    }
    default:
      break;
  }
}

export async function startRealtimeAsrSession({
  jobId,
  language = "zh",
  corpusText,
  forceRestart = false,
}: {
  jobId: string;
  language?: string;
  corpusText?: string;
  forceRestart?: boolean;
}) {
  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY");
  }

  const store = getSessionStore();
  const existing = store.get(jobId);
  if (existing && !forceRestart && isSessionOpen(existing)) {
    return buildSnapshot(existing);
  }

  const seededTranscript = existing ? buildSnapshot(existing).finalTranscriptText : "";
  if (existing) {
    try {
      existing.ws.close();
    } catch {
      // ignore close failures
    }
    store.delete(jobId);
  }

  const wsUrl = `${resolveRealtimeWsUrl()}?model=${encodeURIComponent(DEFAULT_MODEL)}`;
  const ready = createDeferred();
  const finish = createDeferred();
  const ws = new WebSocket(wsUrl, {
    headers: {
      Authorization: `bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  const session: LiveAsrSession = {
    jobId,
    ws,
    language,
    corpusText: corpusText || "",
    readyPromise: ready.promise,
    resolveReady: ready.resolve,
    rejectReady: ready.reject,
    finishPromise: finish.promise,
    resolveFinish: finish.resolve,
    rejectFinish: finish.reject,
    statusText: "正在连接阿里实时 ASR",
    partialConfirmedText: "",
    partialStashText: "",
    finalSegments: seededTranscript ? [seededTranscript] : [],
    isReady: false,
    hasFinished: false,
    errorMessage: null,
    updatedAt: Date.now(),
    closeCode: null,
    closeReason: null,
  };

  store.set(jobId, session);

  ws.on("open", () => {
    sendJson(session, {
      event_id: crypto.randomUUID(),
      type: "session.update",
      session: {
        modalities: ["text"],
        input_audio_format: "pcm",
        sample_rate: 16000,
        input_audio_transcription: {
          language,
          ...(corpusText?.trim()
            ? {
                corpus: {
                  text: corpusText.trim().slice(0, 12000),
                },
              }
            : {}),
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.0,
          silence_duration_ms: 400,
        },
      },
    });
  });

  ws.on("message", (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
      updateFromEvent(session, parsed);
    } catch (error) {
      session.errorMessage = error instanceof Error ? error.message : "Failed to parse realtime ASR event";
      session.statusText = session.errorMessage;
    }
  });

  ws.on("error", (error) => {
    const message = error instanceof Error ? error.message : "Realtime ASR socket error";
    session.errorMessage = message;
    session.statusText = message;
    session.rejectReady(new Error(message));
    session.rejectFinish(new Error(message));
  });

  ws.on("close", (code, reasonBuffer) => {
    const reason = reasonBuffer.toString() || null;
    session.closeCode = code;
    session.closeReason = reason;
    if (!session.hasFinished && !session.errorMessage) {
      session.statusText = `实时转写连接已关闭${code ? ` (${code}${reason ? `: ${reason}` : ""})` : ""}`;
      session.hasFinished = true;
      session.resolveFinish();
    }
    console.log(`${LOG} closed ${jobId} code=${code} reason=${reason || "-"}`);
  });

  try {
    await session.readyPromise;
  } catch (error) {
    store.delete(jobId);
    throw error;
  }

  console.log(`${LOG} started session for ${jobId}`);
  return buildSnapshot(session);
}

export async function appendRealtimeAsrAudio({
  jobId,
  audioBase64,
  language = "zh",
  corpusText,
}: {
  jobId: string;
  audioBase64: string;
  language?: string;
  corpusText?: string;
}) {
  const store = getSessionStore();
  let session = store.get(jobId);
  if (!session || !isSessionOpen(session)) {
    await startRealtimeAsrSession({
      jobId,
      language: session?.language || language,
      corpusText: session?.corpusText || corpusText,
      forceRestart: true,
    });
    session = store.get(jobId);
  }
  if (!session) {
    throw new Error("Realtime ASR session not found");
  }

  await session.readyPromise;
  sendJson(session, {
    event_id: crypto.randomUUID(),
    type: "input_audio_buffer.append",
    audio: audioBase64,
  });

  return buildSnapshot(session);
}

export async function finishRealtimeAsrSession(jobId: string) {
  const store = getSessionStore();
  const session = store.get(jobId);
  if (!session) {
    return null;
  }

  if (!session.hasFinished && session.ws.readyState === WebSocket.OPEN) {
    sendJson(session, {
      event_id: crypto.randomUUID(),
      type: "session.finish",
    });

    try {
      await Promise.race([
        session.finishPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      // Keep final snapshot even if remote finish errored.
    }
  }

  try {
    session.ws.close();
  } catch {
    // ignore close failures
  }

  const snapshot = buildSnapshot(session);
  store.delete(jobId);
  return snapshot;
}

export function getRealtimeAsrSnapshot(jobId: string) {
  const session = getSessionStore().get(jobId);
  if (!session) return null;
  return buildSnapshot(session);
}

export function getRealtimeAsrDebugState(jobId: string) {
  const session = getSessionStore().get(jobId);
  if (!session) {
    return {
      exists: false,
      isOpen: false,
      hasFinished: false,
      updatedAt: null,
      closeCode: null,
      closeReason: null,
      wsState: "missing",
    };
  }

  return {
    exists: true,
    isOpen: isSessionOpen(session),
    hasFinished: session.hasFinished,
    updatedAt: session.updatedAt,
    closeCode: session.closeCode,
    closeReason: session.closeReason,
    wsState:
      session.ws.readyState === WebSocket.CONNECTING
        ? "connecting"
        : session.ws.readyState === WebSocket.OPEN
          ? "open"
          : session.ws.readyState === WebSocket.CLOSING
            ? "closing"
            : "closed",
  };
}
