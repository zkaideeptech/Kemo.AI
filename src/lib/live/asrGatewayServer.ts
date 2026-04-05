import http from "node:http";
import type { AddressInfo } from "node:net";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { getAsrGatewayConfig } from "@/lib/live/asrGatewayConfig";
import { verifyAsrGatewaySessionToken } from "@/lib/live/asrGatewaySessionToken";
import {
  appendRealtimeAsrAudio,
  commitRealtimeAsrSession,
  finishRealtimeAsrSession,
  getEmptyRealtimeAsrSnapshot,
  getRealtimeAsrDebugState,
  getRealtimeAsrSnapshot,
  startRealtimeAsrSession,
  subscribeRealtimeAsrSession,
  type RealtimeAsrSessionEvent,
  type RealtimeAsrTurnDetectionMode,
} from "@/lib/live/realtimeAsrSession";

type BrowserClientState = {
  jobId: string | null;
  language: string;
  turnDetectionMode: RealtimeAsrTurnDetectionMode;
  unsubscribe: (() => void) | null;
};

type GatewayEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type GatewayRuntimeState = {
  mode: "stopped" | "starting" | "internal" | "external";
  server: http.Server | null;
  browserServer: WebSocketServer | null;
  startPromise: Promise<EnsuredAsrGateway> | null;
};

export type EnsuredAsrGateway = {
  mode: "internal" | "external";
  httpBaseUrl: string;
  publicWsUrl: string;
  pid: number | null;
  port: number;
};

declare global {
  var __kemoAsrGatewayRuntimeState: GatewayRuntimeState | undefined;
}

