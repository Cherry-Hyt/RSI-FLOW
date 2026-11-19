import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'export',
  images: {
    unoptimized: true,
    localPatterns: [
      {
        pathname: "/horsecoder-storage/**",
      },
    ],
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    const storageOrigin = process.env.DEV_STORAGE_ORIGIN;
    return [
      {
        source: "/mall-dialogue/:path*",
        destination: "http://127.0.0.1:30432/:path*",
      },
      {
        source: "/app-im/:path*",
        destination: "http://127.0.0.1:41229/:path*",
      },
      ...(storageOrigin ? [{
        source: "/horsecoder-storage/:path*",
        destination: `${storageOrigin.replace(/\/$/, "")}/:path*`,
      }] : []),
    ];
  },
};

export default nextConfig;
