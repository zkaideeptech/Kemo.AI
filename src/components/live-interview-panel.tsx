"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { Mic, Radio, ScreenShare, Square, Upload } from "lucide-react";

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

export type CaptureMode = "mic" | "system" | "tab" | "upload";

const CAPTURE_MODE_OPTIONS: Array<{
  mode: CaptureMode;
  label: string;
  description: string;
  icon: typeof Mic;
}> = [
  {
    mode: "mic",
    label: "Face-to-Face",
    description: "Use the local microphone for in-person interviews and direct capture.",
    icon: Mic,
  },
  {
    mode: "system",
    label: "Meeting App",
    description: "Capture meeting software or system audio for multi-speaker sessions.",
    icon: ScreenShare,
  },
  {
    mode: "tab",
    label: "Browser Page",
    description: "Capture a browser tab such as YouTube, podcasts, or a web stream.",
    icon: Radio,
  },
  {
    mode: "upload",
    label: "Upload File",
    description: "Upload an existing audio/video file for analysis.",
    icon: Upload,
  },
];

const RECORDER_BAR_LEVELS = [0.9, 0.72, 0.56, 0.78, 0.38, 0.34, 0.66, 0.82, 0.61, 0.44, 0.5, 0.7, 0.3, 0.36, 0.42, 0.58, 0.74, 0.28];
const RECORDER_BAR_COUNT = 18;

