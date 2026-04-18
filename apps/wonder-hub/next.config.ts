import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "export" 在正式部署构建时启用
  // 本地开发时注释掉此行以获得完整的 Next.js 功能
//  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
};

export default nextConfig;
