"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { KemoLiveIcon, type KemoLiveIconName } from "@/components/kemo-live-icons";
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
const VISIBLE_WAVE_BAR_COUNT = 10;
const SILENT_WAVE_LEVEL = 0.08;

function createSilentWaveLevels() {
  return Array.from({ length: VISIBLE_WAVE_BAR_COUNT }, () => SILENT_WAVE_LEVEL);
}

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

type CaptureMode = "mic" | "system" | "tab";

const LIVE_PANEL_COPY = {
  zh: {
    options: {
      mic: { label: "面对面", description: "使用本机麦克风，适合线下面谈和单人记录。", icon: "mic" as KemoLiveIconName },
      system: { label: "会议 App", description: "捕获会议软件或电脑系统声音，适合飞书、Meet、Zoom。", icon: "people" as KemoLiveIconName },
      tab: { label: "浏览器页面", description: "选择任意已打开标签页，例如 YouTube、播客或网页直播。", icon: "tab" as KemoLiveIconName },
    },
    liveTranscript: "实时转写",
    sourceSummary: {
      mic: "当前场景：面对面访谈",
      system: "当前场景：会议App音频",
      tab: "当前场景：浏览器页面",
    },
    permissionStatus: {
      mic: "正在请求麦克风权限",
      system: "请选择会议窗口或整个屏幕，并确保勾选系统音频",
      tab: "请选择要监听的浏览器标签页，并勾选“分享音频”",
    },
    modePill: "实时访谈",
    sourceSwitchAria: "选择会议来源",
    disabledReason: "请先创建项目",
    ready: "准备开始",
    notStarted: "未开始",
    liveJobNotReady: "实时任务尚未就绪",
    gatewaySessionFailed: "实时转写会话准备失败",
    finalSaveFailed: "最终文稿保存失败",
    draftSyncFailed: "实时草稿同步失败",
    finalSaved: "实时访谈已停止，最终文稿已保存",
    transcriptSaved: "实时访谈已停止，转写已保存",
    pausedSynced: "已暂停，转写已同步",
    stoppedSaveFailed: "实时访谈已停止，但最终保存失败",
    sessionReady: "实时采集中：音频已接入",
    finalizing: "实时访谈已停止，正在整理最终文稿",
    sessionError: "实时转写发生错误",
    connectFailed: "实时转写连接失败",
    invalidMessage: "实时转写返回了无效消息",
    closed: "实时转写连接已关闭",
    recordingSaveFailed: "实时录音保存失败",
    starting: "正在启动实时访谈",
    requestingPermission: "正在请求浏览器权限",
    createLiveFailed: "无法创建实时访谈",
    micMissing: "麦克风未接入",
    displayMissing: "标签页音频未接入",
    systemMissing: "会议音频未接入",
    noAudio: "没有捕获到音频。请重新选择捕获源并务必勾选“分享音频”。",
    permissionsGranted: "权限已获取，正在连接实时转写",
    noTracks: "没有拿到任何音频轨道",
    micTrackCount: (count: number) => `麦克风 ${count} 轨`,
    systemTrackCount: (count: number) => `会议/系统音频 ${count} 轨`,
    tabTrackCount: (count: number) => `浏览器页面音频 ${count} 轨`,
    tabInterrupted: "浏览器标签页音频已中断，实时转写会停在最后一段。请重新开始并再次勾选“分享音频”。",
    micInterrupted: "麦克风音频已中断，实时转写会停在最后一段。",
    micRetry: "麦克风未接入，请检查系统权限后重试。",
    displayRetry: "系统/标签页音频未接入，请重新选择并勾选“分享音频”。",
    noDisplayAudio: "实时采集中，但当前没有捕获到系统/标签页音轨。",
    startedCapture: (label: string) => `已开始采集 ${label}，正在连接实时转写`,
    launchFailed: "无法启动实时访谈",
    stopping: "正在停止并整理",
    finalizingDetails: "正在收尾当前转写",
    stopped: "实时访谈已停止",
    stopFailed: "停止实时访谈失败",
    notStartedCapture: "未开始采集",
    pausing: "正在暂停",
    savingProgress: "保存当前进度",
    pausedContinue: "已暂停，可随时继续",
    paused: "已暂停",
    collapseTranscript: "收起转写",
    showTranscript: "查看转写",
    completed: "录音已整理结束",
    startConnecting: "正在连接...",
    startProcessing: "开始处理",
    pausePending: "暂停中...",
    pauseRecording: "暂停录制",
    stopPending: "正在停止...",
    finishProcessing: "结束处理",
    tabModeHint: "浏览器页面模式会列出其他已打开标签页；选择目标页后记得勾选“分享音频”。",
  },
  en: {
    options: {
      mic: { label: "In person", description: "Use this device microphone for in-person interviews or solo notes.", icon: "mic" as KemoLiveIconName },
      system: { label: "Meeting app", description: "Capture meeting or system audio from apps such as Meet, Zoom, or Teams.", icon: "people" as KemoLiveIconName },
      tab: { label: "Browser tab", description: "Select an open tab, such as a stream, podcast, or web meeting.", icon: "tab" as KemoLiveIconName },
    },
    liveTranscript: "live transcription",
    sourceSummary: {
      mic: "Current source: in-person interview",
      system: "Current source: meeting app audio",
      tab: "Current source: browser tab",
    },
    permissionStatus: {
      mic: "Requesting microphone permission",
      system: "Select a meeting window or screen and enable system audio",
      tab: "Select the browser tab to monitor and enable shared audio",
    },
    modePill: "Live interview",
    sourceSwitchAria: "Choose meeting source",
    disabledReason: "Create a project first",
    ready: "Ready to start",
    notStarted: "Not started",
    liveJobNotReady: "Live job is not ready",
    gatewaySessionFailed: "Unable to prepare live transcription session",
    finalSaveFailed: "Unable to save the final transcript",
    draftSyncFailed: "Unable to sync the live draft",
    finalSaved: "Live interview stopped. Final transcript saved.",
    transcriptSaved: "Live interview stopped. Transcript saved.",
    pausedSynced: "Paused. Transcript synced.",
    stoppedSaveFailed: "Live interview stopped, but final save failed.",
    sessionReady: "Live capture running: audio connected",
    finalizing: "Live interview stopped. Preparing the final transcript.",
    sessionError: "Live transcription failed",
    connectFailed: "Unable to connect live transcription",
    invalidMessage: "Live transcription returned an invalid message",
    closed: "Live transcription connection closed",
    recordingSaveFailed: "Unable to save live recording",
    starting: "Starting live interview",
    requestingPermission: "Requesting browser permission",
    createLiveFailed: "Unable to create live interview",
    micMissing: "Microphone not connected",
    displayMissing: "Tab audio not connected",
    systemMissing: "Meeting audio not connected",
    noAudio: "No audio was captured. Choose the source again and enable shared audio.",
    permissionsGranted: "Permission granted. Connecting live transcription.",
    noTracks: "No audio tracks were available",
    micTrackCount: (count: number) => `${count} microphone track${count === 1 ? "" : "s"}`,
    systemTrackCount: (count: number) => `${count} meeting/system audio track${count === 1 ? "" : "s"}`,
    tabTrackCount: (count: number) => `${count} browser tab audio track${count === 1 ? "" : "s"}`,
    tabInterrupted: "Browser tab audio stopped. Live transcription will stay on the last segment. Restart and enable shared audio again.",
    micInterrupted: "Microphone audio stopped. Live transcription will stay on the last segment.",
    micRetry: "Microphone is not connected. Check system permissions and try again.",
    displayRetry: "System or tab audio is not connected. Select the source again and enable shared audio.",
    noDisplayAudio: "Live capture is running, but no system or tab audio track was captured.",
    startedCapture: (label: string) => `Started ${label}. Connecting live transcription.`,
    launchFailed: "Unable to start live interview",
    stopping: "Stopping and finalizing",
    finalizingDetails: "Finishing the current transcript",
    stopped: "Live interview stopped",
    stopFailed: "Unable to stop live interview",
    notStartedCapture: "Capture not started",
    pausing: "Pausing",
    savingProgress: "Saving current progress",
    pausedContinue: "Paused. You can continue any time.",
    paused: "Paused",
    collapseTranscript: "Hide transcript",
    showTranscript: "View transcript",
    completed: "Recording has been finalized",
    startConnecting: "Connecting...",
    startProcessing: "Start processing",
    pausePending: "Pausing...",
    pauseRecording: "Pause recording",
    stopPending: "Stopping...",
    finishProcessing: "Finish processing",
    tabModeHint: "Browser tab mode lists other open tabs. Select the target tab and enable shared audio.",
  },
} as const;

