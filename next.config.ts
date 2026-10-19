import type { NextConfig } from "next";

const BUILD_ID = Date.now().toString();

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/login/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  reactStrictMode: false,
  reactCompiler: true,
  output: "standalone",
  // isomorphic-dompurify 在模块顶层（服务端无 window 的分支）就会 new JSDOM()，而
  // jsdom 的 default-stylesheet.css 是用 fs.readFileSync 按相对路径读的资源；被 webpack
  // 打进 .next 后该路径失效，SSR 抛 ENOENT .../default-stylesheet.css。外部化后交给
  // Node 运行时从 node_modules 解析，jsdom 才能读到自己目录下的样式表。
  serverExternalPackages: ["sharp", "@waline/vercel", "isomorphic-dompurify"],
  // sharp 的平台二进制经 @img/* 动态 require，pnpm 默认 isolated 布局用符号链接暴露，
  // Vercel 打包函数时会丢弃 → 见仓库根 .npmrc（node-linker=hoisted）。
  // 共享包以 TS 源码直出（mo-gallery-shared git 依赖），由 Next 编译
  transpilePackages: ["@mo-gallery/tiptap-editor", "@mo-gallery/milkdown", "@mo-gallery/ai-agent", "@mo-gallery/api-client", "@mo-gallery/content-core", "@mo-gallery/public-site", "@mo-gallery/image-pipeline", "@mo-gallery/admin-console"],
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
