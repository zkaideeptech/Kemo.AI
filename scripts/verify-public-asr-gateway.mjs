import { config } from "dotenv";

config({ path: ".env.local" });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function requestJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(`Request failed ${res.status}: ${JSON.stringify(json)?.slice(0, 240)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const host = process.env.KEMO_ASR_GATEWAY_HOST || process.env.LIVE_ASR_GATEWAY_HOST || "127.0.0.1";
const port = process.env.KEMO_ASR_GATEWAY_PORT || process.env.LIVE_ASR_GATEWAY_PORT || "43119";
const publicWsUrl = required("KEMO_ASR_GATEWAY_PUBLIC_WS_URL");

if (!publicWsUrl.startsWith("wss://") || !publicWsUrl.endsWith("/browser")) {
  throw new Error("KEMO_ASR_GATEWAY_PUBLIC_WS_URL must be a wss:// URL ending in /browser");
}

const publicHealthUrl = publicWsUrl
  .replace(/^wss:\/\//, "https://")
  .replace(/\/browser$/, "/health");

await requestJson(`http://${host}:${port}/health`, 3000);
console.log(`PASS local ASR gateway health http://${host}:${port}/health`);

await requestJson(publicHealthUrl, 10000);
console.log(`PASS public ASR gateway health ${publicHealthUrl}`);
console.log(`PASS public ASR gateway websocket ${publicWsUrl}`);