type LivePanelCopy = (typeof LIVE_PANEL_COPY)[keyof typeof LIVE_PANEL_COPY];

function getLivePanelCopy(locale?: string): LivePanelCopy {
  return locale?.toLowerCase().startsWith("en") ? LIVE_PANEL_COPY.en : LIVE_PANEL_COPY.zh;
}

function getCaptureModeOptions(copy: LivePanelCopy): Array<{
  mode: CaptureMode;
  label: string;
  description: string;
  icon: KemoLiveIconName;
}> {
  return [
    { mode: "mic", ...copy.options.mic },
    { mode: "system", ...copy.options.system },
    { mode: "tab", ...copy.options.tab },
  ];
}

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

function getAudioLevel(inputBuffer: AudioBuffer) {
  let sumSquares = 0;
  let sampleCount = 0;

  for (let channel = 0; channel < inputBuffer.numberOfChannels; channel += 1) {
    const channelData = inputBuffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      const sample = channelData[index];
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }

  if (!sampleCount) return SILENT_WAVE_LEVEL;

  const rms = Math.sqrt(sumSquares / sampleCount);
  return Math.max(SILENT_WAVE_LEVEL, Math.min(1, Math.pow(rms * 8, 0.72)));
}

function getPublicStatusText(statusText: string, copy: LivePanelCopy) {
  return statusText
    .replace(/阿里实时\s*ASR|阿里\s*ASR|实时\s*ASR|ASR/gi, copy.liveTranscript)
    .replace(/Realtime\s+ASR/gi, copy.liveTranscript)
    .replace(/\s+/g, " ")
    .trim();
}

