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
  serverExternalPackages: ["sharp", "@waline/vercel"],
  // Vercel 的函数产物只包含被 trace 到的文件。sharp 的原生二进制不是通过静态路径
  // 引用的（dist/sharp.cjs 里按 runtimePlatform 拼出 @img/sharp-<platform>/sharp.node），
  // 在 pnpm 布局下真实文件又落在 node_modules/.pnpm/@img+.../node_modules/@img/ 里，
  // trace 漏掉时整个 /api 函数会在加载阶段崩掉并返回空体 500。
  // 这里显式把 @img 平台包（含 libvips 二进制）打进 API 函数。
  // 注意 key 会被 picomatch 当 glob 匹配（collect-build-traces.js 里 `picomatch(curGlob, {contains:true})`），
  // 所以不能写成 "/api/[[...route]]" —— 方括号在 glob 里是字符类，那样写永远匹配不到任何路由。
  // glob 只能指向 .pnpm 下的真实目录：走过 node_modules/sharp、node_modules/@img 这类符号链接时，
  // Vercel 会拒绝打包并报 `The framework produced an invalid deployment package for a Serverless
  // Function. Typically this means that the framework produces files in symlinked directories.`
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/.pnpm/@img*/**/*"],
  },
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
