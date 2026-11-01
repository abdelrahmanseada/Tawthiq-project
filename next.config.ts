import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Uploads go through route handlers; this raises the Server Action body limit for
  // small forms. Large spreadsheet/ZIP uploads never use Server Actions.
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Native / heavy libraries must run in Node, not bundled by webpack/turbopack.
  serverExternalPackages: ["@node-rs/argon2", "sharp", "exceljs", "adm-zip", "bullmq", "ioredis"],
  // Ensure Prisma engines and sharp binaries are traced into the standalone image.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
    ],
  },
  eslint: {
    // Linting is a separate CI step (`npm run lint`); keep production builds fast.
    ignoreDuringBuilds: true,
  },
  logging: {
    fetches: { fullUrl: false },
  },
};

export default withNextIntl(nextConfig);