function getRuntimeState() {
  if (!globalThis.__kemoAsrGatewayRuntimeState) {
    globalThis.__kemoAsrGatewayRuntimeState = {
      mode: "stopped",
      server: null,
      browserServer: null,
      startPromise: null,
    };
  }

  return globalThis.__kemoAsrGatewayRuntimeState;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGatewayInfo(mode: "internal" | "external"): EnsuredAsrGateway {
  const config = getAsrGatewayConfig();

  return {
    mode,
    httpBaseUrl: config.httpBaseUrl,
    publicWsUrl: config.publicWsUrl,
    pid: mode === "internal" ? process.pid : null,
    port: config.port,
  };
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendSocketJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function getString(body: Record<string, unknown>, key: string, fallback = "") {
  const value = body[key];
  return typeof value === "string" ? value : fallback;
}

function pushSessionEvent(socket: WebSocket, event: RealtimeAsrSessionEvent) {
  sendSocketJson(socket, {
    type: "session.update",
    eventType: event.eventType,
    snapshot: event.snapshot,
    debug: event.debug,
  });
}

function createGatewayServer() {
  const config = getAsrGatewayConfig();
  const browserServer = new WebSocketServer({ noServer: true });

  const server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", config.httpBaseUrl);

    try {
      if (method === "GET" && url.pathname === "/health") {
        const state = getRuntimeState();
        const address = server.address() as AddressInfo | null;

        sendJson(res, 200, {
          ok: true,
          data: {
            pid: process.pid,
            uptimeMs: Math.round(process.uptime() * 1000),
            mode: state.mode === "internal" ? "internal" : "external",
            port: address?.port ?? config.port,
          },
        });
        return;
      }

      if (method === "GET" && url.pathname === "/snapshot") {
        const jobId = url.searchParams.get("jobId") || "";

        if (!jobId) {
          sendJson(res, 400, { ok: false, error: { message: "Missing jobId" } });
          return;
        }

        const snapshot =
          getRealtimeAsrSnapshot(jobId) || getEmptyRealtimeAsrSnapshot(jobId);
        sendJson(res, 200, {
          ok: true,
          data: {
            ...snapshot,
            debug: getRealtimeAsrDebugState(jobId),
          },
        });
        return;
      }

      if (method !== "POST") {
        sendJson(res, 404, { ok: false, error: { message: "Not found" } });
        return;
      }

      const body = await readBody(req);
      const jobId = getString(body, "jobId");
      const language = getString(body, "language", "zh");
      const turnDetectionMode =
        getString(body, "turnDetectionMode") === "manual" ? "manual" : "server_vad";

      if (!jobId) {
        sendJson(res, 400, { ok: false, error: { message: "Missing jobId" } });
        return;
      }

      if (url.pathname === "/start") {
        const snapshot = await startRealtimeAsrSession({
          jobId,
          language,
          turnDetectionMode,
        });
        sendJson(res, 200, {
          ok: true,
          data: {
            ...snapshot,
            debug: getRealtimeAsrDebugState(jobId),
          },
        });
        return;
      }

      if (url.pathname === "/append") {
        const audioBase64 = getString(body, "audioBase64");

        if (!audioBase64) {
          sendJson(res, 400, { ok: false, error: { message: "Missing audioBase64" } });
          return;
        }

        const snapshot = await appendRealtimeAsrAudio({
          jobId,
          audioBase64,
          language,
          turnDetectionMode,
        });
        sendJson(res, 200, {
          ok: true,
          data: {
            ...snapshot,
            debug: getRealtimeAsrDebugState(jobId),
          },
        });
        return;
      }

      if (url.pathname === "/finish") {
        const snapshot =
          (await finishRealtimeAsrSession(jobId)) ||
          getEmptyRealtimeAsrSnapshot(jobId, {
            statusText: "Realtime ASR session finished",
            hasFinished: true,
          });
        sendJson(res, 200, {
          ok: true,
          data: {
            ...snapshot,
            debug: getRealtimeAsrDebugState(jobId),
          },
        });
        return;
      }

      sendJson(res, 404, { ok: false, error: { message: "Not found" } });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "ASR gateway error",
        },
      });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", config.httpBaseUrl);

    if (url.pathname !== "/browser") {
      socket.destroy();
      return;
    }

    browserServer.handleUpgrade(req, socket, head, (ws) => {
      browserServer.emit("connection", ws, req);
    });
  });

  browserServer.on("connection", (socket) => {
    const state: BrowserClientState = {
      jobId: null,
      language: "zh",
      turnDetectionMode: "server_vad",
      unsubscribe: null,
    };

    sendSocketJson(socket, { type: "gateway.connected" });

    socket.on("message", async (raw: RawData, isBinary) => {
      try {
        if (isBinary) {
          if (!state.jobId) {
            throw new Error("Realtime ASR session is not initialized");
          }

          const binaryChunk =
            typeof raw === "string"
              ? Buffer.from(raw)
              : Buffer.isBuffer(raw)
                ? raw
                : Buffer.from(raw as ArrayBuffer);

          await appendRealtimeAsrAudio({
            jobId: state.jobId,
            audioBase64: binaryChunk.toString("base64"),
            language: state.language,
            turnDetectionMode: state.turnDetectionMode,
          });
          return;
        }

        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = getString(message, "type");

        if (type === "client.start") {
          const token = getString(message, "token");
          const jobId = getString(message, "jobId");
          const language = getString(message, "language", "zh");
          const turnDetectionMode =
            getString(message, "turnDetectionMode") === "manual" ? "manual" : "server_vad";
          const verified = verifyAsrGatewaySessionToken(token);

          if (!verified || verified.jobId !== jobId) {
            throw new Error("Invalid gateway session token");
          }

          state.jobId = verified.jobId;
          state.language = language;
          state.turnDetectionMode = turnDetectionMode;
          state.unsubscribe?.();

          const snapshot = await startRealtimeAsrSession({
            jobId: verified.jobId,
            language,
            turnDetectionMode,
          });

          state.unsubscribe = subscribeRealtimeAsrSession(verified.jobId, (event) => {
            pushSessionEvent(socket, event);
          });

          sendSocketJson(socket, {
            type: "session.ready",
            snapshot,
            debug: getRealtimeAsrDebugState(verified.jobId),
          });
          return;
        }

        if (type === "client.commit") {
          if (!state.jobId) {
            throw new Error("Realtime ASR session is not initialized");
          }

          const snapshot = await commitRealtimeAsrSession(state.jobId);
          sendSocketJson(socket, {
            type: "session.update",
            eventType: "input_audio_buffer.committed",
            snapshot: snapshot || getEmptyRealtimeAsrSnapshot(state.jobId),
            debug: getRealtimeAsrDebugState(state.jobId),
          });
          return;
        }

        if (type === "client.finish") {
          if (!state.jobId) {
            throw new Error("Realtime ASR session is not initialized");
          }

          const finishedJobId = state.jobId;
          const snapshot =
            (await finishRealtimeAsrSession(finishedJobId)) ||
            getEmptyRealtimeAsrSnapshot(finishedJobId, {
              statusText: "Realtime ASR session finished",
              hasFinished: true,
            });

          state.unsubscribe?.();
          state.unsubscribe = null;

          sendSocketJson(socket, {
            type: "session.finished",
            snapshot,
            debug: getRealtimeAsrDebugState(finishedJobId),
          });

          socket.close(1000, "session finished");
          return;
        }
      } catch (error) {
        sendSocketJson(socket, {
          type: "session.error",
          message:
            error instanceof Error ? error.message : "Gateway processing failed",
        });
      }
    });

    socket.on("close", () => {
      state.unsubscribe?.();
      state.unsubscribe = null;
    });
  });

  return { server, browserServer };
}

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