function getSourceSummary(captureMode: CaptureMode, copy: LivePanelCopy) {
  return copy.sourceSummary[captureMode];
}

function getCaptureModeLabel(captureMode: CaptureMode, copy: LivePanelCopy) {
  return copy.options[captureMode].label;
}

function getCapturePermissionStatus(captureMode: CaptureMode, copy: LivePanelCopy) {
  return copy.permissionStatus[captureMode];
}

function formatElapsedTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
  }

  return [minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
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

function createCaptureAudioContext() {
  try {
    return new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
}

async function requestTabCaptureStream(mode: "tab" | "system", copy: LivePanelCopy) {
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
      systemAudio: mode === "system" ? "include" : "exclude",
      preferCurrentTab: false,
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
    },
    {
      video: true,
      audio: true,
      systemAudio: mode === "system" ? "include" : "exclude",
      preferCurrentTab: false,
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
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

  throw lastError instanceof Error ? lastError : new Error(mode === "tab" ? copy.displayMissing : copy.systemMissing);
}

export function LiveInterviewPanel({
  locale = "zh",
  onTranscriptChange,
  onStatusChange,
  onEnsureJob,
  onFinalizeStarted,
  onFinalizeSettled,
  onFinalized,
  onDraftSynced,
  onRuntimeStateChange,
  afterRecorderSlot,
  disabled = false,
  disabledReason,
  compact = false,
  isCompleted = false,
}: {
  locale?: string;
  onTranscriptChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onEnsureJob?: () => Promise<StartLiveResult>;
  onFinalizeStarted?: (payload: { jobId: string | null; transcriptText: string; statusText: string }) => void;
  onFinalizeSettled?: (payload: { success: boolean; statusText: string }) => void;
  onFinalized?: (payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string; statusText: string }) => void;
  onDraftSynced?: (payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string }) => void;
  onRuntimeStateChange?: (payload: { isRunning: boolean; pendingAction: "starting" | "stopping" | "pausing" | null; elapsedSeconds: number }) => void;
  afterRecorderSlot?: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  isCompleted?: boolean;
}) {
  const copy = getLivePanelCopy(locale);
  const normalizedDisabledReason = disabledReason || copy.disabledReason;
  const [captureMode, setCaptureMode] = useState<CaptureMode>("mic");
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState<string>(copy.ready);
  const [captureDetails, setCaptureDetails] = useState<string>(copy.notStarted);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingAction, setPendingAction] = useState<"starting" | "stopping" | "pausing" | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [waveLevels, setWaveLevels] = useState<number[]>(createSilentWaveLevels);

  const activeJobIdRef = useRef<string | null>(null);
  const liveTextRef = useRef("");
  const statusRef = useRef(status);
  const liveStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    onRuntimeStateChange?.({ isRunning, pendingAction, elapsedSeconds });
  }, [elapsedSeconds, isRunning, onRuntimeStateChange, pendingAction]);
  const elapsedTimerRef = useRef<number | null>(null);
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
  const draftSyncTimerRef = useRef<number | null>(null);
  const draftSyncPromiseRef = useRef<Promise<void> | null>(null);
  const draftSyncQueuedRef = useRef<{ jobId: string; transcriptText: string } | null>(null);
  const lastDraftSyncTextRef = useRef("");
  const audioUploadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    liveTextRef.current = liveText;
    onTranscriptChange?.(liveText);
  }, [liveText, onTranscriptChange]);

  useEffect(() => {
    onStatusChange?.(status);
    statusRef.current = status;
  }, [onStatusChange, status]);

  useEffect(() => {
    return () => {
      stopFlushLoop();
      closeGatewaySocket();
      clearFinishFallbackTimer();
      clearDraftSyncTimer();
      stopElapsedTimer();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedMode = window.localStorage.getItem("kemo-live-capture-mode");
    if (savedMode === "mic" || savedMode === "system" || savedMode === "tab") {
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
      setStatus(getPublicStatusText(data.statusText, copy));
    }
  }

  async function createGatewaySession(jobId: string) {
    if (!jobId) {
      throw new Error(copy.liveJobNotReady);
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
      throw new Error(getPublicStatusText(json?.error?.message || copy.gatewaySessionFailed, copy));
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

  function clearDraftSyncTimer() {
    if (draftSyncTimerRef.current === null) {
      return;
    }

    window.clearTimeout(draftSyncTimerRef.current);
    draftSyncTimerRef.current = null;
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    setElapsedSeconds(0);
    liveStartedAtRef.current = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      if (!liveStartedAtRef.current) {
        return;
      }

      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - liveStartedAtRef.current) / 1000)));
    }, 1000);
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

  const submitLiveInterview = useCallback(async (jobId: string, transcriptText: string, statusText: string, finalize = true) => {
    const finalTranscript = transcriptText.trim();
    if (!finalTranscript) {
      return null;
    }

    if (finalize) {
      if (audioUploadPromiseRef.current) {
        await audioUploadPromiseRef.current.catch(() => {});
      }

      if (draftSyncPromiseRef.current) {
        await draftSyncPromiseRef.current.catch(() => {});
      }
    }

    const response = await fetch(`/api/jobs/${jobId}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcriptText: finalTranscript,
        statusText,
        finalize,
      }),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.ok) {
      throw new Error(json?.error?.message || (finalize ? copy.finalSaveFailed : copy.draftSyncFailed));
    }

    const savedTranscriptText =
      typeof json.data?.transcript?.transcript_text === "string" && json.data.transcript.transcript_text.trim()
        ? json.data.transcript.transcript_text
        : finalTranscript;

    return {
      job: json.data.job,
      draftArtifacts: json.data.draftArtifacts,
      transcriptText: savedTranscriptText,
    };
  }, [copy.draftSyncFailed, copy.finalSaveFailed]);

  const scheduleDraftSync = useCallback((jobId: string, transcriptText: string, statusText: string) => {
    const trimmedTranscript = transcriptText.trim();
    if (!trimmedTranscript || !runningRef.current || finalizePromiseRef.current) {
      return;
    }

    if (trimmedTranscript === lastDraftSyncTextRef.current) {
      return;
    }

    if (draftSyncPromiseRef.current) {
      draftSyncQueuedRef.current = { jobId, transcriptText: trimmedTranscript };
      return;
    }

    if (draftSyncTimerRef.current !== null) {
      draftSyncQueuedRef.current = { jobId, transcriptText: trimmedTranscript };
      return;
    }

    draftSyncTimerRef.current = window.setTimeout(() => {
      draftSyncTimerRef.current = null;
      const queuedDraft = draftSyncQueuedRef.current;
      draftSyncQueuedRef.current = null;
      const nextDraft = queuedDraft || { jobId, transcriptText: trimmedTranscript };

      if (
        !runningRef.current ||
        finalizePromiseRef.current ||
        activeJobIdRef.current !== nextDraft.jobId ||
        nextDraft.transcriptText === lastDraftSyncTextRef.current
      ) {
        return;
      }

      draftSyncPromiseRef.current = submitLiveInterview(nextDraft.jobId, nextDraft.transcriptText, statusRef.current || statusText, false)
        .then((result) => {
          if (!result) {
            return;
          }

          lastDraftSyncTextRef.current = result.transcriptText;
          if (result.transcriptText !== liveTextRef.current) {
            setLiveText(result.transcriptText);
          }

          onDraftSynced?.({
            job: result.job,
            draftArtifacts: result.draftArtifacts,
            transcriptText: result.transcriptText,
          });
        })
        .catch((error) => {
          if (error instanceof Error) {
            const publicMessage = getPublicStatusText(error.message, copy);
            setCaptureDetails((current) => current.includes(publicMessage) ? current : `${current} · ${publicMessage}`);
          }
        })
        .finally(() => {
          draftSyncPromiseRef.current = null;
          const pendingDraft = draftSyncQueuedRef.current;
          draftSyncQueuedRef.current = null;

          if (pendingDraft && runningRef.current && !finalizePromiseRef.current && activeJobIdRef.current === pendingDraft.jobId) {
            scheduleDraftSync(pendingDraft.jobId, pendingDraft.transcriptText, statusRef.current);
          }
        });
    }, 2400);
  }, [copy, onDraftSynced, submitLiveInterview]);

  useEffect(() => {
    if (!runningRef.current || pendingAction || !activeJobIdRef.current) {
      clearDraftSyncTimer();
      return;
    }

    const trimmedTranscript = liveText.trim();
    if (trimmedTranscript.length < 24 || trimmedTranscript === lastDraftSyncTextRef.current) {
      return;
    }

    scheduleDraftSync(activeJobIdRef.current, trimmedTranscript, statusRef.current);
  }, [liveText, pendingAction, scheduleDraftSync]);

  async function finalizeLiveInterview(jobId: string, transcriptText: string, statusText: string, finalize = true) {
    const finalTranscript = transcriptText.trim();
    if (!finalTranscript || finalizePromiseRef.current) {
      return;
    }

    finalizePromiseRef.current = (async () => {
      clearDraftSyncTimer();
      if (draftSyncPromiseRef.current) {
        await draftSyncPromiseRef.current.catch(() => {});
      }

      if (audioUploadPromiseRef.current) {
        await audioUploadPromiseRef.current.catch(() => {});
      }

      const finalizeRes = await fetch(`/api/jobs/${jobId}/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: finalTranscript,
          statusText,
          finalize,
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
          statusText: copy.finalSaved,
        });
        if (finalize) {
          if (Array.isArray(finalizeJson.data?.draftArtifacts) && finalizeJson.data.draftArtifacts.length) {
            setStatus(copy.finalSaved);
          } else {
            setStatus(copy.transcriptSaved);
          }
          onFinalizeSettled?.({
            success: true,
            statusText: copy.finalSaved,
          });
        } else {
          setStatus(copy.pausedSynced);
        }
      } else {
        const failureStatus = finalizeJson?.error?.message || copy.stoppedSaveFailed;
        setStatus(failureStatus);
        onFinalizeSettled?.({
          success: false,
          statusText: failureStatus,
        });
      }
    })()
      .catch((error) => {
        const failureStatus = error instanceof Error ? error.message : copy.finalSaveFailed;
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

  function scheduleFinalize(jobId: string, transcriptText: string, statusText: string, finalize = true) {
    void finalizeLiveInterview(jobId, transcriptText, statusText, finalize);
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
      setStatus(copy.sessionReady);
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
        scheduleFinalize(jobId, transcriptText, copy.finalizing);
      }
      closeGatewaySocket();
      return;
    }

    if (message.type === "session.error") {
      setStatus(getPublicStatusText(message.message || copy.sessionError, copy));
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
                fail(getPublicStatusText(message.message || copy.connectFailed, copy));
              }
            } catch {
              fail(copy.invalidMessage);
            }
          };

          socket.onerror = () => {
            fail(copy.connectFailed);
          };

          socket.onclose = () => {
            gatewayReadyRef.current = false;
            if (gatewaySocketRef.current === socket) {
              gatewaySocketRef.current = null;
            }
            if (!settled) {
              fail(copy.closed);
            }
          };
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? new Error(getPublicStatusText(error.message, copy)) : new Error(copy.connectFailed);
        closeGatewaySocket();
        const retryDelay = Math.min(1000, GATEWAY_CONNECT_RETRY_BASE_MS * 2 ** attempt);
        attempt += 1;
        if (Date.now() + retryDelay >= deadline) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
      }
    }

    throw lastError || new Error(copy.connectFailed);
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
    const durationSeconds = Math.max(0, (wavFile.size - 44) / (TARGET_SAMPLE_RATE * 2));
    const { error: storageError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, wavFile, {
        contentType: wavFile.type || "audio/wav",
        upsert: false,
      });

    if (storageError) {
      throw new Error(copy.recordingSaveFailed);
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
      throw new Error(copy.recordingSaveFailed);
    }
  }

  async function startLive() {
    if (pendingAction || isRunning) {
      return;
    }

    if (disabled) {
      setStatus(normalizedDisabledReason);
      return;
    }

    setPendingAction("starting");
    pcmChunksRef.current = [];
    recordedPcmChunksRef.current = [];
    audioUploadPromiseRef.current = null;
    setWaveLevels(createSilentWaveLevels());
    lastDraftSyncTextRef.current = "";
    draftSyncQueuedRef.current = null;
    clearDraftSyncTimer();
    setLiveText("");
    setElapsedSeconds(0);
    setStatus(copy.starting);
    setCaptureDetails(copy.requestingPermission);
    clearFinishFallbackTimer();
    closeGatewaySocket();
    activeJobIdRef.current = null;

    const cleanupTracks: MediaStreamTrack[] = [];
    const audioTracks: MediaStreamTrack[] = [];
    const usingMic = captureMode === "mic";
    const usingDisplayAudio = captureMode === "tab" || captureMode === "system";

    try {
      setStatus(getCapturePermissionStatus(captureMode, copy));

      const ensurePromise = onEnsureJob?.() || Promise.resolve({ jobId: null, statusText: copy.createLiveFailed });
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
      const displayPromise = (captureMode === "tab" || captureMode === "system")
        ? requestTabCaptureStream(captureMode, copy)
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
      const micError = micResult.status === "rejected" ? (micResult.reason instanceof Error ? micResult.reason.message : copy.micMissing) : null;
      const displayError =
        displayResult.status === "rejected"
          ? (displayResult.reason instanceof Error ? displayResult.reason.message : copy.displayMissing)
          : null;

      if (!ensured?.jobId) {
        cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
        cleanupTracks.forEach((track) => track.stop());
        setStatus(
          ensuredResult.status === "rejected"
            ? (ensuredResult.reason instanceof Error ? ensuredResult.reason.message : copy.createLiveFailed)
            : ensured?.statusText || copy.createLiveFailed
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
        ? (micAudioTracks.length ? copy.micTrackCount(micAudioTracks.length) : copy.micMissing)
        : captureMode === "system"
          ? (displayAudioTracks.length ? copy.systemTrackCount(displayAudioTracks.length) : copy.systemMissing)
          : (displayAudioTracks.length ? copy.tabTrackCount(displayAudioTracks.length) : copy.displayMissing);
      setCaptureDetails(detailText);

      const displayTrackSet = new Set(displayAudioTracks);
      cleanupTracks.forEach((track) => {
        track.addEventListener(
          "ended",
          () => {
            if (displayTrackSet.has(track)) {
              setStatus(copy.tabInterrupted);
            } else if (track.kind === "audio") {
              setStatus(copy.micInterrupted);
            }
          },
          { once: true }
        );
      });

      if (usingDisplayAudio && !displayAudioTracks.length) {
        setStatus(copy.noAudio);
      } else {
        setStatus(copy.permissionsGranted);
      }

      if (!audioTracks.length) {
        throw new Error([micError, displayError].filter(Boolean).join(locale?.toLowerCase().startsWith("en") ? "; " : "；") || copy.noTracks);
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
        const audioLevel = getAudioLevel(event.inputBuffer);
        setWaveLevels((levels) => {
          const nextLevels = levels.slice(-VISIBLE_WAVE_BAR_COUNT + 1);
          nextLevels.push(audioLevel);
          return nextLevels;
        });
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
      startElapsedTimer();
      startFlushLoop();
      setPendingAction(null);

      if (usingMic && micError) {
        setStatus(copy.micRetry);
      } else if (usingDisplayAudio && displayError) {
        setStatus(copy.displayRetry);
      } else if (usingDisplayAudio && !displayAudioTracks.length) {
        setStatus(copy.noDisplayAudio);
      } else {
        setStatus(copy.startedCapture(getCaptureModeLabel(captureMode, copy)));
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
      stopElapsedTimer();
      liveStartedAtRef.current = null;
      teardownAudioGraph();
      cleanupTracks.forEach((track) => track.stop());
      tracksRef.current = [];
      closeGatewaySocket();
      activeJobIdRef.current = null;
      setWaveLevels(createSilentWaveLevels());
      setCaptureDetails(copy.launchFailed);
      setStatus(error instanceof Error ? getPublicStatusText(error.message, copy) : copy.launchFailed);
    } finally {
      setPendingAction(null);
    }
  }

  async function stopLive() {
    if (pendingAction === "stopping") {
      return;
    }

    setPendingAction("stopping");
    setStatus(copy.stopping);
    setCaptureDetails(copy.finalizingDetails);
    setTranscriptExpanded(false);
    clearFinishFallbackTimer();
    clearDraftSyncTimer();
    const jobId = activeJobIdRef.current;
    const finalSnapshotFallback = liveText.trim();
    const recordedChunks = recordedPcmChunksRef.current.slice();
    recordedPcmChunksRef.current = [];
    runningRef.current = false;
    stopFlushLoop();
    stopElapsedTimer();
    tracksRef.current.forEach((track) => track.stop());
    tracksRef.current = [];
    teardownAudioGraph();

    try {
      flushAllAudio();

      if (jobId && recordedChunks.length) {
        audioUploadPromiseRef.current = uploadLiveAudioAsset(jobId, recordedChunks).catch(() => {
          setStatus((current) => {
            const suffix = copy.recordingSaveFailed;
            return current.includes(suffix) ? current : `${current} (${suffix})`;
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
          statusText: copy.finalizing,
        });
        finishFallbackTimerRef.current = window.setTimeout(() => {
          scheduleFinalize(jobId, finalSnapshotFallback, copy.finalizing);
          closeGatewaySocket();
        }, 1800);
      } else {
        setStatus(copy.stopped);
      }
    } catch (error) {
      if (jobId) {
        scheduleFinalize(jobId, finalSnapshotFallback, copy.finalizing);
      } else {
        setStatus(error instanceof Error ? error.message : copy.stopFailed);
      }
    } finally {
      setIsRunning(false);
      setCaptureDetails(copy.notStartedCapture);
      setWaveLevels(createSilentWaveLevels());
      setPendingAction(null);
      liveStartedAtRef.current = null;
      if (!jobId) {
        activeJobIdRef.current = null;
      } else {
        setStatus(copy.finalizing);
      }
    }
  }

  async function pauseLive() {
    if (pendingAction === "stopping" || pendingAction === "pausing") {
      return;
    }

    setPendingAction("pausing");
    setStatus(copy.pausing);
    setCaptureDetails(copy.savingProgress);
    setTranscriptExpanded(false);
    clearFinishFallbackTimer();
    clearDraftSyncTimer();

    const jobId = activeJobIdRef.current;
    const finalSnapshotFallback = liveText.trim();
    const recordedChunks = recordedPcmChunksRef.current.slice();
    recordedPcmChunksRef.current = [];
    runningRef.current = false;
    stopFlushLoop();
    stopElapsedTimer();
    tracksRef.current.forEach((track) => track.stop());
    tracksRef.current = [];
    teardownAudioGraph();

    try {
      flushAllAudio();

      if (jobId && recordedChunks.length) {
        audioUploadPromiseRef.current = uploadLiveAudioAsset(jobId, recordedChunks).catch(() => {});
      } else {
        audioUploadPromiseRef.current = null;
      }

      if (gatewaySocketRef.current && gatewaySocketRef.current.readyState === WebSocket.OPEN) {
        gatewaySocketRef.current.send(JSON.stringify({ type: "client.finish" }));
      }

      if (jobId) {
        finishFallbackTimerRef.current = window.setTimeout(() => {
          scheduleFinalize(jobId, finalSnapshotFallback, copy.pausedContinue, false);
          closeGatewaySocket();
        }, 1800);
      } else {
        setStatus(copy.paused);
      }
    } catch {
      if (jobId) {
        scheduleFinalize(jobId, finalSnapshotFallback, copy.paused, false);
      }
    } finally {
      setIsRunning(false);
      setCaptureDetails(copy.notStartedCapture);
      setWaveLevels(createSilentWaveLevels());
      setPendingAction(null);
      liveStartedAtRef.current = null;
      activeJobIdRef.current = null;
      setStatus(copy.pausedContinue);
    }
  }

  const isStarting = pendingAction === "starting";
  const isStopping = pendingAction === "stopping";
  const startButtonDisabled = disabled || isStarting || isStopping;
  const stopButtonDisabled = isStopping;
  const sourceSummary = getSourceSummary(captureMode, copy);
  const transcriptToggleLabel = transcriptExpanded ? copy.collapseTranscript : copy.showTranscript;
  const recorderTimeLabel = formatElapsedTime(elapsedSeconds);

  return (
    <section className={`workspace-panel workspace-live-panel ${compact ? "workspace-live-compact" : ""} ${disabled ? "workspace-panel-disabled" : ""}`}>
      <div className={`flex flex-col mb-1 ${compact ? "hidden" : "workspace-live-header"}`}>
        <div className="workspace-live-summary">
          <div className="workspace-live-summary-top">
            <span className="workspace-live-mode-pill">{copy.modePill}</span>
            <span className="workspace-live-scene-pill">{sourceSummary}</span>
          </div>
          <div className="workspace-live-summary-bottom">
            <p className="workspace-live-status-line">{disabled ? normalizedDisabledReason : status}</p>
            <p className="workspace-live-detail-line">{disabled ? normalizedDisabledReason : captureDetails}</p>
          </div>
        </div>
      </div>

      <div className={`workspace-live-control-row ${compact ? "workspace-live-control-row-compact" : ""}`}>
        <div className="workspace-live-source-switch" aria-label={copy.sourceSwitchAria}>
        {getCaptureModeOptions(copy).map((option) => {
          const isActive = captureMode === option.mode;

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => setCaptureMode(option.mode)}
              disabled={disabled || isRunning || isStarting || isStopping}
              title={disabled ? normalizedDisabledReason : option.description}
              aria-pressed={isActive}
              className={`workspace-live-source-option workspace-live-source-option-${option.mode} ${isActive ? "active" : ""}`}
            >
              <KemoLiveIcon name={option.icon} className="workspace-live-source-option-icon" />
              <span>{option.label}</span>
            </button>
          );
        })}
        </div>
        <div className="workspace-live-control-divider" />
        {isCompleted ? (
          <span className="text-sm font-semibold text-[#0969da] bg-[#eef6ff] dark:bg-[#071d36] dark:text-[#58a6ff] px-4 py-2 rounded-[6px] whitespace-nowrap shrink-0 border border-[#0969da]/20">
            {copy.completed}
          </span>
        ) : !isRunning ? (
          <Button
            onClick={startLive}
            className="workspace-live-start-button"
            data-kemo-live-action="start"
            disabled={startButtonDisabled}
          >
            {isStarting ? copy.startConnecting : copy.startProcessing}
          </Button>
        ) : (
          <div className="flex items-center gap-4">
            <Button
              onClick={pauseLive}
              variant="secondary"
              className="workspace-live-secondary-button"
              data-kemo-live-action="pause"
              disabled={stopButtonDisabled || pendingAction === "pausing"}
            >
              <KemoLiveIcon name="stop" className="h-4 w-4 mr-2" />
              {pendingAction === "pausing" ? copy.pausePending : copy.pauseRecording}
            </Button>
            <Button
              onClick={stopLive}
              variant="destructive"
              className="workspace-live-danger-button"
              data-kemo-live-action="stop"
              disabled={stopButtonDisabled}
            >
              <KemoLiveIcon name="stop" className="h-4 w-4 mr-2" />
                {isStopping ? copy.stopPending : copy.finishProcessing}
            </Button>
          </div>
        )}
      </div>

      {isRunning ? (
        <div className="workspace-live-running-visual">
          <div className="workspace-live-waveform workspace-live-running-waveform" aria-hidden="true">
            {waveLevels.map((level, index) => (
              <span
                key={`visible-wave-bar-${index}`}
                className="workspace-live-running-wave-bar"
                style={{
                  height: `${6 + level * 18}px`,
                  opacity: 0.38 + level * 0.62,
                }}
              />
            ))}
          </div>
          <span className="workspace-live-running-timer">{recorderTimeLabel}</span>
        </div>
      ) : null}

      {afterRecorderSlot ? (
        <div className="workspace-live-after-recorder">
          {afterRecorderSlot}
        </div>
      ) : null}

      <div className="workspace-live-source-row">
        <div className="workspace-live-inline-meta">
          <span className="workspace-live-inline-copy">{disabled ? normalizedDisabledReason : captureDetails}</span>
        </div>
        <div className={captureMode === "tab" ? "workspace-live-inline-actions" : "hidden"}>
          <span className="workspace-live-inline-hint">
            {copy.tabModeHint}
          </span>
        </div>
      </div>

      {liveText ? (
        <div className="mt-4 flex flex-col">
          <div className="flex justify-end px-1 mb-2">
            <button
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors outline-none font-medium"
            >
              {transcriptToggleLabel}
            </button>
          </div>
          {transcriptExpanded ? (
            <div className={`px-1 pb-4 ${compact ? "" : "workspace-live-transcript-shell"}`}>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {disabled ? normalizedDisabledReason : liveText}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
