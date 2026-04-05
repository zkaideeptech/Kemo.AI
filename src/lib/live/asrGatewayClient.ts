import { getAsrGatewayConfig } from "@/lib/live/asrGatewayConfig";
import { createAsrGatewaySessionToken } from "@/lib/live/asrGatewaySessionToken";
import { ensureAsrGatewayServer } from "@/lib/live/asrGatewayServer";
import type {
  RealtimeAsrDebugState,
  SessionSnapshot,
} from "@/lib/live/realtimeAsrSession";

export type RealtimeAsrGatewaySnapshot = SessionSnapshot & {
  debug: RealtimeAsrDebugState;
};

export type AsrGatewayBrowserSession = {
  jobId: string;
  wsUrl: string;
  token: string;
  language: string;
  turnDetectionMode: "server_vad" | "manual";
  snapshot: RealtimeAsrGatewaySnapshot;
};

type GatewayEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

let bootPromise: Promise<void> | null = null;

async function fetchGatewayJson<T>(
  pathname: string,
  init: RequestInit,
  timeoutMs: number
) {
  const { httpBaseUrl } = getAsrGatewayConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${httpBaseUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const json = (await res.json().catch(() => null)) as GatewayEnvelope<T> | null;

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error?.message || `ASR gateway request failed: ${res.status}`);
    }

    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureAsrGateway() {
  if (!bootPromise) {
    bootPromise = ensureAsrGatewayServer()
      .then(() => undefined)
      .finally(() => {
        bootPromise = null;
      });
  }

  return bootPromise;
}

export async function getAsrGatewaySnapshot(jobId: string) {
  const { requestTimeoutMs } = getAsrGatewayConfig();

  await ensureAsrGateway();
  return fetchGatewayJson<RealtimeAsrGatewaySnapshot>(
    `/snapshot?jobId=${encodeURIComponent(jobId)}`,
    { method: "GET" },
    requestTimeoutMs
  );
}

export async function createAsrGatewayBrowserSession({
  jobId,
  userId,
  language,
  turnDetectionMode = "server_vad",
}: {
  jobId: string;
  userId: string;
  language: string;
  turnDetectionMode?: "server_vad" | "manual";
}) {
  const { publicWsUrl } = getAsrGatewayConfig();

  await ensureAsrGateway();

  return {
    jobId,
    wsUrl: publicWsUrl,
    token: createAsrGatewaySessionToken({ jobId, userId }),
    language,
    turnDetectionMode,
    snapshot: {
      jobId,
      statusText: "Realtime ASR session is starting",
      previewText: "",
      finalTranscriptText: "",
      isReady: false,
      hasFinished: false,
      errorMessage: null,
      debug: {
        exists: false,
        isOpen: false,
        hasFinished: false,
        updatedAt: null,
        closeCode: null,
        closeReason: null,
        wsState: "missing",
      },
    },
  } satisfies AsrGatewayBrowserSession;
}
