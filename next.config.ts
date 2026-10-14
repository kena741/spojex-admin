import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin proxy.ts matches /api/admin/*; default buffer is 10MB and silently
  // truncates larger bodies (news video allows up to 50MB).
  experimental: {
    proxyClientMaxBodySize: "55mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "spojex-backend-prod-576757759417.europe-west3.run.app",
        pathname: "/api/v1/media/**",
      },
    ],
  },
};

export default nextConfig;