export async function isAsrGatewayHealthy(
  timeoutMs = getAsrGatewayConfig().healthTimeoutMs
) {
  try {
    await fetchGatewayJson("/health", { method: "GET" }, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function waitForHealthy(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isAsrGatewayHealthy()) {
      return true;
    }

    await sleep(200);
  }

  return false;
}

async function listen(server: http.Server, host: string, port: number) {
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };

    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(port, host);
  });
}

async function startInternalGateway() {
  const state = getRuntimeState();
  const config = getAsrGatewayConfig();
  const { server, browserServer } = createGatewayServer();

  try {
    await listen(server, config.host, config.port);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    try {
      browserServer.close();
    } catch {
      // ignore cleanup failures
    }

    try {
      server.close();
    } catch {
      // ignore cleanup failures
    }

    if (errorCode === "EADDRINUSE" && (await waitForHealthy(config.bootTimeoutMs))) {
      state.mode = "external";
      return buildGatewayInfo("external");
    }

    throw new Error(
      error instanceof Error
        ? `Failed to start ASR gateway on ${config.host}:${config.port}: ${error.message}`
        : `Failed to start ASR gateway on ${config.host}:${config.port}`
    );
  }

  state.server = server;
  state.browserServer = browserServer;
  state.mode = "internal";

  server.on("close", () => {
    const runtimeState = getRuntimeState();

    if (runtimeState.server === server) {
      runtimeState.server = null;
      runtimeState.browserServer = null;
      if (runtimeState.mode === "internal") {
        runtimeState.mode = "stopped";
      }
    }
  });

  server.on("error", (error) => {
    console.error("[LiveASRGateway] server error", error);
  });

  return buildGatewayInfo("internal");
}

export async function ensureAsrGatewayServer() {
  const state = getRuntimeState();

  if (state.mode === "internal" && state.server?.listening) {
    return buildGatewayInfo("internal");
  }

  if (state.mode === "external") {
    if (await isAsrGatewayHealthy()) {
      return buildGatewayInfo("external");
    }

    state.mode = "stopped";
  }

  if (!state.startPromise) {
    state.startPromise = (async () => {
      if (await isAsrGatewayHealthy()) {
        state.mode = "external";
        return buildGatewayInfo("external");
      }

      state.mode = "starting";

      try {
        return await startInternalGateway();
      } catch (error) {
        state.mode = "stopped";
        throw error;
      } finally {
        state.startPromise = null;
        if (state.mode === "starting") {
          state.mode = "stopped";
        }
      }
    })();
  }

  return state.startPromise;
}

export async function shutdownAsrGatewayServer() {
  const state = getRuntimeState();

  if (!state.server) {
    state.mode = "stopped";
    state.browserServer = null;
    return;
  }

  const { server, browserServer } = state;
  state.server = null;
  state.browserServer = null;
  state.mode = "stopped";

  browserServer?.clients.forEach((client) => {
    client.close(1001, "server shutdown");
  });

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
