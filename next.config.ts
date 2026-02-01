import type { NextConfig } from "next";

const BUILD_ID = Date.now().toString();

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  reactStrictMode: false,
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: ["sharp", "@waline/vercel"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
