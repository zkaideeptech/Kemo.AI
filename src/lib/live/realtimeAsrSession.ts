import WebSocket from "ws";

import { sanitizeTranscriptText } from "@/lib/live/transcriptCleanup";

export type SessionSnapshot = {
  jobId: string;
  statusText: string;
  previewText: string;
  finalTranscriptText: string;
  isReady: boolean;
  hasFinished: boolean;
  errorMessage: string | null;
};

export type RealtimeAsrDebugState = {
  exists: boolean;
  isOpen: boolean;
  hasFinished: boolean;
  updatedAt: number | null;
  closeCode: number | null;
  closeReason: string | null;
  wsState: "missing" | "connecting" | "open" | "closing" | "closed";
};

export type RealtimeAsrTurnDetectionMode = "server_vad" | "manual";

export type RealtimeAsrSessionEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  snapshot: SessionSnapshot;
  debug: RealtimeAsrDebugState;
};

type SessionListener = (event: RealtimeAsrSessionEvent) => void;

type LiveAsrSession = {
  jobId: string;
  ws: WebSocket;
  language: string;
  corpusText: string;
  turnDetectionMode: RealtimeAsrTurnDetectionMode;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  finishPromise: Promise<void>;
  resolveFinish: () => void;
  rejectFinish: (error: Error) => void;
  statusText: string;
  interimTranscriptText: string;
  finalSegments: string[];
  isReady: boolean;
  hasFinished: boolean;
  errorMessage: string | null;
  updatedAt: number;
  closeCode: number | null;
  closeReason: string | null;
  listeners: Set<SessionListener>;
};

const LOG = "[LiveASR]";
const DEFAULT_MODEL = process.env.DASHSCOPE_REALTIME_MODEL || "qwen3-asr-flash-realtime";
const DEFAULT_VAD_THRESHOLD = Number(process.env.DASHSCOPE_REALTIME_VAD_THRESHOLD || "0.0");
const DEFAULT_VAD_SILENCE_MS = Number(process.env.DASHSCOPE_REALTIME_VAD_SILENCE_MS || "800");
const READY_TIMEOUT_MS = Number(process.env.DASHSCOPE_REALTIME_READY_TIMEOUT_MS || "10000");
const FINISH_TIMEOUT_MS = Number(process.env.DASHSCOPE_REALTIME_FINISH_TIMEOUT_MS || "5000");

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

function buildFinalTranscriptText(session: LiveAsrSession) {
  return sanitizeTranscriptText(session.finalSegments.join("\n"));
}

function buildPreviewText(session: LiveAsrSession) {
  return sanitizeTranscriptText(
    [...session.finalSegments, session.interimTranscriptText].filter(Boolean).join("\n")
  );
}

function buildSnapshot(session: LiveAsrSession): SessionSnapshot {
  return {
    jobId: session.jobId,
    statusText: session.errorMessage || session.statusText,
    previewText: buildPreviewText(session),
    finalTranscriptText: buildFinalTranscriptText(session),
    isReady: session.isReady,
    hasFinished: session.hasFinished,
    errorMessage: session.errorMessage,
  };
}

export function getEmptyRealtimeAsrSnapshot(
  jobId: string,
  overrides?: Partial<SessionSnapshot>
): SessionSnapshot {
  return {
    jobId,
    statusText: "实时会话未启动",
    previewText: "",
    finalTranscriptText: "",
    isReady: false,
    hasFinished: false,
    errorMessage: null,
    ...overrides,
  };
}

function isSessionOpen(session: LiveAsrSession) {
  return session.ws.readyState === WebSocket.OPEN && !session.hasFinished;
}

