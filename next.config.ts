import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const skipBuildChecks = process.env.KEMO_SKIP_BUILD_CHECKS === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: skipBuildChecks,
  },
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate"],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
