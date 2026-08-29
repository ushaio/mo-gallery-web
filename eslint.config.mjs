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
    // Desktop (Wails) 前端构建产物与生成代码
    "desktop/frontend/dist/**",
    "desktop/frontend/wailsjs/**",
    // workspace 包的编译输出
    "packages/*/dist/**",
    // 本地 worktree 与工具/代理的临时状态目录:全部已被 .gitignore 忽略且无跟踪文件。
    // ESLint flat config 不读取 .gitignore,若不在此列出会遍历其中的构建产物
    // (例如嵌套 worktree 的 desktop/frontend/dist 打包文件),导致 lint 堆内存溢出。
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
  ]),
]);

export default eslintConfig;
