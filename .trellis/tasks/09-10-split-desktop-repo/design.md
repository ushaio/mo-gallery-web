# 技术设计：desktop 拆分为独立仓库 + mo-gallery-shared 共享仓库

## 1. 三仓库架构

```
mo-gallery-web (现有仓库)              mo-gallery-shared (新)
├── src/ hono/ server/ prisma/         └── packages/
├── flutter/ (不动)                        ├── api-client/
├── desktop/          ← .gitignore 忽略，  ├── ai-agent/
│   (嵌套独立仓库 = mo-gallery-desktop)    ├── milkdown/
└── packages/ (全部迁出，目录删除)          ├── tiptap-editor/
                                          └── mo-editor/
mo-gallery-desktop (新，即原 desktop/ 内容为仓库根)
├── main.go app.go ... wails.json
├── frontend/          (原 desktop/frontend)
├── storage_plugins/ build/ agent_extensions/ ...
├── packages/
│   ├── desktop-plugin-sdk/
│   └── emulsion-mcp/
└── .github/workflows/release.yml (迁移自 web 仓库)
```

## 2. mo-gallery-shared 仓库

- 结构：`packages/{api-client,ai-agent,milkdown,tiptap-editor,mo-editor}`，包内容原样搬运（TS 源码直出，`main` → `src/index.ts`，无构建）。
- 根配置：`pnpm-workspace.yaml`（`packages/*`）、私有根 `package.json`、`.gitignore`、README。
- 版本与引用：仓库统一 tag（如 `v0.1.0`，与包当前版本一致），消费方引用：
  `"@mo-gallery/api-client": "github:ushaio/mo-gallery-shared#v0.1.0&path:packages/api-client"`
  pnpm 11.22 支持 `#<ref>&path:<subdir>` 语法；lockfile 会锁到具体 commit，可复现。
- 更新流程：改共享包 → push → 打新 tag → 两端 bump 引用 tag。单人开发可先用分支引用过渡（`#main&path:...`），稳定后改为 tag。

## 3. mo-gallery-desktop 仓库

- 初始化方式：直接在现有 `D:\Projects\mo-gallery\mo-gallery-web\desktop` 目录内 `git init`，文件即仓库根（wails.json、main.go 等在根），本地路径不变。
- 组成：原 `desktop/` 全部内容 + 从 web 仓库复制 `packages/desktop-plugin-sdk`、`packages/emulsion-mcp`。
- workspace：新建 `pnpm-workspace.yaml`（`frontend`、`packages/*`），并把 web 仓库 `pnpm-workspace.yaml` 中的 `allowBuilds`（better-sqlite3、exifreader 等桌面端所需）迁移过来。
- 依赖修正：`frontend/package.json` 中 `workspace:*` 共享包改为 shared git 引用；**显式补声明 `@mo-gallery/tiptap-editor`**（现源码引用但未声明，靠 workspace 提升侥幸工作）。
- CI：迁移 web 仓库 release.yml 的 `node-runtime`、`desktop-windows-build`、`desktop-macos-build`、`desktop-linux-build`、`publish` job；版本校验只保留 `frontend/package.json` 与 `wails.json` 自身一致性；RELEASE.md 机制随迁。
- 配套迁移：`.trellis/spec/{desktop-plugin-sdk,emulsion-mcp,mo-gallery-desktop-frontend}`、`.agents/skills/emulsion-mcp` 迁入 desktop 仓库。

## 4. mo-gallery-web 仓库调整

- 停止跟踪：`git rm -r --cached desktop`，`.gitignore` 追加 `desktop/`（防止嵌套仓库被误 add 成 gitlink）。
- `packages/` 整目录迁出删除（7 个包全部离开）。
- `pnpm-workspace.yaml`：移除 `desktop/frontend`；`packages/*` 已无成员可留可删。
- 根 `package.json`：4 个共享包依赖改 shared git 引用；删除 `desktop:plugin:package`、`desktop:mcp:build`、`desktop:runtime:verify` 脚本。
- `next.config.ts` `transpilePackages` 保持不变（git 依赖同样是 node_modules 内 TS 源码，转译行为一致）。
- release.yml：删除 desktop 版本校验条目、desktop 三平台 job、`node-runtime` job、publish 中 desktop 产物下载；保留 web/flutter 版本校验与 tag 流程。
- 文档与 skill：`AGENTS.md`（结构、命令）、`docs/PROJECT_CONTEXT.md`、`.agents/skills/mo-release`（改写为 web 与 desktop 双仓库独立发版）、`.trellis/spec/` 清理迁出目录。

## 5. 兼容性与风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 私有仓库 CI 拉取 git 依赖 | desktop/shared 仓库若私有，GitHub Actions 无法匿名拉取 | 仓库设公开，或配置 `TOKEN` 类 secret 走 https 认证 |
| TS 源码包经 git 依赖进 node_modules | 与 workspace symlink 行为等价，但需实际构建验证 | AC2/AC4 构建验证兜底 |
| tiptap-editor 未声明依赖 | desktop 源码引用但未声明 | 迁移时显式补声明 |
| pnpm-lock 变更规模大 | workspace 协议全部换成 git 引用 | 一次性提交，构建验证 |
| 嵌套仓库误操作 | 父仓库命令误入 desktop 目录 | `.gitignore` + 习惯上在 desktop 内独立执行 pnpm/git |

## 6. 回滚考虑

拆分以"新增仓库 + web 仓库删文件"为主，web 仓库的单次提交可通过 revert 恢复 desktop 跟踪；两个新仓库独立存在，不影响 web 仓库回滚。
