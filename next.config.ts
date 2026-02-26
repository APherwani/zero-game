import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In development, proxy WebSocket and API requests to the Wrangler dev server
  async rewrites() {
    return [
      { source: "/ws/:path*", destination: "http://localhost:8787/ws/:path*" },
      { source: "/api/:path*", destination: "http://localhost:8787/api/:path*" },
    ];
  },
};

export default nextConfig;
