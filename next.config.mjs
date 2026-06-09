/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep heavy server-only deps out of the client/edge bundle (Next 14 key).
    serverComponentsExternalPackages: ["exceljs", "pdf-lib", "rss-parser", "cheerio"],
  },
};

export default nextConfig;
