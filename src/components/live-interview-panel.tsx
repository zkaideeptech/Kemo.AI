"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic, Radio, ScreenShare, Square, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const TARGET_SAMPLE_RATE = 16000;
const STREAM_CHUNK_BYTES = 3200;
const STREAM_INTERVAL_MS = 80;
const MAX_APPEND_CHUNKS_PER_EVENT = 8;
const BACKLOG_BATCH_THRESHOLD_CHUNKS = 4;
const MAX_FLUSH_PASSES_PER_TICK = 1;
const MAX_SOCKET_BUFFERED_BYTES = 256 * 1024;
const GATEWAY_CONNECT_TIMEOUT_MS = 12000;
const GATEWAY_CONNECT_RETRY_BASE_MS = 180;
const LIVE_WAV_FILE_NAME = "live_capture.wav";
const AUDIO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_AUDIO || "audio";

type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  systemAudio?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
};

type StartLiveResult = {
  jobId: string | null;
  statusText?: string;
};

type CaptureMode = "mic" | "tab";

function mergeChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function encodePcm16Wav(chunks: Uint8Array[], sampleRate: number) {
  const pcmBytes = mergeChunks(chunks);
  const wavBuffer = new ArrayBuffer(44 + pcmBytes.byteLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes.byteLength, true);
  new Uint8Array(wavBuffer, 44).set(pcmBytes);

  return new File([wavBuffer], LIVE_WAV_FILE_NAME, { type: "audio/wav" });
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_");
}

function floatToPcm16Chunk(inputBuffer: AudioBuffer, sourceSampleRate: number) {
  const channelCount = inputBuffer.numberOfChannels;
  const frameCount = inputBuffer.length;
  const mono = new Float32Array(frameCount);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelData = inputBuffer.getChannelData(channel);
    for (let index = 0; index < frameCount; index += 1) {
      mono[index] += channelData[index] / channelCount;
    }
  }

  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    const pcm16 = new Int16Array(mono.length);
    for (let index = 0; index < mono.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, mono[index]));
      pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return new Uint8Array(pcm16.buffer);
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const nextLength = Math.max(1, Math.round(mono.length / ratio));
  const pcm16 = new Int16Array(nextLength);

  for (let index = 0; index < nextLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(mono.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      sum += mono[cursor];
      count += 1;
    }

    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return new Uint8Array(pcm16.buffer);
}

function getSourceSummary({
  captureMode,
}: {
  captureMode: CaptureMode;
}) {
  return captureMode === "tab" ? "当前场景：标签页会议" : "当前场景：面对面访谈";
}

type AudioSnapshot = {
  previewText?: string;
  finalTranscriptText?: string;
  statusText?: string;
  debug?: unknown;
};

type GatewaySessionBootstrap = {
  jobId: string;
  wsUrl: string;
  token: string;
  language: string;
  turnDetectionMode: "server_vad" | "manual";
  snapshot?: AudioSnapshot;
};

type GatewaySocketMessage = {
  type: string;
  eventType?: string;
  snapshot?: AudioSnapshot;
  debug?: unknown;
  message?: string;
};

function describeTrackSettings(track: MediaStreamTrack | undefined) {
  if (!track) {
    return null;
  }

  const settings = track.getSettings();
  const detailParts = [
    typeof settings.sampleRate === "number" ? `${settings.sampleRate}Hz` : null,
    typeof settings.channelCount === "number" ? `${settings.channelCount}ch` : null,
    typeof settings.echoCancellation === "boolean" ? `AEC ${settings.echoCancellation ? "on" : "off"}` : null,
    typeof settings.noiseSuppression === "boolean" ? `NS ${settings.noiseSuppression ? "on" : "off"}` : null,
    typeof settings.autoGainControl === "boolean" ? `AGC ${settings.autoGainControl ? "on" : "off"}` : null,
  ].filter(Boolean);

  return detailParts.length ? detailParts.join(" · ") : null;
}

