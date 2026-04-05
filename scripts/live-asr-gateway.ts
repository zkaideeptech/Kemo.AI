import { config } from "dotenv";

import {
  ensureAsrGatewayServer,
  shutdownAsrGatewayServer,
} from "@/lib/live/asrGatewayServer";

config({ path: ".env.local" });

async function main() {
  const gateway = await ensureAsrGatewayServer();
  console.log(
    `[LiveASRGateway] ${gateway.mode} gateway ready on ${gateway.httpBaseUrl}`
  );
}

async function shutdown(signal: string) {
  try {
    await shutdownAsrGatewayServer();
    process.exit(0);
  } catch (error) {
    console.error(`[LiveASRGateway] failed to shutdown after ${signal}`, error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch((error) => {
  console.error("[LiveASRGateway] failed to start", error);
  process.exit(1);
});
