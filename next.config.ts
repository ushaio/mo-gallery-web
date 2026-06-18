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
    remotePatterns: [
      {
        protocol: "http",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Next.js 16 uses Turbopack by default, which has native async WebAssembly
  // support — @jsquash/avif's dynamic import + WASM works out of the box with
  // no extra rules. The empty turbopack object silences the "webpack config
  // present but no turbopack config" error.
  turbopack: {},
};

export default nextConfig;