function createCaptureAudioContext() {
  try {
    return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

async function requestTabCaptureStream() {
  const attempts: ExtendedDisplayMediaStreamOptions[] = [
    {
      video: {
        frameRate: { ideal: 15, max: 24 },
      },
      audio: {
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      systemAudio: "include",
    },
    {
      video: true,
      audio: true,
      systemAudio: "include",
    },
  ];

  let lastError: unknown = null;

  for (const options of attempts) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("标签页音频未接入");
}

export function LiveInterviewPanel({
  onTranscriptChange,
  onStatusChange,
  onEnsureJob,
  onFinalizeStarted,
  onFinalizeSettled,
  onFinalized,
  disabled = false,
  disabledReason = "请先创建项目",
  compact = false,
}: {
  onTranscriptChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onEnsureJob?: () => Promise<StartLiveResult>;
  onFinalizeStarted?: (payload: { jobId: string | null; transcriptText: string; statusText: string }) => void;
  onFinalizeSettled?: (payload: { success: boolean; statusText: string }) => void;
  onFinalized?: (payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string; statusText: string }) => void;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
}) {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("mic");
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState("准备开始");
  const [captureDetails, setCaptureDetails] = useState("未开始");
  const [isRunning, setIsRunning] = useState(false);
  const [pendingAction, setPendingAction] = useState<"starting" | "stopping" | null>(null);
  const [showSourceControls, setShowSourceControls] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(!compact);

  const activeJobIdRef = useRef<string | null>(null);
  const liveTextRef = useRef("");
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const recordedPcmChunksRef = useRef<Uint8Array[]>([]);
  const runningRef = useRef(false);
  const flushLoopRef = useRef<number | null>(null);
  const gatewaySocketRef = useRef<WebSocket | null>(null);
  const gatewayReadyRef = useRef(false);
  const finishFallbackTimerRef = useRef<number | null>(null);
  const finalizePromiseRef = useRef<Promise<void> | null>(null);
  const audioUploadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    liveTextRef.current = liveText;
    onTranscriptChange?.(liveText);
  }, [liveText, onTranscriptChange]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    return () => {
      stopFlushLoop();
      closeGatewaySocket();
      clearFinishFallbackTimer();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedMode = window.localStorage.getItem("kemo-live-capture-mode");
    if (savedMode === "mic" || savedMode === "tab") {
      setCaptureMode(savedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("kemo-live-capture-mode", captureMode);
  }, [captureMode]);

  useEffect(() => {
    if (!compact) {
      setTranscriptExpanded(true);
    }
  }, [compact]);

  useEffect(() => {
    if (typeof window === "undefined" || disabled) {
      return;
    }

    void fetch("/api/live/audio/health", {
      method: "GET",
      cache: "no-store",
    }).catch(() => {
      // ignore background warmup failures
    });
  }, [disabled]);

  function applyAudioSnapshotData(data: AudioSnapshot) {
    const nextTranscript =
      typeof data.previewText === "string" && data.previewText.trim()
        ? data.previewText
        : typeof data.finalTranscriptText === "string"
          ? data.finalTranscriptText
          : "";

    if (nextTranscript) {
      setLiveText(nextTranscript);
    }
    if (typeof data.statusText === "string" && data.statusText) {
      setStatus(data.statusText);
    }
    if (data.debug && typeof data.debug === "object") {
      const debug = data.debug as { wsState?: string; closeCode?: number | null; closeReason?: string | null };
      const debugText = [
        debug.wsState ? `ASR ${debug.wsState}` : null,
        debug.closeCode ? `close ${debug.closeCode}` : null,
        debug.closeReason ? debug.closeReason : null,
      ]
        .filter(Boolean)
        .join(" / ");

      if (debugText) {
        setCaptureDetails((current) => {
          const base = current.split(" · ")[0];
          return `${base} · ${debugText}`;
        });
      }
    }
  }

  async function createGatewaySession(jobId: string) {
    if (!jobId) {
      throw new Error("Live job is not ready");
    }

    const res = await fetch(`/api/jobs/${jobId}/live/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        language: "zh",
        turnDetectionMode: "server_vad",
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || "实时 ASR 会话准备失败");
    }

    if (json.data?.snapshot) {
      applyAudioSnapshotData(json.data.snapshot);
    }

    return json.data as GatewaySessionBootstrap;
  }

  function getBufferedByteLength() {
    return pcmChunksRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  }

  function getNextFlushByteLength(force = false) {
    const totalBytes = getBufferedByteLength();
    if (!totalBytes) {
      return 0;
    }

    if (force) {
      return Math.min(totalBytes, STREAM_CHUNK_BYTES * MAX_APPEND_CHUNKS_PER_EVENT);
    }

    if (totalBytes < STREAM_CHUNK_BYTES) {
      return 0;
    }

    const queuedChunks = Math.floor(totalBytes / STREAM_CHUNK_BYTES);
    if (queuedChunks <= BACKLOG_BATCH_THRESHOLD_CHUNKS) {
      return STREAM_CHUNK_BYTES;
    }

    const batchChunks = Math.min(
      MAX_APPEND_CHUNKS_PER_EVENT,
      Math.max(2, Math.ceil(queuedChunks / 3))
    );
    return STREAM_CHUNK_BYTES * batchChunks;
  }

  function pullBufferedBytes(targetByteLength: number) {
    const chunks: Uint8Array[] = [];
    let remaining = targetByteLength;

    while (remaining > 0 && pcmChunksRef.current.length) {
      const currentChunk = pcmChunksRef.current[0];

      if (currentChunk.byteLength <= remaining) {
        chunks.push(currentChunk);
        pcmChunksRef.current.shift();
        remaining -= currentChunk.byteLength;
        continue;
      }

      chunks.push(currentChunk.slice(0, remaining));
      pcmChunksRef.current[0] = currentChunk.slice(remaining);
      remaining = 0;
    }

    return mergeChunks(chunks);
  }

  function stopFlushLoop() {
    if (flushLoopRef.current === null) {
      return;
    }

    window.clearInterval(flushLoopRef.current);
    flushLoopRef.current = null;
  }

  function clearFinishFallbackTimer() {
    if (finishFallbackTimerRef.current === null) {
      return;
    }

    window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = null;
  }

  function startFlushLoop() {
    stopFlushLoop();
    flushLoopRef.current = window.setInterval(() => {
      if (!runningRef.current) {
        return;
      }

      for (let pass = 0; pass < MAX_FLUSH_PASSES_PER_TICK; pass += 1) {
        if (!flushAudio()) {
          break;
        }
      }
    }, STREAM_INTERVAL_MS);
  }

  function closeGatewaySocket(code = 1000, reason = "client closed") {
    gatewayReadyRef.current = false;
    const socket = gatewaySocketRef.current;
    gatewaySocketRef.current = null;

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      try {
        socket.close(code, reason);
      } catch {
        // ignore close failures
      }
    }
  }

  function flushAudio(force = false) {
    const socket = gatewaySocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !gatewayReadyRef.current) {
      return false;
    }

    if (!force && socket.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
      return false;
    }

    const targetByteLength = getNextFlushByteLength(force);
    if (!targetByteLength) {
      return false;
    }

    const payload = pullBufferedBytes(targetByteLength);

    if (!payload.byteLength) {
      return false;
    }

    socket.send(payload);
    return true;
  }

  function flushAllAudio() {
    let safety = 0;
    while (getBufferedByteLength() > 0 && safety < 2000) {
      if (!flushAudio(true)) {
        break;
      }
      safety += 1;
    }
  }

  async function finalizeLiveInterview(jobId: string, transcriptText: string, statusText: string) {
    const finalTranscript = transcriptText.trim();
    if (!finalTranscript || finalizePromiseRef.current) {
      return;
    }

    finalizePromiseRef.current = (async () => {
      if (audioUploadPromiseRef.current) {
        await audioUploadPromiseRef.current.catch(() => {
          // keep finalization alive even if raw audio upload failed
        });
      }

      const finalizeRes = await fetch(`/api/jobs/${jobId}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: finalTranscript,
          statusText,
          finalize: true,
        }),
      });
      const finalizeJson = await finalizeRes.json().catch(() => null);

      if (finalizeRes.ok && finalizeJson?.ok) {
        const finalizedTranscriptText =
          typeof finalizeJson.data?.transcript?.transcript_text === "string" && finalizeJson.data.transcript.transcript_text.trim()
            ? finalizeJson.data.transcript.transcript_text
            : finalTranscript;
        setLiveText(finalizedTranscriptText);
        onFinalized?.({
          job: finalizeJson.data.job,
          draftArtifacts: finalizeJson.data.draftArtifacts,
          transcriptText: finalizedTranscriptText,
          statusText: "实时访谈已停止，最终文稿已保存",
        });
        if (Array.isArray(finalizeJson.data?.draftArtifacts) && finalizeJson.data.draftArtifacts.length) {
          setStatus("实时访谈已停止，最终文稿已保存");
        } else {
          setStatus("实时访谈已停止，转写已保存");
        }
        onFinalizeSettled?.({
          success: true,
          statusText: "实时访谈已停止，最终文稿已保存",
        });
      } else {
        const failureStatus = finalizeJson?.error?.message || "实时访谈已停止，但最终保存失败";
        setStatus(failureStatus);
        onFinalizeSettled?.({
          success: false,
          statusText: failureStatus,
        });
      }
    })()
      .catch((error) => {
        const failureStatus = error instanceof Error ? error.message : "最终文稿保存失败";
        setStatus(failureStatus);
        onFinalizeSettled?.({
          success: false,
          statusText: failureStatus,
        });
      })
      .finally(() => {
        finalizePromiseRef.current = null;
        audioUploadPromiseRef.current = null;
        activeJobIdRef.current = null;
      });

    await finalizePromiseRef.current;
  }

  function scheduleFinalize(jobId: string, transcriptText: string, statusText: string) {
    void finalizeLiveInterview(jobId, transcriptText, statusText);
  }

  function handleGatewayMessage(message: GatewaySocketMessage) {
    if (message.snapshot) {
      applyAudioSnapshotData({
        ...message.snapshot,
        debug: message.debug,
      });
    }

    if (message.type === "session.ready") {
      gatewayReadyRef.current = true;
      setStatus("实时采集中：音频已接入阿里 ASR");
      flushAudio();
      return;
    }

    if (message.type === "session.finished") {
      gatewayReadyRef.current = false;
      clearFinishFallbackTimer();
      const jobId = activeJobIdRef.current;
      if (jobId) {
        const transcriptText =
          message.snapshot?.finalTranscriptText ||
          message.snapshot?.previewText ||
          liveTextRef.current;
        scheduleFinalize(jobId, transcriptText, "实时访谈已停止，正在整理最终文稿");
      }
      closeGatewaySocket();
      return;
    }

    if (message.type === "session.error") {
      setStatus(message.message || "实时 ASR 发生错误");
    }
  }

  async function openGatewaySocket(session: GatewaySessionBootstrap) {
    closeGatewaySocket();
    gatewayReadyRef.current = false;

    const deadline = Date.now() + GATEWAY_CONNECT_TIMEOUT_MS;
    let lastError: Error | null = null;
    let attempt = 0;

    while (Date.now() < deadline) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new WebSocket(session.wsUrl);
          let settled = false;

          gatewaySocketRef.current = socket;
          socket.binaryType = "arraybuffer";

          const fail = (message: string) => {
            if (!settled) {
              settled = true;
              reject(new Error(message));
            }
          };

          socket.onopen = () => {
            socket.send(
              JSON.stringify({
                type: "client.start",
                token: session.token,
                jobId: session.jobId,
                language: session.language,
                turnDetectionMode: session.turnDetectionMode,
              })
            );
          };

          socket.onmessage = (event) => {
            if (typeof event.data !== "string") {
              return;
            }

            try {
              const message = JSON.parse(event.data) as GatewaySocketMessage;
              handleGatewayMessage(message);

              if (message.type === "session.ready" && !settled) {
                settled = true;
                resolve();
              }

              if (message.type === "session.error") {
                fail(message.message || "实时 ASR 连接失败");
              }
            } catch {
              fail("实时 ASR 返回了无效消息");
            }
          };

          socket.onerror = () => {
            fail("实时 ASR 连接失败");
          };

          socket.onclose = () => {
            gatewayReadyRef.current = false;
            if (gatewaySocketRef.current === socket) {
              gatewaySocketRef.current = null;
            }
            if (!settled) {
              fail("实时 ASR 连接已关闭");
            }
          };
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("实时 ASR 连接失败");
        closeGatewaySocket();
        const retryDelay = Math.min(1000, GATEWAY_CONNECT_RETRY_BASE_MS * 2 ** attempt);
        attempt += 1;
        if (Date.now() + retryDelay >= deadline) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
      }
    }

    throw lastError || new Error("实时 ASR 连接失败");
  }

  function teardownAudioGraph() {
    processorNodeRef.current?.disconnect();
    sourceNodesRef.current.forEach((node) => node.disconnect());
    muteGainRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodesRef.current = [];
    muteGainRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        // ignore close failure
      });
      audioContextRef.current = null;
    }
  }

  async function uploadLiveAudioAsset(jobId: string, recordedChunks: Uint8Array[]) {
    if (!recordedChunks.length) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const wavFile = encodePcm16Wav(recordedChunks, TARGET_SAMPLE_RATE);
    const safeFileName = sanitizeFileName(wavFile.name || LIVE_WAV_FILE_NAME);
    const storagePath = `${user.id}/${jobId}/${crypto.randomUUID()}-${safeFileName}`;
    const durationSeconds = Number((Math.max(0, wavFile.size - 44) / (TARGET_SAMPLE_RATE * 2)).toFixed(2));
    const { error: storageError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, wavFile, {
        contentType: wavFile.type || "audio/wav",
        upsert: false,
      });

    if (storageError) {
      throw new Error(storageError.message || "实时录音上传失败");
    }

    const res = await fetch(`/api/jobs/${jobId}/live/audio-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath,
        fileName: safeFileName,
        fileSize: wavFile.size,
        mimeType: wavFile.type || "audio/wav",
        durationSeconds,
      }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]).catch(() => {
        // ignore cleanup failure
      });
      throw new Error(json?.error?.message || "实时录音保存失败");
    }
  }

  async function startLive() {
    if (pendingAction || isRunning) {
      return;
    }

    if (disabled) {
      setStatus(disabledReason);
      return;
    }

    setPendingAction("starting");
    pcmChunksRef.current = [];
    recordedPcmChunksRef.current = [];
    audioUploadPromiseRef.current = null;
    setLiveText("");
    setStatus("正在启动实时访谈");
    setCaptureDetails("正在请求浏览器权限");
    clearFinishFallbackTimer();
    closeGatewaySocket();
    activeJobIdRef.current = null;

    const cleanupTracks: MediaStreamTrack[] = [];
    const audioTracks: MediaStreamTrack[] = [];
    const usingMic = captureMode === "mic";
    const usingTabAudio = captureMode === "tab";

    try {
      setStatus(usingMic ? "正在请求麦克风权限" : "正在请求标签页音频权限");

      const ensurePromise = onEnsureJob?.() || Promise.resolve({ jobId: null, statusText: "无法创建实时访谈" });
      const micPromise = usingMic
        ? navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: { ideal: 1 },
              sampleRate: { ideal: TARGET_SAMPLE_RATE },
              sampleSize: { ideal: 16 },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          })
        : Promise.resolve(null);
      const displayPromise = usingTabAudio
        ? requestTabCaptureStream()
        : Promise.resolve(null);

      const [ensuredResult, micResult, displayResult] = await Promise.allSettled([
        ensurePromise,
        micPromise,
        displayPromise,
      ]);
      const ensured =
        ensuredResult.status === "fulfilled"
          ? ensuredResult.value
          : null;
      const micStream = micResult.status === "fulfilled" ? micResult.value : null;
      const displayStream = displayResult.status === "fulfilled" ? displayResult.value : null;
      const micError = micResult.status === "rejected" ? (micResult.reason instanceof Error ? micResult.reason.message : "麦克风未接入") : null;
      const displayError =
        displayResult.status === "rejected"
          ? (displayResult.reason instanceof Error ? displayResult.reason.message : "标签页音频未接入")
          : null;

      if (!ensured?.jobId) {
        cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
        cleanupTracks.forEach((track) => track.stop());
        setStatus(
          ensuredResult.status === "rejected"
            ? (ensuredResult.reason instanceof Error ? ensuredResult.reason.message : "无法创建实时访谈")
            : ensured?.statusText || "无法创建实时访谈"
        );
        return;
      }

      activeJobIdRef.current = ensured.jobId;
      const gatewaySessionPromise = createGatewaySession(ensured.jobId);

      const micAudioTracks = micStream?.getAudioTracks() || [];
      const displayAudioTracks = displayStream?.getAudioTracks() || [];

      cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
      audioTracks.push(...micAudioTracks, ...displayAudioTracks);

      const detailText = usingMic
        ? (micAudioTracks.length ? `麦克风 ${micAudioTracks.length} 轨` : "麦克风未接入")
        : (displayAudioTracks.length ? `标签页音频 ${displayAudioTracks.length} 轨` : "标签页音频未接入");
      const activeTrackSettings = usingMic
        ? describeTrackSettings(micAudioTracks[0])
        : describeTrackSettings(displayAudioTracks[0]);
      setCaptureDetails(activeTrackSettings ? `${detailText} · ${activeTrackSettings}` : detailText);

      const displayTrackSet = new Set(displayAudioTracks);
      cleanupTracks.forEach((track) => {
        track.addEventListener(
          "ended",
          () => {
            if (displayTrackSet.has(track)) {
              setStatus("浏览器标签页音频已中断，实时转写会停在最后一段。请重新开始并再次勾选“分享音频”。");
            } else if (track.kind === "audio") {
              setStatus("麦克风音频已中断，实时转写会停在最后一段。");
            }
          },
          { once: true }
        );
      });

      if (usingTabAudio && !displayAudioTracks.length) {
        setStatus("没有捕获到标签页音频。请重新选择“浏览器标签页”并勾选“分享音频”。");
      } else {
        setStatus("权限已获取，正在连接阿里实时 ASR");
      }

      if (!audioTracks.length) {
        throw new Error([micError, displayError].filter(Boolean).join("；") || "没有拿到任何音频轨道");
      }

      const audioContext = createCaptureAudioContext();
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      processorNode.onaudioprocess = (event) => {
        if (!runningRef.current) return;
        const pcmBytes = floatToPcm16Chunk(event.inputBuffer, audioContext.sampleRate);
        pcmChunksRef.current.push(pcmBytes);
        recordedPcmChunksRef.current.push(pcmBytes);
      };

      const sourceNodes: MediaStreamAudioSourceNode[] = [];
      const activeStream = usingMic ? micStream : displayStream;
      const activeTracks = usingMic ? micAudioTracks : displayAudioTracks;

      if (activeStream && activeTracks.length) {
        const sourceNode = audioContext.createMediaStreamSource(activeStream);
        sourceNode.connect(processorNode);
        sourceNodes.push(sourceNode);
      }

      processorNode.connect(muteGain);
      muteGain.connect(audioContext.destination);
      await audioContext.resume();

      audioContextRef.current = audioContext;
      sourceNodesRef.current = sourceNodes;
      processorNodeRef.current = processorNode;
      muteGainRef.current = muteGain;
      tracksRef.current = cleanupTracks;
      runningRef.current = true;
      setIsRunning(true);
      startFlushLoop();
      setPendingAction(null);

      if (usingMic && micError) {
        setStatus("麦克风未接入，请检查系统权限后重试。");
      } else if (usingTabAudio && displayError) {
        setStatus("标签页音频未接入，请重新选择标签页并勾选“分享音频”。");
      } else if (usingTabAudio && !displayAudioTracks.length) {
        setStatus("实时采集中，但当前没有标签页音轨。");
      } else {
        setStatus(`已开始本地采集：${detailText}，正在连接阿里 ASR`);
      }

      const gatewaySession = await gatewaySessionPromise;
      await openGatewaySocket(gatewaySession);
      for (let pass = 0; pass < MAX_FLUSH_PASSES_PER_TICK; pass += 1) {
        if (!flushAudio()) {
          break;
        }
      }
    } catch (error) {
      runningRef.current = false;
      setIsRunning(false);
      stopFlushLoop();
      teardownAudioGraph();
      cleanupTracks.forEach((track) => track.stop());
      tracksRef.current = [];
      closeGatewaySocket();
      activeJobIdRef.current = null;
      setCaptureDetails("启动失败");
      setStatus(error instanceof Error ? error.message : "无法启动实时访谈");
    } finally {
      setPendingAction(null);
    }
  }

  async function stopLive() {
    if (pendingAction === "stopping") {
      return;
    }

    setPendingAction("stopping");
    setStatus("正在停止并整理");
    setCaptureDetails("正在收尾当前转写");
    clearFinishFallbackTimer();
    const jobId = activeJobIdRef.current;
    const finalSnapshotFallback = liveText.trim();
    const recordedChunks = recordedPcmChunksRef.current.slice();
    recordedPcmChunksRef.current = [];
    runningRef.current = false;
    stopFlushLoop();
    tracksRef.current.forEach((track) => track.stop());
    tracksRef.current = [];
    teardownAudioGraph();

    try {
      flushAllAudio();

      if (jobId && recordedChunks.length) {
        audioUploadPromiseRef.current = uploadLiveAudioAsset(jobId, recordedChunks).catch((error) => {
          setStatus((current) => {
            const suffix = error instanceof Error ? error.message : "实时录音保存失败";
            return current.includes("录音保存失败") ? current : `${current}（${suffix}）`;
          });
        });
      } else {
        audioUploadPromiseRef.current = null;
      }

      if (gatewaySocketRef.current && gatewaySocketRef.current.readyState === WebSocket.OPEN) {
        gatewaySocketRef.current.send(
          JSON.stringify({
            type: "client.finish",
          })
        );
      }

      if (jobId) {
        onFinalizeStarted?.({
          jobId,
          transcriptText: finalSnapshotFallback,
          statusText: "实时访谈已停止，正在整理最终文稿",
        });
        finishFallbackTimerRef.current = window.setTimeout(() => {
          scheduleFinalize(jobId, finalSnapshotFallback, "实时访谈已停止，正在整理最终文稿");
          closeGatewaySocket();
        }, 1800);
      } else {
        setStatus("实时访谈已停止");
      }
    } catch (error) {
      if (jobId) {
        scheduleFinalize(jobId, finalSnapshotFallback, "实时访谈已停止，正在整理最终文稿");
      } else {
        setStatus(error instanceof Error ? error.message : "停止实时访谈失败");
      }
    } finally {
      setIsRunning(false);
      setCaptureDetails("未开始采集");
      setPendingAction(null);
      if (!jobId) {
        activeJobIdRef.current = null;
      } else {
        setStatus("实时访谈已停止，正在整理最终文稿");
      }
    }
  }

  const isStarting = pendingAction === "starting";
  const isStopping = pendingAction === "stopping";
  const startButtonDisabled = disabled || isStarting || isStopping;
  const stopButtonDisabled = isStopping;
  const sourceSummary = getSourceSummary({ captureMode });
  const transcriptToggleLabel = transcriptExpanded ? "收起转写" : "查看转写";

  return (
    <section className={`workspace-panel workspace-live-panel ${compact ? "workspace-live-compact" : ""} ${disabled ? "workspace-panel-disabled" : ""}`}>
      <div className={`workspace-live-header ${compact ? "workspace-live-header-compact workspace-live-header-condensed" : ""}`}>
        <div className="workspace-live-summary">
          <div className="workspace-live-summary-top">
            <span className="workspace-live-mode-pill">实时访谈</span>
            <span className="workspace-live-scene-pill">{sourceSummary}</span>
          </div>
          <div className="workspace-live-summary-bottom">
            <p className="workspace-live-status-line">{disabled ? disabledReason : status}</p>
            {!compact ? (
              <p className="workspace-live-detail-line">{disabled ? disabledReason : captureDetails}</p>
            ) : null}
          </div>
        </div>
        <div className="workspace-live-actions">
          {!isRunning ? (
            <Button
              onClick={startLive}
              className="workspace-primary-button workspace-live-button"
              disabled={startButtonDisabled}
            >
              <Radio className="h-4 w-4" />
              {isStarting ? "连接中…" : compact ? "开始" : "开始实时访谈"}
            </Button>
          ) : (
            <Button
              onClick={stopLive}
              variant="secondary"
              className="workspace-live-button"
              disabled={stopButtonDisabled}
            >
              <Square className="h-4 w-4" />
              {isStopping ? "停止中…" : "停止"}
            </Button>
          )}
          {compact ? (
            <button
              type="button"
              onClick={() => setTranscriptExpanded((value) => !value)}
              className="workspace-chip-button workspace-live-mini-button"
              disabled={disabled}
            >
              {transcriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {transcriptToggleLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="workspace-live-source-row">
        <div className="workspace-live-inline-meta">
          {compact ? (
            <span className="workspace-live-inline-copy">{disabled ? disabledReason : captureDetails}</span>
          ) : (
            <p className={`workspace-muted-copy ${compact ? "workspace-live-note-compact" : ""}`}>
              {sourceSummary}
            </p>
          )}
        </div>
        <div className="workspace-live-inline-actions">
          <button
            type="button"
            onClick={() => setShowSourceControls((value) => !value)}
            disabled={disabled || isRunning || isStarting || isStopping}
            className="workspace-chip-button workspace-live-mini-button"
            title={disabled ? disabledReason : undefined}
          >
            {showSourceControls ? "收起设置" : "调整采集源"}
          </button>
        </div>
      </div>

      {showSourceControls ? (
        <div className={`workspace-live-toggle-grid ${compact ? "workspace-live-toggle-grid-compact" : ""}`}>
          <button
            type="button"
            onClick={() => setCaptureMode("mic")}
            disabled={disabled || isRunning || isStarting || isStopping}
            title={disabled ? disabledReason : undefined}
            className={`workspace-toggle ${captureMode === "mic" ? "workspace-toggle-active" : ""}`}
          >
            <Mic className="h-4 w-4" />
            面对面访谈
          </button>
          <button
            type="button"
            onClick={() => setCaptureMode("tab")}
            disabled={disabled || isRunning || isStarting || isStopping}
            title={disabled ? disabledReason : undefined}
            className={`workspace-toggle ${captureMode === "tab" ? "workspace-toggle-active" : ""}`}
          >
            <ScreenShare className="h-4 w-4" />
            标签页会议
          </button>
        </div>
      ) : null}

      {!compact ? (
        <p className="workspace-muted-copy">
          开始前只保留一个采集场景：面对面访谈走麦克风，标签页会议走浏览器标签页音频。浏览器出于安全限制，必须由你点击“开始”后再授权；若是网页会议，请在系统弹窗里勾选“分享音频”。
        </p>
      ) : null}

      {(!compact || transcriptExpanded) ? (
        <div className={`workspace-live-transcript-shell ${compact ? "workspace-live-transcript-shell-compact" : ""}`}>
          <div className="workspace-live-transcript-head">
            <div className="workspace-live-transcript-status">
              <Waves className="h-4 w-4" />
              <span>{disabled ? disabledReason : status}</span>
            </div>
            {compact ? (
              <button
                type="button"
                onClick={() => setTranscriptExpanded(false)}
                className="workspace-flat-icon-button workspace-live-transcript-close"
                aria-label="收起转写"
                title="收起转写"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="workspace-live-transcript-detail">
            {disabled ? disabledReason : captureDetails}
          </div>
          <div className="workspace-live-transcript-box">
            {disabled ? disabledReason : liveText || "开始后显示转写。"}
          </div>
        </div>
      ) : null}
    </section>
  );
}
