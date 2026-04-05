const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 43119;
const DEFAULT_HEALTH_TIMEOUT_MS = 1200;
const DEFAULT_BOOT_TIMEOUT_MS = 8000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export type AsrGatewayConfig = {
  host: string;
  port: number;
  httpBaseUrl: string;
  publicWsUrl: string;
  healthTimeoutMs: number;
  bootTimeoutMs: number;
  requestTimeoutMs: number;
};

function readStringEnv(keys: string[], fallback = "") {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return fallback;
}

function readNumberEnv(keys: string[], fallback: number) {
  const raw = readStringEnv(keys);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePublicWsUrl(raw: string) {
  const candidate = raw.includes("://") ? raw : `http://${raw}`;
  const url = new URL(candidate);

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Unsupported ASR gateway protocol: ${url.protocol}`);
  }

  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/browser";
  }

  return url.toString();
}

export function getAsrGatewayTokenSecret() {
  return readStringEnv(
    [
      "LIVE_ASR_SESSION_TOKEN_SECRET",
      "KEMO_ASR_GATEWAY_TOKEN_SECRET",
      "DASHSCOPE_API_KEY",
    ],
    "kemo-live-asr"
  );
}

export function getAsrGatewayConfig(): AsrGatewayConfig {
  const host = readStringEnv(
    ["LIVE_ASR_GATEWAY_HOST", "KEMO_ASR_GATEWAY_HOST"],
    DEFAULT_HOST
  );
  const port = readNumberEnv(
    ["LIVE_ASR_GATEWAY_PORT", "KEMO_ASR_GATEWAY_PORT"],
    DEFAULT_PORT
  );
  const httpBaseUrl = `http://${host}:${port}`;
  const publicUrlOverride = readStringEnv([
    "NEXT_PUBLIC_LIVE_ASR_GATEWAY_URL",
    "KEMO_ASR_GATEWAY_PUBLIC_WS_URL",
  ]);

  return {
    host,
    port,
    httpBaseUrl,
    publicWsUrl: publicUrlOverride
      ? normalizePublicWsUrl(publicUrlOverride)
      : `ws://${host}:${port}/browser`,
    healthTimeoutMs: readNumberEnv(
      ["LIVE_ASR_GATEWAY_HEALTH_TIMEOUT_MS", "KEMO_ASR_GATEWAY_HEALTH_TIMEOUT_MS"],
      DEFAULT_HEALTH_TIMEOUT_MS
    ),
    bootTimeoutMs: readNumberEnv(
      ["LIVE_ASR_GATEWAY_BOOT_TIMEOUT_MS", "KEMO_ASR_GATEWAY_BOOT_TIMEOUT_MS"],
      DEFAULT_BOOT_TIMEOUT_MS
    ),
    requestTimeoutMs: readNumberEnv(
      ["LIVE_ASR_GATEWAY_REQUEST_TIMEOUT_MS", "KEMO_ASR_GATEWAY_REQUEST_TIMEOUT_MS"],
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
  };
}
