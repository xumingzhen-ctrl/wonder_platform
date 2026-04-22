import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  skipTrailingSlashRedirect: true,
  output: "standalone",           // 生成独立服务器，不依赖 node_modules
  images: { unoptimized: true },  // 禁用 sharp（macOS 二进制无法在 Linux 运行）
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ]
  },
};

export default nextConfig;
