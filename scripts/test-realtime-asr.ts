import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

import {
  appendRealtimeAsrAudio,
  finishRealtimeAsrSession,
  getRealtimeAsrSnapshot,
  startRealtimeAsrSession,
} from "../src/lib/live/realtimeAsrSession";

config({ path: ".env.local" });

const DEFAULT_AUDIO_PATH = "/tmp/kemo-welcome.wav";
const STREAM_CHUNK_BYTES = 3200;
const STREAM_INTERVAL_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bufferToBase64(buffer: Uint8Array) {
  return Buffer.from(buffer).toString("base64");
}

function extractWavPcmData(file: Buffer) {
  if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Input is not a PCM WAV file");
  }

  let offset = 12;

  while (offset + 8 <= file.length) {
    const chunkId = file.toString("ascii", offset, offset + 4);
    const chunkSize = file.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;

    if (chunkId === "data") {
      return file.subarray(chunkDataStart, chunkDataEnd);
    }

    offset = chunkDataEnd + (chunkSize % 2);
  }

  throw new Error("WAV data chunk not found");
}

async function main() {
  const audioPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_AUDIO_PATH;
  const jobId = `realtime-check-${Date.now()}`;

  console.log("========================================");
  console.log("  KEMO 实时 ASR 验证脚本");
  console.log("========================================");
  console.log(`Audio: ${audioPath}`);
  console.log(`Job ID: ${jobId}`);
  console.log("========================================\n");

  const file = await fs.readFile(audioPath);
  const pcmData = audioPath.endsWith(".wav") ? extractWavPcmData(file) : file;
  console.log(`PCM bytes: ${pcmData.byteLength}`);

  const startSnapshot = await startRealtimeAsrSession({
    jobId,
    language: "zh",
  });

  console.log("Start:", startSnapshot.statusText);

  for (let offset = 0; offset < pcmData.byteLength; offset += STREAM_CHUNK_BYTES) {
    const chunk = pcmData.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, pcmData.byteLength));
    const snapshot = await appendRealtimeAsrAudio({
      jobId,
      audioBase64: bufferToBase64(chunk),
      language: "zh",
    });

    if (snapshot.previewText) {
      console.log(`preview@${offset}: ${snapshot.previewText}`);
    }

    await sleep(STREAM_INTERVAL_MS);
  }

  const finalSnapshot = await finishRealtimeAsrSession(jobId);
  const latest = finalSnapshot || getRealtimeAsrSnapshot(jobId);

  console.log("\n========================================");
  console.log("  Final Snapshot");
  console.log("========================================");
  console.log(`Status: ${latest?.statusText || "N/A"}`);
  console.log(`Transcript: ${latest?.finalTranscriptText || latest?.previewText || ""}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error("❌ 实时 ASR 验证失败:", error);
  process.exit(1);
});
