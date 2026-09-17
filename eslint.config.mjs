import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".tmp-*",
    // 本地 worktree 与工具/代理的临时状态目录:全部已被 .gitignore 忽略且无跟踪文件。
    // ESLint flat config 不读取 .gitignore,若不在此列出会遍历其中的构建产物
    // (例如嵌套 worktree 的 dist 打包文件),导致 lint 堆内存溢出。
    ".worktrees/**",
    ".comet/**",
    ".agents/**",
    ".pi/**",
    ".codex/**",
    ".cursor/**",
    ".opencode/**",
    ".impeccable/**",
    ".codegraph/**",
    ".workbuddy/**",
    ".aeroric/**",
    ".zcode/**",
    ".kilo/**",
    ".kilocode/**",
    "outputs/**",
    "_tmp_*",
    // 共享包镜像（mo-gallery-shared 单向同步生成，见根目录 AGENTS.md）。
    // 它不是本仓库的代码，在本地改会触发同步器的漂移保护；上游源码由 shared 自己负责。
    "packages/**",
  ]),
]);

export default eslintConfig;