function getCaptureModeOptions(locale: string): Array<{
  mode: CaptureMode;
  label: string;
  description: string;
  icon: typeof Mic;
}> {
  const isZh = locale !== "en";

  return [
    {
      mode: "mic",
      label: isZh ? "\u9762\u5bf9\u9762" : "Face-to-Face",
      description: isZh
        ? "\u4f7f\u7528\u672c\u673a\u9ea6\u514b\u98ce\uff0c\u9002\u5408\u7ebf\u4e0b\u91c7\u8bbf\u3001\u5355\u4eba\u8bb0\u5f55\u548c\u73b0\u573a\u8bbf\u8c08\u3002"
        : "Use the local microphone for in-person interviews and direct capture.",
      icon: CAPTURE_MODE_OPTIONS[0]?.icon || Mic,
    },
    {
      mode: "system",
      label: isZh ? "\u4f1a\u8bae App" : "Meeting App",
      description: isZh
        ? "\u6355\u83b7\u98de\u4e66\u3001Meet\u3001Zoom \u7b49\u4f1a\u8bae\u8f6f\u4ef6\u6216\u7cfb\u7edf\u97f3\u9891\u3002"
        : "Capture meeting software or system audio for multi-speaker sessions.",
      icon: CAPTURE_MODE_OPTIONS[1]?.icon || ScreenShare,
    },
    {
      mode: "tab",
      label: isZh ? "\u6d4f\u89c8\u5668\u9875\u9762" : "Browser Page",
      description: isZh
        ? "\u9009\u62e9\u6d4f\u89c8\u5668\u6807\u7b7e\u9875\uff0c\u4f8b\u5982 YouTube\u3001\u64ad\u5ba2\u6216\u7f51\u9875\u76f4\u64ad\u3002"
        : "Capture a browser tab such as YouTube, podcasts, or a web stream.",
      icon: CAPTURE_MODE_OPTIONS[2]?.icon || Radio,
    },
    {
      mode: "upload",
      label: isZh ? "\u4e0a\u4f20\u6587\u4ef6" : "Upload File",
      description: isZh ? "\u4e00\u6b21\u6027\u6574\u7406\u672c\u5730\u97f3\u9891\u3001\u89c6\u9891\u6216\u6587\u6863\u3002" : "Upload an existing audio/video file for analysis.",
      icon: CAPTURE_MODE_OPTIONS[3]?.icon || Upload,
    },
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

function getSourceSummary({
  captureMode,
}: {
  captureMode: CaptureMode;
}) {
  if (captureMode === "tab") return "\u5f53\u524d\u573a\u666f\uff1a\u6d4f\u89c8\u5668\u9875\u9762";
  if (captureMode === "system") return "\u5f53\u524d\u573a\u666f\uff1a\u4f1a\u8bae App \u97f3\u9891";
  return "\u5f53\u524d\u573a\u666f\uff1a\u9762\u5bf9\u9762\u8bbf\u8c08";
}

function getCaptureModeLabel(captureMode: CaptureMode) {
  if (captureMode === "tab") return "\u6d4f\u89c8\u5668\u9875\u9762";
  if (captureMode === "system") return "\u4f1a\u8bae App";
  return "\u9762\u5bf9\u9762";
}

function getCapturePermissionStatus(captureMode: CaptureMode) {
  if (captureMode === "tab") {
    return "\u8bf7\u9009\u62e9\u8981\u76d1\u542c\u7684\u6d4f\u89c8\u5668\u6807\u7b7e\u9875\uff0c\u5e76\u52fe\u9009\u201c\u5206\u4eab\u97f3\u9891\u201d\u3002";
  }

  if (captureMode === "system") {
    return "\u8bf7\u9009\u62e9\u4f1a\u8bae\u7a97\u53e3\u6216\u6574\u4e2a\u5c4f\u5e55\uff0c\u5e76\u786e\u4fdd\u52fe\u9009\u7cfb\u7edf\u97f3\u9891\u3002";
  }

  return "\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650";
}

function getLocalizedSourceSummary(captureMode: CaptureMode, locale: string) {
  const isZh = locale !== "en";
  if (captureMode === "tab") return isZh ? "\u5f53\u524d\u573a\u666f\uff1a\u6d4f\u89c8\u5668\u9875\u9762" : "Scene: Browser Page";
  if (captureMode === "system") return isZh ? "\u5f53\u524d\u573a\u666f\uff1a\u4f1a\u8bae App \u97f3\u9891" : "Scene: Meeting App Audio";
  return isZh ? "\u5f53\u524d\u573a\u666f\uff1a\u9762\u5bf9\u9762\u8bbf\u8c08" : "Scene: Face-to-Face Interview";
}

function getLocalizedCaptureModeLabel(captureMode: CaptureMode, locale: string) {
  const isZh = locale !== "en";
  if (captureMode === "tab") return isZh ? "\u6d4f\u89c8\u5668\u9875\u9762" : "Browser Page";
  if (captureMode === "system") return isZh ? "\u4f1a\u8bae App" : "Meeting App";
  return isZh ? "\u9762\u5bf9\u9762" : "Face-to-Face";
}

function getLocalizedCapturePermissionStatus(captureMode: CaptureMode, locale: string) {
  const isZh = locale !== "en";
  if (captureMode === "tab") {
    return isZh
      ? "\u8bf7\u9009\u62e9\u8981\u76d1\u542c\u7684\u6d4f\u89c8\u5668\u6807\u7b7e\u9875\uff0c\u5e76\u52fe\u9009\u201c\u5206\u4eab\u97f3\u9891\u201d\u3002"
      : "Choose the browser tab and enable audio sharing";
  }

  if (captureMode === "system") {
    return isZh
      ? "\u8bf7\u9009\u62e9\u4f1a\u8bae\u7a97\u53e3\u6216\u6574\u4e2a\u5c4f\u5e55\uff0c\u5e76\u786e\u4fdd\u52fe\u9009\u7cfb\u7edf\u97f3\u9891\u3002"
      : "Choose the meeting window or screen and enable system audio";
  }

  return isZh ? "\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce\u6743\u9650" : "Requesting microphone permission";
}

void getSourceSummary;
void getCaptureModeLabel;
void getCapturePermissionStatus;

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

async function requestTabCaptureStream(mode: "tab" | "system", locale: string) {
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

  throw lastError instanceof Error
    ? lastError
    : new Error(
        locale !== "en"
          ? mode === "tab"
            ? "\u6d4f\u89c8\u5668\u9875\u9762\u97f3\u9891\u672a\u63a5\u5165"
             : "\u4f1a\u8bae\u97f3\u9891\u672a\u63a5\u5165"
          : mode === "tab"
            ? "Browser page audio was not connected"
            : "Meeting audio was not connected"
      );
}

export function LiveInterviewPanel({
  onTranscriptChange,
  onStatusChange,
  onEnsureJob,
  onFinalizeStarted,
  onFinalizeSettled,
  onFinalized,
  afterRecorderSlot,
  preferredCaptureMode,
  theme = "dark",
  disabled = false,
  disabledReason = "Create a project first",
  compact = false,
  hideTranscript = false,
  jobCompleted = false,
  onUploadFile,
}: {
  onTranscriptChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onEnsureJob?: () => Promise<StartLiveResult>;
  onFinalizeStarted?: (payload: { jobId: string | null; transcriptText: string; statusText: string }) => void;
  onFinalizeSettled?: (payload: { success: boolean; statusText: string }) => void;
  onFinalized?: (payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string; statusText: string }) => void;
  afterRecorderSlot?: ReactNode;
  preferredCaptureMode?: CaptureMode;
  theme?: "light" | "dark";
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  hideTranscript?: boolean;
  jobCompleted?: boolean;
  onUploadFile?: (file: File) => void;
}) {
  const locale = useLocale();
  const isZh = locale !== "en";
  const isDarkTheme = theme === "dark";
  const captureModeOptions = getCaptureModeOptions(locale);
  const themeClasses = isDarkTheme
    ? {
        shell: "bg-[#111314] text-[#e5e2e3]",
        pickerShell: "border-white/8 bg-white/[0.03]",
        modeCard: "border-white/8 bg-black/10 hover:border-white/14 hover:bg-white/[0.05]",
        modeCardActive:
          "border-[#48F9DB]/28 bg-[#00dcbf]/10 shadow-[0_0_0_1px_rgba(0,220,191,0.08),0_12px_34px_rgba(0,220,191,0.08)]",
        modeIcon: "border-white/8 bg-white/[0.03] text-[#97ada8]",
        modeIconActive: "border-[#48F9DB]/18 bg-[#00dcbf]/12 text-[#48F9DB]",
        modeLabel: "text-[#dbe7e4]",
        modeMeta: "text-[#6f817c]",
        actionShell: "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))]",
        actionIcon: "border-white/8 bg-white/[0.03] text-[#97ada8]",
        stageShell:
          "border-[#3b4a46]/40 bg-[radial-gradient(circle_at_top,rgba(0,220,191,0.12),transparent_50%),linear-gradient(135deg,#0d1111,#161b1b_54%,#0b0f0f)]",
        stageIcon: "border-[#00dcbf]/18 bg-[#00dcbf]/10 text-[#48f9db]",
        stagePill: "border-white/8 bg-white/[0.03] text-[#c7d2cf]",
        statCard: "border-white/8 bg-white/[0.03]",
        statLabel: "text-[#7fa29b]",
        statValue: "text-white",
        statNote: "text-[#8fa39d]",
        emptyShell: "border-dashed border-white/10 bg-black/20",
        emptyPill: "border-white/8 bg-white/[0.03] text-[#c7d2cf]",
        transcriptText: "text-[#dbe7e4]",
        transcriptBox: "border-white/8 bg-black/20",
        transcriptDivider: "border-white/6",
        sourceNote: "text-[#7fa29b]",
        sourceValue: "text-white",
        sourceValueMuted: "text-[#c7d2cf]",
      }
    : {
        shell: "bg-[#f6f1e8] text-[#1a1c1c]",
        pickerShell: "border-[#dacfc3] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(248,241,232,0.94))]",
        modeCard: "border-[#eadfce] bg-[#fffaf4] hover:border-[#cfa98a] hover:bg-white",
        modeCardActive:
          "border-[#cfa98a] bg-[#fff4e6] shadow-[0_16px_32px_rgba(138,90,60,0.12)]",
        modeIcon: "border-[#eadfce] bg-[#fff6ec] text-[#8a5a3c]",
        modeIconActive: "border-[#d8c0ab] bg-[#fff1e1] text-[#8a5a3c]",
        modeLabel: "text-[#1a1c1c]",
        modeMeta: "text-[#8a5a3c]",
        actionShell:
          "border-[#e3d7ca] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(247,240,230,0.96))]",
        actionIcon: "border-[#eadfce] bg-[#fff6ec] text-[#8a5a3c]",
        stageShell:
          "border-[#d9cbbd] bg-[radial-gradient(circle_at_top,rgba(138,90,60,0.14),transparent_50%),linear-gradient(135deg,rgba(255,253,249,0.98),rgba(244,236,225,0.96)_58%,rgba(237,228,216,0.98))]",
        stageIcon: "border-[#eadfce] bg-[#fff1e1] text-[#8a5a3c]",
        stagePill: "border-[#d8c0ab] bg-[#fff6ec] text-[#8a5a3c]",
        statCard: "border-[#eadfce] bg-white/80",
        statLabel: "text-[#7c6f66]",
        statValue: "text-[#1a1c1c]",
        statNote: "text-[#7c6f66]",
        emptyShell: "border-dashed border-[#dacfc3] bg-white/75",
        emptyPill: "border-[#d8c0ab] bg-[#fff6ec] text-[#8a5a3c]",
        transcriptText: "text-[#334155]",
        transcriptBox: "border-[#eadfce] bg-white/80",
        transcriptDivider: "border-[#efe4d9]",
        sourceNote: "text-[#7c6f66]",
        sourceValue: "text-[#1a1c1c]",
        sourceValueMuted: "text-[#7c6f66]",
      };
  const copy = {
    ready: isZh ? "\u5df2\u5c31\u7eea" : "Ready",
    notStarted: isZh ? "\u672a\u5f00\u59cb" : "Idle",
    starting: isZh ? "\u6b63\u5728\u8fde\u63a5\u5b9e\u65f6\u8bbf\u8c08" : "Connecting live capture",
    requestingPermission: isZh ? "\u6b63\u5728\u8bf7\u6c42\u6743\u9650" : "Requesting permission",
    failedToStart: isZh ? "\u65e0\u6cd5\u5f00\u59cb\u5b9e\u65f6\u8bbf\u8c08" : "Unable to start",
    startFailed: isZh ? "\u5f00\u59cb\u5931\u8d25" : "Start failed",
    stopping: isZh ? "\u6b63\u5728\u505c\u6b62" : "Stopping",
    wrappingUp: isZh ? "\u6b63\u5728\u6574\u7406\u8f6c\u5199" : "Wrapping up transcript",
    stopped: isZh ? "\u5df2\u505c\u6b62" : "Stopped",
    finalizing: isZh ? "\u6b63\u5728\u6574\u7406\u6700\u7ec8\u6587\u7a3f" : "Preparing final deliverables",
    finalized: isZh ? "\u6700\u7ec8\u6587\u7a3f\u5df2\u4fdd\u5b58" : "Final deliverables saved",
    faceTitle: isZh ? "\u9762\u5bf9\u9762" : "In Person",
    meetingTitle: isZh ? "\u4f1a\u8bae App" : "Virtual Meeting",
    browserTitle: isZh ? "\u6d4f\u89c8\u5668\u9875\u9762" : "Browser Tab",
    uploadTitle: isZh ? "\u4e0a\u4f20\u6587\u4ef6" : "Upload File",
    selectFile: isZh ? "选择文件上传" : "Select file to upload",
    transcriptSaved: isZh ? "\u8f6c\u5199\u5df2\u4fdd\u5b58" : "Transcript saved",
    livePill: isZh ? "\u5b9e\u65f6\u5f55\u97f3" : "LIVE",
    openTranscript: isZh ? "\u8f6c\u5199" : "Transcript",
    collapseTranscript: isZh ? "\u6536\u8d77" : "Hide",
    prepareLive: isZh ? "\u51c6\u5907\u5f00\u59cb" : "Ready",
    selectSource: isZh ? "\u9009\u62e9\u573a\u666f\u540e\u5f00\u59cb\uff0c\u4f1a\u81ea\u52a8\u63a5\u5165\u8f6c\u5199\u3002" : "Pick a scene, then start capture.",
    startCapture: isZh ? "\u5f00\u59cb" : "Start",
    connecting: isZh ? "\u8fde\u63a5\u4e2d..." : "Connecting...",
    endAndOrganize: isZh ? "\u7ed3\u675f" : "Stop",
    stoppingShort: isZh ? "\u505c\u6b62\u4e2d..." : "Stopping...",
    transcriptPlaceholder: isZh ? "\u5f00\u59cb\u540e\u8fd9\u91cc\u4f1a\u663e\u793a\u8f6c\u5199\u3002" : "Live transcript appears here after capture starts.",
    faceDesc: isZh ? "\u66f4\u9002\u5408\u5355\u4eba\u6df1\u804a\u3001\u7ebf\u4e0b\u91c7\u8bbf\u548c\u9762\u5bf9\u9762\u7eaa\u8981\u91c7\u96c6\u3002" : "Best for in-person interviews, field notes, and direct conversations.",
    meetingDesc: isZh ? "\u66f4\u9002\u5408\u98de\u4e66\u3001Meet\u3001Zoom \u7b49\u591a\u65b9\u4f1a\u8bae\uff0c\u5f3a\u8c03\u7cfb\u7edf\u97f3\u9891\u6355\u83b7\u3002" : "Best for Feishu, Meet, Zoom, and multi-party system-audio capture.",
    browserDesc: isZh ? "\u4fdd\u7559\u5f53\u524d\u8f7b\u91cf\u6d41\u7a0b\uff0c\u7528\u4e8e\u7f51\u9875\u4f1a\u8bae\u3001\u64ad\u5ba2\u6216\u76f4\u64ad\u6807\u7b7e\u9875\u3002" : "Keep the lightweight browser flow for web meetings, podcasts, or live tabs.",
    micTip: isZh ? "\u8bf7\u786e\u8ba4\u9ea6\u514b\u98ce\u6743\u9650\u548c\u73af\u5883\u5b89\u9759\u5ea6\u3002" : "Make sure microphone permissions are enabled and the room is quiet.",
    systemTip: isZh ? "\u8bf7\u9009\u62e9\u4f1a\u8bae\u7a97\u53e3\u5e76\u52fe\u9009\u7cfb\u7edf\u97f3\u9891\u3002" : "Choose the meeting window and enable system audio.",
    tabTip: isZh ? "\u8bf7\u9009\u62e9\u6b63\u786e\u6807\u7b7e\u9875\u5e76\u52fe\u9009\u5206\u4eab\u97f3\u9891\u3002" : "Choose the right browser tab and enable audio sharing.",
  };
  const [captureMode, setCaptureMode] = useState<CaptureMode>("mic");
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState(copy.ready);
  const [captureDetails, setCaptureDetails] = useState(copy.notStarted);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingAction, setPendingAction] = useState<"starting" | "stopping" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const liveTextRef = useRef("");
  const liveStartedAtRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const recordedPcmChunksRef = useRef<Uint8Array[]>([]);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const flushLoopRef = useRef<number | null>(null);
  const gatewaySocketRef = useRef<WebSocket | null>(null);
  const gatewayReadyRef = useRef(false);
  const finishFallbackTimerRef = useRef<number | null>(null);
  const finalizePromiseRef = useRef<Promise<void> | null>(null);
  const audioUploadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!isRunning && !liveTextRef.current) {
      setStatus(copy.ready);
      setCaptureDetails(copy.notStarted);
    }
  }, [copy.notStarted, copy.ready, isRunning]);

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
    if (!preferredCaptureMode || isRunning) {
      return;
    }

    setCaptureMode(preferredCaptureMode);
  }, [isRunning, preferredCaptureMode]);

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

    console.log(`[LivePanel] createGatewaySession: posting to /api/jobs/${jobId}/live/audio`);
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
    console.log(`[LivePanel] createGatewaySession response: ok=${res.ok} json.ok=${json.ok}`, JSON.stringify(json).slice(0, 500));
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || (isZh ? "\u5b9e\u65f6 ASR \u4f1a\u8bdd\u51c6\u5907\u5931\u8d25" : "Failed to prepare the live ASR session"));
    }

    if (json.data?.snapshot) {
      applyAudioSnapshotData(json.data.snapshot);
    }

    console.log(`[LivePanel] createGatewaySession: wsUrl=${json.data?.wsUrl} token=${json.data?.token?.slice(0, 20)}...`);
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

      flushLogCounter += 1;
      if (flushLogCounter % 62 === 1) {
        const buffered = getBufferedByteLength();
        const socketReady = gatewaySocketRef.current?.readyState === WebSocket.OPEN;
        const gwReady = gatewayReadyRef.current;
        console.log(`[LivePanel] flushLoop tick #${flushLogCounter} buffered=${buffered}bytes socketOpen=${socketReady} gwReady=${gwReady}`);
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

  // Periodic log of audio flush stats (log every ~5s = 62 ticks at 80ms)
  let flushLogCounter = 0;

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
          streaming: true,
        }),
      });

      // ── Streaming path: read newline-delimited JSON events ──
      if (finalizeRes.ok && finalizeRes.body) {
        const reader = finalizeRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: Record<string, unknown> | null = null;
        let hadError = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              try {
                const event = JSON.parse(trimmed) as {
                  type: string;
                  step?: number;
                  totalSteps?: number;
                  statusText?: string;
                  kind?: string;
                  artifact?: unknown;
                  result?: Record<string, unknown>;
                  message?: string;
                };

                if (event.type === "progress" && event.statusText) {
                  const progressLabel = event.step && event.totalSteps
                    ? `(${event.step}/${event.totalSteps}) ${event.statusText}`
                    : event.statusText;
                  setStatus(progressLabel);
                }

                if (event.type === "artifact" && event.artifact) {
                  // Each artifact arrives as it's generated — no need to wait for all
                }

                if (event.type === "complete" && event.result) {
                  finalResult = event.result;
                }

                if (event.type === "error") {
                  hadError = true;
                  const failureStatus = event.message || (isZh ? "\u5b9e\u65f6\u8bbf\u8c08\u5df2\u505c\u6b62\uff0c\u4f46\u6700\u7ec8\u4fdd\u5b58\u5931\u8d25" : "Live capture stopped, but final save failed");
                  setStatus(failureStatus);
                  onFinalizeSettled?.({
                    success: false,
                    statusText: failureStatus,
                  });
                }
              } catch {
                // skip malformed JSON lines
              }
            }
          }
        } catch {
          // stream reading error — treat as network-level failure
          if (!finalResult && !hadError) {
            hadError = true;
            const failureStatus = isZh ? "\u6d41\u5f0f\u8bfb\u53d6\u4e2d\u65ad" : "Stream reading interrupted";
            setStatus(failureStatus);
            onFinalizeSettled?.({ success: false, statusText: failureStatus });
          }
        }

        // Process the final result
        if (finalResult && !hadError) {
          const data = (finalResult as { ok?: boolean; data?: Record<string, unknown> }).data;
          if (data) {
            const finalizedTranscriptText =
              typeof (data.transcript as Record<string, unknown>)?.transcript_text === "string" &&
              ((data.transcript as Record<string, unknown>).transcript_text as string).trim()
                ? (data.transcript as Record<string, unknown>).transcript_text as string
                : finalTranscript;
            setLiveText(finalizedTranscriptText);
            onFinalized?.({
              job: data.job,
              draftArtifacts: data.draftArtifacts as unknown[],
              transcriptText: finalizedTranscriptText,
              statusText: copy.finalized,
            });
            if (Array.isArray(data.draftArtifacts) && data.draftArtifacts.length) {
              setStatus(copy.finalized);
            } else {
              setStatus(copy.transcriptSaved);
            }
            onFinalizeSettled?.({
              success: true,
              statusText: copy.finalized,
            });
          }
        }

        return;
      }

      // ── Fallback: non-streaming JSON path ──
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
          statusText: copy.finalized,
        });
        if (Array.isArray(finalizeJson.data?.draftArtifacts) && finalizeJson.data.draftArtifacts.length) {
          setStatus(copy.finalized);
        } else {
          setStatus(copy.transcriptSaved);
        }
        onFinalizeSettled?.({
          success: true,
          statusText: copy.finalized,
        });
      } else {
        const failureStatus = finalizeJson?.error?.message || (isZh ? "\u5b9e\u65f6\u8bbf\u8c08\u5df2\u505c\u6b62\uff0c\u4f46\u6700\u7ec8\u4fdd\u5b58\u5931\u8d25" : "Live capture stopped, but final save failed");
        setStatus(failureStatus);
        onFinalizeSettled?.({
          success: false,
          statusText: failureStatus,
        });
      }
    })()
      .catch((error) => {
        const failureStatus = error instanceof Error ? error.message : (isZh ? "\u6700\u7ec8\u6587\u7a3f\u4fdd\u5b58\u5931\u8d25" : "Final save failed");
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
      setStatus(isZh ? "\u5b9e\u65f6\u91c7\u96c6\u4e2d\uff1a\u97f3\u9891\u5df2\u63a5\u5165 ASR" : "Live capture active: audio connected to ASR");
      console.log("[LivePanel] gateway session.ready received, flushing queued audio");
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
      setStatus(message.message || (isZh ? "\u5b9e\u65f6 ASR \u53d1\u751f\u9519\u8bef" : "Live ASR reported an error"));
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
          const wsUrlObj = new URL(session.wsUrl);
          if (wsUrlObj.hostname === "localhost") {
            wsUrlObj.hostname = "127.0.0.1";
          } else if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
            wsUrlObj.hostname = window.location.hostname;
          }
          const socket = new WebSocket(wsUrlObj.toString());
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
            console.log("[LivePanel] gateway WS opened, sending client.start");
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
              console.log(`[LivePanel] gateway message type=${message.type}`, message.snapshot?.previewText?.slice(0, 60) || "");
              handleGatewayMessage(message);

              if (message.type === "session.ready" && !settled) {
                settled = true;
                resolve();
              }

              if (message.type === "session.error") {
                fail(message.message || (isZh ? "\u5b9e\u65f6 ASR \u8fde\u63a5\u5931\u8d25" : "Live ASR connection failed"));
              }
            } catch {
              fail(isZh ? "\u5b9e\u65f6 ASR \u8fd4\u56de\u4e86\u65e0\u6548\u6d88\u606f" : "Live ASR returned an invalid message");
            }
          };

          socket.onerror = () => {
            fail(isZh ? "\u5b9e\u65f6 ASR \u8fde\u63a5\u5931\u8d25" : "Live ASR connection failed");
          };

          socket.onclose = () => {
            gatewayReadyRef.current = false;
            if (gatewaySocketRef.current === socket) {
              gatewaySocketRef.current = null;
            }
            if (!settled) {
              fail(isZh ? "\u5b9e\u65f6 ASR \u8fde\u63a5\u5df2\u5173\u95ed" : "Live ASR connection closed");
            }
          };
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(isZh ? "\u5b9e\u65f6 ASR \u8fde\u63a5\u5931\u8d25" : "Live ASR connection failed");
        closeGatewaySocket();
        const retryDelay = Math.min(1000, GATEWAY_CONNECT_RETRY_BASE_MS * 2 ** attempt);
        attempt += 1;
        if (Date.now() + retryDelay >= deadline) {
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
      }
    }

    throw lastError || new Error(isZh ? "\u5b9e\u65f6 ASR \u8fde\u63a5\u5931\u8d25" : "Live ASR connection failed");
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
      throw new Error(storageError.message || (isZh ? "\u5b9e\u65f6\u5f55\u97f3\u4e0a\u4f20\u5931\u8d25" : "Live recording upload failed"));
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
      throw new Error(json?.error?.message || (isZh ? "\u5b9e\u65f6\u5f55\u97f3\u4fdd\u5b58\u5931\u8d25" : "Live recording save failed"));
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

    if (captureMode === "upload") {
      fileInputRef.current?.click();
      return;
    }

    setPendingAction("starting");
    pcmChunksRef.current = [];
    recordedPcmChunksRef.current = [];
    audioUploadPromiseRef.current = null;
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
      setStatus(getLocalizedCapturePermissionStatus(captureMode, locale));

      const ensurePromise = onEnsureJob?.() || Promise.resolve({ jobId: null, statusText: copy.failedToStart });
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
        ? requestTabCaptureStream(captureMode, locale)
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
      const micError = micResult.status === "rejected" ? (micResult.reason instanceof Error ? micResult.reason.message : (isZh ? "\u9ea6\u514b\u98ce\u672a\u63a5\u5165" : "Microphone not connected")) : null;
      const displayError =
        displayResult.status === "rejected"
          ? (displayResult.reason instanceof Error ? displayResult.reason.message : (isZh ? "\u6807\u7b7e\u9875\u97f3\u9891\u672a\u63a5\u5165" : "Browser audio not connected"))
          : null;

      if (!ensured?.jobId) {
        console.warn(`[LivePanel] ensureJob returned no jobId:`, ensured);
        cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
        cleanupTracks.forEach((track) => track.stop());
        setStatus(
          ensuredResult.status === "rejected"
            ? (ensuredResult.reason instanceof Error ? ensuredResult.reason.message : copy.failedToStart)
            : ensured?.statusText || copy.failedToStart
        );
        return;
      }

      console.log(`[LivePanel] ensureJob success: jobId=${ensured.jobId}`);

      activeJobIdRef.current = ensured.jobId;
      const gatewaySessionPromise = createGatewaySession(ensured.jobId);

      const micAudioTracks = micStream?.getAudioTracks() || [];
      const displayAudioTracks = displayStream?.getAudioTracks() || [];

      cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
      audioTracks.push(...micAudioTracks, ...displayAudioTracks);

      const detailText = usingMic
        ? (micAudioTracks.length
            ? `${isZh ? "\u9ea6\u514b\u98ce" : "Microphone"} ${micAudioTracks.length} ${isZh ? "\u8f68" : "track(s)"}`
            : (isZh ? "\u9ea6\u514b\u98ce\u672a\u63a5\u5165" : "Microphone not connected"))
        : captureMode === "system"
          ? (displayAudioTracks.length
              ? `${isZh ? "\u4f1a\u8bae/\u7cfb\u7edf\u97f3\u9891" : "Meeting/System Audio"} ${displayAudioTracks.length} ${isZh ? "\u8f68" : "track(s)"}`
              : (isZh ? "\u4f1a\u8bae\u97f3\u9891\u672a\u63a5\u5165" : "Meeting audio not connected"))
          : (displayAudioTracks.length
              ? `${isZh ? "\u6d4f\u89c8\u5668\u9875\u9762\u97f3\u9891" : "Browser Audio"} ${displayAudioTracks.length} ${isZh ? "\u8f68" : "track(s)"}`
              : (isZh ? "\u6d4f\u89c8\u5668\u9875\u9762\u97f3\u9891\u672a\u63a5\u5165" : "Browser audio not connected"));
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
              setStatus(
                isZh
                  ? "\u6d4f\u89c8\u5668\u6807\u7b7e\u9875\u97f3\u9891\u5df2\u4e2d\u65ad\uff0c\u5b9e\u65f6\u8f6c\u5199\u4f1a\u505c\u5728\u6700\u540e\u4e00\u6bb5\u3002\u8bf7\u91cd\u65b0\u5f00\u59cb\u5e76\u518d\u6b21\u52fe\u9009\u201c\u5206\u4eab\u97f3\u9891\u201d\u3002"
                  : "Browser tab audio stopped. The transcript will stay on the last captured segment."
              );
            } else if (track.kind === "audio") {
              setStatus(
                isZh
                  ? "\u9ea6\u514b\u98ce\u97f3\u9891\u5df2\u4e2d\u65ad\uff0c\u5b9e\u65f6\u8f6c\u5199\u4f1a\u505c\u5728\u6700\u540e\u4e00\u6bb5\u3002"
                  : "Microphone audio stopped. The transcript will stay on the last captured segment."
              );
            }
          },
          { once: true }
        );
      });

      if (usingDisplayAudio && !displayAudioTracks.length) {
        setStatus(
          isZh
            ? "\u6ca1\u6709\u6355\u83b7\u5230\u97f3\u9891\u3002\u8bf7\u91cd\u65b0\u9009\u62e9\u6355\u83b7\u6e90\u5e76\u52a1\u5fc5\u52fe\u9009\u201c\u5206\u4eab\u97f3\u9891\u201d\u3002"
            : "No audio was captured. Re-select the source and make sure audio sharing is enabled."
        );
      } else {
        setStatus(isZh ? "\u6743\u9650\u5df2\u83b7\u53d6\uff0c\u6b63\u5728\u8fde\u63a5\u5b9e\u65f6 ASR" : "Permissions granted. Connecting to live ASR");
      }

      if (!audioTracks.length) {
        throw new Error([micError, displayError].filter(Boolean).join(isZh ? "\uff1b" : "; ") || (isZh ? "\u6ca1\u6709\u62ff\u5230\u4efb\u4f55\u97f3\u9891\u8f68\u9053" : "No audio track was available"));
      }

      const audioContext = createCaptureAudioContext();
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      processorNode.onaudioprocess = (event) => {
        if (!runningRef.current || pausedRef.current) return;
        const pcmBytes = floatToPcm16Chunk(event.inputBuffer, audioContext.sampleRate);
        pcmChunksRef.current.push(pcmBytes);
        recordedPcmChunksRef.current.push(pcmBytes);
        // Log every 50th chunk (~3.2s at 4096 frames)
        if (recordedPcmChunksRef.current.length % 50 === 1) {
          console.log(`[LivePanel] audioprocess chunk #${recordedPcmChunksRef.current.length} bytes=${pcmBytes.byteLength} sampleRate=${audioContext.sampleRate} bufferSize=${pcmChunksRef.current.length}`);
        }
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
        setStatus(
          isZh
            ? "\u9ea6\u514b\u98ce\u672a\u63a5\u5165\uff0c\u8bf7\u68c0\u67e5\u7cfb\u7edf\u6743\u9650\u540e\u91cd\u8bd5\u3002"
            : "Microphone not connected. Check system permissions and try again."
        );
      } else if (usingDisplayAudio && displayError) {
        setStatus(
          isZh
            ? "\u7cfb\u7edf/\u6807\u7b7e\u9875\u97f3\u9891\u672a\u63a5\u5165\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u5e76\u52fe\u9009\u201c\u5206\u4eab\u97f3\u9891\u201d\u3002"
            : "System or tab audio was not connected. Re-select the source and enable audio sharing."
        );
      } else if (usingDisplayAudio && !displayAudioTracks.length) {
        setStatus(
          isZh
            ? "\u5b9e\u65f6\u91c7\u96c6\u4e2d\uff0c\u4f46\u5f53\u524d\u6ca1\u6709\u6355\u83b7\u5230\u7cfb\u7edf/\u6807\u7b7e\u9875\u97f3\u8f68\u3002"
            : "Capture started, but no system or tab audio is being received."
        );
      } else {
        setStatus(
          isZh
            ? `\u5df2\u5f00\u59cb\u91c7\u96c6 ${getLocalizedCaptureModeLabel(captureMode, locale)}\uff0c\u6b63\u5728\u8fde\u63a5\u5b9e\u65f6 ASR`
            : `${getLocalizedCaptureModeLabel(captureMode, locale)} capture started. Connecting to live ASR`
        );
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
      setCaptureDetails(copy.startFailed);
      setStatus(error instanceof Error ? error.message : copy.failedToStart);
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
    setCaptureDetails(copy.wrappingUp);
    clearFinishFallbackTimer();
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
        audioUploadPromiseRef.current = uploadLiveAudioAsset(jobId, recordedChunks).catch((error) => {
          setStatus((current) => {
            const suffix = error instanceof Error ? error.message : (isZh ? "\u5b9e\u65f6\u5f55\u97f3\u4fdd\u5b58\u5931\u8d25" : "Live recording could not be saved");
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
        setStatus(error instanceof Error ? error.message : copy.failedToStart);
      }
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      pausedRef.current = false;
      setCaptureDetails(copy.notStarted);
      setPendingAction(null);
      liveStartedAtRef.current = null;
      if (!jobId) {
        activeJobIdRef.current = null;
      } else {
        setStatus(copy.finalizing);
      }
    }
  }

  const isStarting = pendingAction === "starting";
  const isStopping = pendingAction === "stopping";
  const startButtonDisabled = disabled || isStarting || isStopping;
  const stopButtonDisabled = isStopping;
  const recorderTimeLabel = formatElapsedTime(elapsedSeconds);
  const activeOption = captureModeOptions.find((option) => option.mode === captureMode) || captureModeOptions[0];
  const ActiveIcon = activeOption.icon;

  function renderExpandedModePicker() {
    return (
      <div className={`flex items-center justify-center gap-4 rounded-[1.55rem] border py-2.5 px-4 ${themeClasses.pickerShell}`}>
        {captureModeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = captureMode === option.mode;

          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => setCaptureMode(option.mode)}
              disabled={disabled || isRunning || isStarting || isStopping}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-2xl border transition-all ${isActive ? themeClasses.modeCardActive : themeClasses.modeCard}`}
              title={option.label}
            >
              <Icon className={`h-5 w-5 ${isActive ? (isDarkTheme ? "text-[#48F9DB]" : "text-[#8a5a3c]") : (isDarkTheme ? "text-[#97ada8]" : "text-[#8a5a3c]")}`} />
              {isActive && isRunning ? (
                  <span className={`absolute right-[2px] -top-1 flex h-2 w-2 items-center justify-center rounded-full ${isDarkTheme ? "bg-[#48F9DB]" : "bg-[#8a5a3c]"} animate-pulse`} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  function renderRecorderHeader() {
    const stageTitle =
      captureMode === "mic"
        ? copy.faceTitle
        : captureMode === "system"
          ? copy.meetingTitle
          : captureMode === "upload"
            ? copy.uploadTitle
            : copy.browserTitle;
    const sourceSummary = captureMode === "upload" ? (isZh ? "选择本地音频或视频文件上传" : "Select local audio or video file to upload") : getLocalizedSourceSummary(captureMode, locale);

    return (
      <div className={`overflow-hidden rounded-[2rem] border shadow-[0_24px_80px_rgba(0,220,191,0.08)] ${themeClasses.stageShell}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-6">
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${themeClasses.sourceNote}`}>{isRunning ? copy.livePill : copy.prepareLive}</p>
            <div className="mt-3 flex min-w-0 items-center gap-4">
              <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] border ${themeClasses.stageIcon}`}>
                <ActiveIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className={`truncate text-[1.65rem] font-extrabold tracking-[-0.05em] ${isDarkTheme ? "text-white" : "text-[#1a1c1c]"}`}>{stageTitle}</h3>
                <p className={`mt-2 truncate text-sm ${themeClasses.statLabel}`}>{sourceSummary}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${isRunning ? "border-[#00dcbf]/20 bg-[#00dcbf]/10 text-[#48F9DB]" : themeClasses.stagePill}`}>
              <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-[#48F9DB] animate-pulse" : "bg-[#7fa29b]"}`} />
              {isRunning ? recorderTimeLabel : copy.notStarted}
            </span>
            {!isRunning ? (
              jobCompleted ? (
                <span className={`text-[11px] font-black uppercase tracking-[0.18em] text-[#97ada8]`}>
                  {isZh ? "已结束" : "Completed"}
                </span>
              ) : (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onUploadFile) onUploadFile(file);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    accept="audio/*,video/*"
                    className="hidden"
                  />
                  <Button
                    onClick={startLive}
                    className={`workspace-live-primary-button ${compact ? "workspace-live-primary-button-compact" : ""}`}
                    disabled={startButtonDisabled}
                  >
                    {isStarting ? copy.connecting : (captureMode === "upload" ? copy.selectFile : copy.startCapture)}
                  </Button>
                </>
              )
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    const next = !isPaused;
                    setIsPaused(next);
                    pausedRef.current = next;
                    setCaptureDetails(next ? "Paused" : "Recording");
                  }}
                  variant="secondary"
                  className={`workspace-live-stop-button ${compact ? "workspace-live-primary-button-compact" : ""} ${isDarkTheme ? "border-white/10" : "border-[#dacfc3]"}`}
                  disabled={stopButtonDisabled}
                >
                  {isPaused ? "继续" : "暂停"}
                </Button>
                <Button
                  onClick={stopLive}
                  variant="destructive"
                  className={`workspace-live-stop-button ${compact ? "workspace-live-primary-button-compact" : ""}`}
                  disabled={stopButtonDisabled}
                >
                  <Square className="mr-1 h-3.5 w-3.5" />
                  {isStopping ? copy.stoppingShort : copy.endAndOrganize}
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-white/5 px-6 py-5">
          {renderExpandedModePicker()}
        </div>
      </div>
    );
  }

  return (
    <section className={`workspace-panel workspace-live-panel ${compact ? "workspace-live-compact" : ""} ${disabled ? "workspace-panel-disabled" : ""} ${themeClasses.shell}`}>
      <div className="space-y-4">
        {renderRecorderHeader()}
        {afterRecorderSlot ? (
          <div className="workspace-live-after-recorder">
            {afterRecorderSlot}
          </div>
        ) : null}
        
        {!hideTranscript && (
          <div className={`overflow-hidden rounded-[1.9rem] border shadow-[0_18px_54px_rgba(0,0,0,0.12)] backdrop-blur-xl ${themeClasses.transcriptBox}`}>
          <div className={`flex items-center justify-between gap-4 border-b px-5 py-4 ${themeClasses.transcriptDivider}`}>
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${themeClasses.sourceNote}`}>{isZh ? "תд" : "Transcript"}</p>
              <p className={`mt-2 truncate text-sm ${themeClasses.sourceValueMuted}`}>
                {disabled ? disabledReason : captureDetails}
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${themeClasses.emptyPill}`}>
              <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-[#48F9DB] animate-pulse" : "bg-[#7fa39d]"}`} />
              {isRunning ? copy.livePill : copy.notStarted}
            </span>
          </div>
          <div className="px-5 py-5">
            {liveText ? (
              <div className={`whitespace-pre-wrap text-sm leading-relaxed ${themeClasses.transcriptText}`}>
                {disabled ? disabledReason : liveText}
              </div>
            ) : (
              <div className={`flex min-h-[14rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed px-6 py-10 text-center ${themeClasses.emptyShell}`}>
                <div className="flex items-end gap-1" aria-hidden="true">
                  {RECORDER_BAR_LEVELS.map((level, index) => (
                    <span
                      key={`transcript-empty-bar-${index}`}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: "3px",
                        height: isRunning ? `${12 + level * 32}px` : `${8 + level * 10}px`,
                        background: isRunning
                          ? isDarkTheme
                            ? `linear-gradient(180deg, rgba(72, 249, 219, ${0.6 + level * 0.4}), rgba(0, 220, 191, ${0.3 + level * 0.2}))`
                            : `linear-gradient(180deg, rgba(138, 90, 60, ${0.5 + level * 0.4}), rgba(207, 169, 138, ${0.3 + level * 0.2}))`
                          : isDarkTheme ? "rgba(72, 249, 219, 0.18)" : "rgba(138, 90, 60, 0.18)",
                        boxShadow: isRunning && isDarkTheme ? `0 0 ${4 + level * 8}px rgba(72, 249, 219, ${0.3 + level * 0.3})` : "none",
                        animation: isRunning ? `pulse-bar ${0.8 + index * 0.1}s ease-in-out infinite alternate` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
