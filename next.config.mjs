import { fileURLToPath } from "node:url";
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // Keep server-only dependencies out of the client and edge bundles.
  serverExternalPackages: [
    "exceljs",
    "pdf-lib",
    "rss-parser",
    "cheerio",
    "playwright",
    "playwright-core",
    "@vercel/functions",
  ],
};

export default nextConfig;
