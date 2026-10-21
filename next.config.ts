import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin proxy.ts matches /api/admin/*; default buffer is 10MB and silently
  // truncates larger bodies (news video allows up to 50MB).
  experimental: {
    proxyClientMaxBodySize: "55mb",
  },
  async redirects() {
    return [
      { source: "/admin/athletes", destination: "/admin/people?profile=athlete", permanent: false },
      { source: "/admin/professionals", destination: "/admin/people?profile=professional", permanent: false },
      { source: "/admin/media", destination: "/admin/people?profile=media", permanent: false },
      { source: "/admin/users", destination: "/admin/people", permanent: false },
      { source: "/admin/users/:id", destination: "/admin/people/:id", permanent: false },
      { source: "/admin/categories", destination: "/admin/people/settings", permanent: false },
      { source: "/admin/gym-categories", destination: "/admin/gyms/settings", permanent: false },
      { source: "/admin/withdrawals", destination: "/admin/finance/payouts?type=withdrawal", permanent: false },
      {
        source: "/admin/coin-redemptions",
        destination: "/admin/finance/payouts?type=coin_redemption",
        permanent: false,
      },
      { source: "/admin/coin-catalog", destination: "/admin/finance/coins?tab=packs", permanent: false },
    ];
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
