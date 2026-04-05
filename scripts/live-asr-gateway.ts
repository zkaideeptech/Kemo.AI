import { config } from "dotenv";
import http from "node:http";
import WebSocket, { WebSocketServer, type RawData } from "ws";

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

config({ path: ".env.local" });

const HOST = process.env.KEMO_ASR_GATEWAY_HOST || "127.0.0.1";
const PORT = Number(process.env.KEMO_ASR_GATEWAY_PORT || "43119");

type BrowserClientState = {
  jobId: string | null;
  language: string;
  turnDetectionMode: RealtimeAsrTurnDetectionMode;
  unsubscribe: (() => void) | null;
};

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

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        data: {
          pid: process.pid,
          uptimeMs: Math.round(process.uptime() * 1000),
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

      const snapshot = getRealtimeAsrSnapshot(jobId) || getEmptyRealtimeAsrSnapshot(jobId);
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
          statusText: "实时会话已结束",
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

const browserServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

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
            statusText: "实时会话已结束",
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
      }
    } catch (error) {
      sendSocketJson(socket, {
        type: "session.error",
        message: error instanceof Error ? error.message : "Gateway processing failed",
      });
    }
  });

  socket.on("close", () => {
    state.unsubscribe?.();
    state.unsubscribe = null;
  });
});

server.on("error", (error) => {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    process.exit(0);
  }

  console.error("[LiveASRGateway] server error", error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[LiveASRGateway] listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  browserServer.clients.forEach((client) => {
    client.close(1001, "server shutdown");
  });

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