function buildDebugState(session: LiveAsrSession): RealtimeAsrDebugState {
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

function sendJson(session: LiveAsrSession, payload: Record<string, unknown>) {
  if (session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("Realtime ASR websocket is not open");
  }

  session.ws.send(JSON.stringify(payload));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function getTranscriptPayloadText(payload: Record<string, unknown>) {
  const transcript = typeof payload.transcript === "string" ? payload.transcript : "";
  if (transcript) {
    return sanitizeTranscriptText(transcript);
  }

  const confirmedText = typeof payload.text === "string" ? payload.text : "";
  const stashedText = typeof payload.stash === "string" ? payload.stash : "";
  return sanitizeTranscriptText(`${confirmedText}${stashedText}`);
}

function markReady(session: LiveAsrSession) {
  if (session.isReady) {
    return;
  }

  session.isReady = true;
  session.statusText = "阿里实时 ASR 已连接";
  session.resolveReady();
}

function appendFinalTranscript(session: LiveAsrSession, transcript: string) {
  const cleanTranscript = sanitizeTranscriptText(transcript);

  if (!cleanTranscript) {
    return;
  }

  const previousSegment = session.finalSegments[session.finalSegments.length - 1] || "";
  if (cleanTranscript === previousSegment || previousSegment.endsWith(cleanTranscript)) {
    return;
  }

  session.finalSegments.push(cleanTranscript);
}

function publishSessionEvent(session: LiveAsrSession, eventType: string, payload: Record<string, unknown>) {
  const event: RealtimeAsrSessionEvent = {
    eventType,
    payload,
    snapshot: buildSnapshot(session),
    debug: buildDebugState(session),
  };

  session.listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore listener errors
    }
  });
}

