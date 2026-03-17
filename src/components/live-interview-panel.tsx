"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Radio, ScreenShare, Square, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";

const TARGET_SAMPLE_RATE = 16000;
const MIN_FLUSH_BYTES = 12000;

type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  systemAudio?: "include" | "exclude";
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  audio?: boolean;
  video?: boolean;
};

type StartLiveResult = {
  jobId: string | null;
  statusText?: string;
};

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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function LiveInterviewPanel({
  onTranscriptChange,
  onStatusChange,
  onEnsureJob,
  onFinalized,
  disabled = false,
  disabledReason = "请先创建项目",
}: {
  onTranscriptChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onEnsureJob?: () => Promise<StartLiveResult>;
  onFinalized?: (payload: { job?: unknown; draftArtifacts?: unknown[]; transcriptText: string; statusText: string }) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [captureMic, setCaptureMic] = useState(true);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState("准备开始实时访谈");
  const [captureDetails, setCaptureDetails] = useState("未开始采集");
  const [isRunning, setIsRunning] = useState(false);

  const activeJobIdRef = useRef<string | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const isFlushingRef = useRef(false);
  const needsFlushRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    onTranscriptChange?.(liveText);
  }, [liveText, onTranscriptChange]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  async function postAudio(action: "start" | "append" | "finish", audio?: Uint8Array) {
    const jobId = activeJobIdRef.current;
    if (!jobId) {
      throw new Error("Live job is not ready");
    }

    const res = await fetch(`/api/jobs/${jobId}/live/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        language: "zh",
        ...(audio && audio.byteLength ? { audio: bytesToBase64(audio) } : {}),
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || "实时音频上送失败");
    }

    const nextTranscript =
      typeof json.data.previewText === "string" && json.data.previewText.trim()
        ? json.data.previewText
        : typeof json.data.finalTranscriptText === "string"
          ? json.data.finalTranscriptText
          : "";

    if (nextTranscript) {
      setLiveText(nextTranscript);
    }
    if (typeof json.data.statusText === "string" && json.data.statusText) {
      setStatus(json.data.statusText);
    }

    return json.data as {
      previewText?: string;
      finalTranscriptText?: string;
      statusText?: string;
    };
  }

  async function flushAudio(force = false) {
    if (isFlushingRef.current) {
      needsFlushRef.current = true;
      return;
    }

    const totalBytes = pcmChunksRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    if (!force && totalBytes < MIN_FLUSH_BYTES) {
      return;
    }
    if (!totalBytes) {
      return;
    }

    const payload = mergeChunks(pcmChunksRef.current);
    pcmChunksRef.current = [];
    isFlushingRef.current = true;

    try {
      await postAudio("append", payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "实时音频上送失败";
      setStatus(message);
      throw error;
    } finally {
      isFlushingRef.current = false;
      if (needsFlushRef.current) {
        needsFlushRef.current = false;
        void flushAudio(true).catch(() => {
          // status already updated
        });
      }
    }
  }

  function teardownAudioGraph() {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    muteGainRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    muteGainRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {
        // ignore close failure
      });
      audioContextRef.current = null;
    }
  }

  async function startLive() {
    if (disabled) {
      setStatus(disabledReason);
      return;
    }

    if (!captureMic && !captureSystemAudio) {
      setStatus("至少选择一个音频输入");
      return;
    }

    pcmChunksRef.current = [];
    setLiveText("");
    setCaptureDetails("正在请求浏览器权限");

    const cleanupTracks: MediaStreamTrack[] = [];
    const audioTracks: MediaStreamTrack[] = [];

    try {
      setStatus("正在请求麦克风和标签页音频权限");

      const ensurePromise = onEnsureJob?.();
      const micPromise = captureMic ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.resolve(null);
      const displayPromise = captureSystemAudio
        ? navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            preferCurrentTab: true,
            selfBrowserSurface: "include",
            surfaceSwitching: "include",
            systemAudio: "include",
          } as ExtendedDisplayMediaStreamOptions)
        : Promise.resolve(null);

      const [ensured, micStream, displayStream] = await Promise.all([ensurePromise, micPromise, displayPromise]);
      if (!ensured?.jobId) {
        setStatus(ensured?.statusText || "无法创建实时访谈");
        return;
      }

      activeJobIdRef.current = ensured.jobId;

      const micAudioTracks = micStream?.getAudioTracks() || [];
      const displayAudioTracks = displayStream?.getAudioTracks() || [];

      cleanupTracks.push(...(micStream?.getTracks() || []), ...(displayStream?.getTracks() || []));
      audioTracks.push(...micAudioTracks, ...displayAudioTracks);

      const detailParts = [
        captureMic ? `麦克风 ${micAudioTracks.length} 轨` : null,
        captureSystemAudio ? `标签页音频 ${displayAudioTracks.length} 轨` : null,
      ].filter(Boolean);
      setCaptureDetails(detailParts.join(" / ") || "未拿到音轨");

      if (!displayAudioTracks.length && captureSystemAudio) {
        setStatus("没有捕获到标签页音频。当前只会收到麦克风或外放环境声，请重新选择“浏览器标签页 + 分享音频”。");
      } else {
        setStatus("权限已获取，正在连接阿里实时 ASR");
      }

      if (!audioTracks.length) {
        throw new Error("没有拿到任何音频轨道");
      }

      await postAudio("start");

      tracksRef.current = cleanupTracks;
      runningRef.current = true;
      setIsRunning(true);

      const mixedAudioStream = new MediaStream(audioTracks);
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(mixedAudioStream);
      const processorNode = audioContext.createScriptProcessor(4096, sourceNode.channelCount || 1, 1);
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      processorNode.onaudioprocess = (event) => {
        if (!runningRef.current) return;
        const pcmBytes = floatToPcm16Chunk(event.inputBuffer, audioContext.sampleRate);
        pcmChunksRef.current.push(pcmBytes);
        void flushAudio().catch(() => {
          runningRef.current = false;
          setIsRunning(false);
          tracksRef.current.forEach((track) => track.stop());
          tracksRef.current = [];
          teardownAudioGraph();
        });
      };

      sourceNode.connect(processorNode);
      processorNode.connect(muteGain);
      muteGain.connect(audioContext.destination);
      await audioContext.resume();

      audioContextRef.current = audioContext;
      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      muteGainRef.current = muteGain;

      if (!displayAudioTracks.length && captureSystemAudio) {
        setStatus("实时采集中，但当前没有标签页音轨，只能收到麦克风或外放环境声。");
      } else {
        setStatus(`实时采集中：${detailParts.join(" / ")} 正送入阿里 ASR`);
      }
    } catch (error) {
      runningRef.current = false;
      setIsRunning(false);
      teardownAudioGraph();
      cleanupTracks.forEach((track) => track.stop());
      tracksRef.current = [];
      if (activeJobIdRef.current) {
        void fetch(`/api/jobs/${activeJobIdRef.current}/live/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish" }),
        }).catch(() => {
          // ignore cleanup failure
        });
      }
      activeJobIdRef.current = null;
      setCaptureDetails("启动失败");
      setStatus(error instanceof Error ? error.message : "无法启动实时访谈");
    }
  }

  async function stopLive() {
    runningRef.current = false;
    tracksRef.current.forEach((track) => track.stop());
    tracksRef.current = [];
    teardownAudioGraph();

    try {
      await flushAudio(true);
      const finishData = await postAudio("finish");
      const finalTranscript =
        (typeof finishData.finalTranscriptText === "string" && finishData.finalTranscriptText.trim()
          ? finishData.finalTranscriptText
          : liveText).trim();

      if (activeJobIdRef.current && finalTranscript) {
        const finalizeRes = await fetch(`/api/jobs/${activeJobIdRef.current}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptText: finalTranscript,
            statusText: "实时访谈已停止，正在固化最终文稿",
            finalize: true,
          }),
        });
        const finalizeJson = await finalizeRes.json();

        if (finalizeRes.ok && finalizeJson.ok) {
          onFinalized?.({
            job: finalizeJson.data.job,
            draftArtifacts: finalizeJson.data.draftArtifacts,
            transcriptText: finalTranscript,
            statusText: "实时访谈已停止，最终文稿已保存",
          });
          if (Array.isArray(finalizeJson.data.draftArtifacts) && finalizeJson.data.draftArtifacts.length) {
            setStatus("实时访谈已停止，最终文稿已保存");
          } else {
            setStatus("实时访谈已停止，转写已保存");
          }
        } else {
          setStatus(finalizeJson?.error?.message || "实时访谈已停止，但最终保存失败");
        }
      } else {
        setStatus("实时访谈已停止");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "停止实时访谈失败");
    } finally {
      activeJobIdRef.current = null;
      setIsRunning(false);
      setCaptureDetails("未开始采集");
    }
  }

  return (
    <section className={`workspace-panel flex min-h-[240px] flex-col gap-4 ${disabled ? "workspace-panel-disabled" : ""}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="workspace-kicker">Live Transcript</p>
          <h2 className="workspace-heading">实时访谈工作台</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <Button onClick={startLive} className="workspace-primary-button" disabled={disabled}>
              <Radio className="h-4 w-4" />
              开始实时访谈
            </Button>
          ) : (
            <Button onClick={stopLive} variant="secondary">
              <Square className="h-4 w-4" />
              停止
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <button
          type="button"
          onClick={() => setCaptureMic((value) => !value)}
          disabled={disabled || isRunning}
          title={disabled ? disabledReason : undefined}
          className={`workspace-toggle ${captureMic ? "workspace-toggle-active" : ""}`}
        >
          <Mic className="h-4 w-4" />
          麦克风
        </button>
        <button
          type="button"
          onClick={() => setCaptureSystemAudio((value) => !value)}
          disabled={disabled || isRunning}
          title={disabled ? disabledReason : undefined}
          className={`workspace-toggle ${captureSystemAudio ? "workspace-toggle-active" : ""}`}
        >
          <ScreenShare className="h-4 w-4" />
          浏览器标签页音频
        </button>
      </div>

      <p className="workspace-muted-copy">
        浏览器视频要被采到，必须共享“浏览器标签页”并勾选“分享音频”。如果你共享的是整个屏幕或窗口，常见浏览器不会把网页视频音频一并给到实时转写。
      </p>

      <div className="rounded-[28px] border border-black/8 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <Waves className="h-4 w-4" />
          {disabled ? disabledReason : status}
        </div>
        <div className="mb-3 rounded-[16px] bg-slate-100/70 px-3 py-2 text-xs text-slate-500">
          {disabled ? disabledReason : captureDetails}
        </div>
        <div className="min-h-[120px] whitespace-pre-wrap rounded-[20px] bg-[#f6f2ea] p-4 text-sm leading-6 text-slate-700">
          {disabled ? disabledReason : liveText || "开始后，这里会显示阿里实时 ASR 返回的转写内容。"}
        </div>
      </div>
    </section>
  );
}
