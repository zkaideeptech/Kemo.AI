"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Radio, ScreenShare, Square, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function LiveInterviewPanel({
  onTranscriptChange,
  onStatusChange,
  disabled = false,
  disabledReason = "请先创建访谈",
}: {
  onTranscriptChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [captureMic, setCaptureMic] = useState(true);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [liveText, setLiveText] = useState("");
  const [status, setStatus] = useState("准备开始实时访谈");
  const [isRunning, setIsRunning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const runningRef = useRef(false);

  const speechCtor = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (
      (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ||
      null
    );
  }, []);

  useEffect(() => {
    onTranscriptChange?.(liveText);
  }, [liveText, onTranscriptChange]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  async function startLive() {
    if (disabled) {
      setStatus(disabledReason);
      return;
    }

    const tracks: MediaStreamTrack[] = [];

    try {
      if (captureMic) {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tracks.push(...micStream.getTracks());
      }

      if (captureSystemAudio) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        tracks.push(...displayStream.getTracks());
      }

      if (tracks.length > 0) {
        const mixed = new MediaStream(tracks);
        mediaRecorderRef.current = new MediaRecorder(mixed);
        mediaRecorderRef.current.start(1000);
      }

      tracksRef.current = tracks;
      runningRef.current = true;
      setIsRunning(true);
      setStatus("实时采集中：麦克风/系统音频已接入");

      if (speechCtor && captureMic) {
        const recognition = new speechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "zh-CN";
        recognition.onresult = (event) => {
          const next = Array.from(event.results)
            .slice(event.resultIndex)
            .map((result) => result[0].transcript)
            .join("");

          setLiveText((prev) => {
            const trimmed = prev.trimEnd();
            return trimmed ? `${trimmed}\n${next}` : next;
          });
        };
        recognition.onerror = (event) => {
          setStatus(`语音识别错误：${event.error}`);
        };
        recognition.onend = () => {
          if (runningRef.current) {
            setStatus("浏览器语音识别已结束，保留当前采集流");
          }
        };
        recognition.start();
        speechRef.current = recognition;
      } else if (!speechCtor) {
        setStatus("已开始采集。浏览器不支持内建 SpeechRecognition，当前只保留音频捕获。");
      }
    } catch (error) {
      runningRef.current = false;
      setStatus(error instanceof Error ? error.message : "无法启动实时访谈");
      setIsRunning(false);
      tracks.forEach((track) => track.stop());
    }
  }

  function stopLive() {
    speechRef.current?.stop();
    speechRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    tracksRef.current.forEach((track) => track.stop());
    tracksRef.current = [];
    runningRef.current = false;
    setIsRunning(false);
    setStatus("实时访谈已停止");
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
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={`workspace-toggle ${captureMic ? "workspace-toggle-active" : ""}`}
        >
          <Mic className="h-4 w-4" />
          麦克风
        </button>
        <button
          type="button"
          onClick={() => setCaptureSystemAudio((value) => !value)}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={`workspace-toggle ${captureSystemAudio ? "workspace-toggle-active" : ""}`}
        >
          <ScreenShare className="h-4 w-4" />
          系统/标签页音频
        </button>
      </div>

      <div className="rounded-[28px] border border-black/8 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
        <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <Waves className="h-4 w-4" />
          {disabled ? disabledReason : status}
        </div>
        <div className="min-h-[120px] whitespace-pre-wrap rounded-[20px] bg-[#f6f2ea] p-4 text-sm leading-6 text-slate-700">
          {disabled ? disabledReason : liveText || "开始后，这里会显示浏览器实时捕获的转写片段。"}
        </div>
      </div>
    </section>
  );
}