function updateFromEvent(session: LiveAsrSession, payload: Record<string, unknown>) {
  const type = typeof payload.type === "string" ? payload.type : "";
  session.updatedAt = Date.now();

  switch (type) {
    case "session.created":
    case "session.updated":
      markReady(session);
      break;
    case "conversation.item.created":
      session.interimTranscriptText = "";
      break;
    case "input_audio_buffer.speech_started":
      session.statusText = "检测到语音，正在实时转写";
      break;
    case "input_audio_buffer.speech_stopped":
      session.statusText = "检测到停顿，正在确认当前句";
      break;
    case "input_audio_buffer.committed":
      session.statusText = "当前音频段已提交";
      break;
    case "conversation.item.input_audio_transcription.text":
      session.interimTranscriptText = getTranscriptPayloadText(payload);
      session.statusText = "正在识别当前句";
      break;
    case "conversation.item.input_audio_transcription.completed":
      appendFinalTranscript(session, getTranscriptPayloadText(payload));
      session.interimTranscriptText = "";
      session.statusText = "当前句已确认";
      break;
    case "conversation.item.input_audio_transcription.failed":
      session.errorMessage =
        typeof payload.error === "object" && payload.error && typeof (payload.error as { message?: unknown }).message === "string"
          ? (payload.error as { message: string }).message
          : "阿里实时转写失败";
      session.statusText = session.errorMessage;
      break;
    case "session.finished":
      appendFinalTranscript(session, getTranscriptPayloadText(payload));
      session.hasFinished = true;
      session.statusText = session.errorMessage || "实时转写已结束";
      session.resolveFinish();
      break;
    case "error": {
      const errorMessage =
        typeof payload.error === "object" && payload.error && typeof (payload.error as { message?: unknown }).message === "string"
          ? (payload.error as { message: string }).message
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

  publishSessionEvent(session, type || "unknown", payload);
}

export async function startRealtimeAsrSession({
  jobId,
  language = "zh",
  corpusText,
  turnDetectionMode = "server_vad",
  forceRestart = false,
}: {
  jobId: string;
  language?: string;
  corpusText?: string;
  turnDetectionMode?: RealtimeAsrTurnDetectionMode;
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

  const seededTranscript = existing ? buildFinalTranscriptText(existing) : "";
  if (existing) {
    try {
      existing.ws.close();
    } catch {
      // ignore close failures
    }
    store.delete(jobId);
  }

  const ready = createDeferred();
  const finish = createDeferred();
  const ws = new WebSocket(`${resolveRealtimeWsUrl()}?model=${encodeURIComponent(DEFAULT_MODEL)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  const session: LiveAsrSession = {
    jobId,
    ws,
    language,
    corpusText: corpusText || "",
    turnDetectionMode,
    readyPromise: ready.promise,
    resolveReady: ready.resolve,
    rejectReady: ready.reject,
    finishPromise: finish.promise,
    resolveFinish: finish.resolve,
    rejectFinish: finish.reject,
    statusText: "正在连接阿里实时 ASR",
    interimTranscriptText: "",
    finalSegments: seededTranscript ? [seededTranscript] : [],
    isReady: false,
    hasFinished: false,
    errorMessage: null,
    updatedAt: Date.now(),
    closeCode: null,
    closeReason: null,
    listeners: new Set<SessionListener>(),
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
        },
        turn_detection:
          turnDetectionMode === "manual"
            ? null
            : {
                type: "server_vad",
                threshold: Number.isFinite(DEFAULT_VAD_THRESHOLD) ? DEFAULT_VAD_THRESHOLD : 0.0,
                silence_duration_ms: Number.isFinite(DEFAULT_VAD_SILENCE_MS) ? DEFAULT_VAD_SILENCE_MS : 400,
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
      publishSessionEvent(session, "parse_error", {
        error: { message: session.errorMessage },
      });
    }
  });

  ws.on("error", (error) => {
    const message = error instanceof Error ? error.message : "Realtime ASR socket error";
    session.errorMessage = message;
    session.statusText = message;
    session.rejectReady(new Error(message));
    session.rejectFinish(new Error(message));
    publishSessionEvent(session, "socket_error", {
      error: { message },
    });
  });

  ws.on("close", (code, reasonBuffer) => {
    const reason = reasonBuffer.toString() || null;
    session.closeCode = code;
    session.closeReason = reason;
    if (!session.hasFinished && !session.errorMessage) {
      session.hasFinished = true;
      session.statusText = `实时转写连接已关闭${code ? ` (${code}${reason ? `: ${reason}` : ""})` : ""}`;
      session.resolveFinish();
    }
    publishSessionEvent(session, "socket_closed", {
      closeCode: code,
      closeReason: reason,
    });
    console.log(`${LOG} closed ${jobId} code=${code} reason=${reason || "-"}`);
  });

  try {
    await withTimeout(session.readyPromise, READY_TIMEOUT_MS, "Realtime ASR ready");
  } catch (error) {
    store.delete(jobId);
    try {
      ws.close();
    } catch {
      // ignore close failures
    }
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
  turnDetectionMode = "server_vad",
}: {
  jobId: string;
  audioBase64: string;
  language?: string;
  corpusText?: string;
  turnDetectionMode?: RealtimeAsrTurnDetectionMode;
}) {
  const store = getSessionStore();
  let session = store.get(jobId);

  if (!session || !isSessionOpen(session)) {
    await startRealtimeAsrSession({
      jobId,
      language: session?.language || language,
      corpusText: session?.corpusText || corpusText,
      turnDetectionMode: session?.turnDetectionMode || turnDetectionMode,
      forceRestart: true,
    });
    session = store.get(jobId);
  }

  if (!session) {
    throw new Error("Realtime ASR session not found");
  }

  await withTimeout(session.readyPromise, READY_TIMEOUT_MS, "Realtime ASR ready");
  sendJson(session, {
    event_id: crypto.randomUUID(),
    type: "input_audio_buffer.append",
    audio: audioBase64,
  });

  return buildSnapshot(session);
}

export async function commitRealtimeAsrSession(jobId: string) {
  const session = getSessionStore().get(jobId);
  if (!session) {
    return null;
  }

  await withTimeout(session.readyPromise, READY_TIMEOUT_MS, "Realtime ASR ready");
  sendJson(session, {
    event_id: crypto.randomUUID(),
    type: "input_audio_buffer.commit",
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
      await withTimeout(session.finishPromise, FINISH_TIMEOUT_MS, "Realtime ASR finish");
    } catch {
      // Keep final snapshot even if remote finish timed out.
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

export function subscribeRealtimeAsrSession(jobId: string, listener: SessionListener) {
  const session = getSessionStore().get(jobId);
  if (!session) {
    return () => {};
  }

  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}

export function getRealtimeAsrSnapshot(jobId: string) {
  const session = getSessionStore().get(jobId);
  if (!session) {
    return null;
  }

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
    } satisfies RealtimeAsrDebugState;
  }

  return buildDebugState(session);
}
