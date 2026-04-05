import { spawn } from "node:child_process";
import * as path from "node:path";

import { createAsrGatewaySessionToken } from "@/lib/live/asrGatewaySessionToken";
import type { RealtimeAsrDebugState, SessionSnapshot } from "@/lib/live/realtimeAsrSession";

const HOST = process.env.KEMO_ASR_GATEWAY_HOST || "127.0.0.1";
const PORT = Number(process.env.KEMO_ASR_GATEWAY_PORT || "43119");
const HTTP_BASE_URL = `http://${HOST}:${PORT}`;
const WS_PUBLIC_URL = process.env.KEMO_ASR_GATEWAY_PUBLIC_WS_URL || `ws://${HOST}:${PORT}/browser`;
const HEALTH_TIMEOUT_MS = Number(process.env.KEMO_ASR_GATEWAY_HEALTH_TIMEOUT_MS || "1200");
const BOOT_TIMEOUT_MS = Number(process.env.KEMO_ASR_GATEWAY_BOOT_TIMEOUT_MS || "8000");
const REQUEST_TIMEOUT_MS = Number(process.env.KEMO_ASR_GATEWAY_REQUEST_TIMEOUT_MS || "15000");
const HEALTH_POLL_INTERVAL_MS = 200;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGatewayJson<T>(pathname: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${HTTP_BASE_URL}${pathname}`, {
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

async function isGatewayHealthy() {
  try {
    await fetchGatewayJson("/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

function spawnGatewayProcess() {
  const tsxCliPath = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(process.cwd(), "scripts/live-asr-gateway.ts");
  const child = spawn(process.execPath, [tsxCliPath, scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KEMO_ASR_GATEWAY_HOST: HOST,
      KEMO_ASR_GATEWAY_PORT: String(PORT),
      KEMO_ASR_GATEWAY_PUBLIC_WS_URL: WS_PUBLIC_URL,
    },
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

export async function ensureAsrGateway() {
  if (await isGatewayHealthy()) {
    return;
  }

  if (!bootPromise) {
    bootPromise = (async () => {
      if (await isGatewayHealthy()) {
        return;
      }

      spawnGatewayProcess();

      const deadline = Date.now() + BOOT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await isGatewayHealthy()) {
          return;
        }

        await sleep(HEALTH_POLL_INTERVAL_MS);
      }

      throw new Error("ASR gateway failed to boot");
    })().finally(() => {
      bootPromise = null;
    });
  }

  return bootPromise;
}

export async function getAsrGatewaySnapshot(jobId: string) {
  await ensureAsrGateway();
  return fetchGatewayJson<RealtimeAsrGatewaySnapshot>(
    `/snapshot?jobId=${encodeURIComponent(jobId)}`,
    { method: "GET" },
    REQUEST_TIMEOUT_MS
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
  void ensureAsrGateway().catch(() => {
    // browser websocket bootstrap will retry while the gateway comes up
  });

  return {
    jobId,
    wsUrl: WS_PUBLIC_URL,
    token: createAsrGatewaySessionToken({ jobId, userId }),
    language,
    turnDetectionMode,
    snapshot: {
      jobId,
      statusText: "实时会话准备中",
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
