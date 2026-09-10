# 拆分 desktop 为独立仓库并建立 mo-gallery-shared 共享仓库

## Goal

将 `desktop/` 从 mo-gallery-web 拆分为独立 Git 仓库，把 web 与 desktop 共用的 workspace 包抽取到新的 mo-gallery-shared 仓库，mo-gallery-web 仓库不再跟踪 desktop 相关文件。目的是让 desktop 端独立开发、独立提交、独立演进、独立发版。

## 已确认决策

- 三仓库结构：mo-gallery-web（本仓库）/ mo-gallery-desktop（新）/ mo-gallery-shared（新）。
- shared 仓库远端：https://github.com/ushaio/mo-gallery-shared.git
- `mo-editor` 归入共享包（当前 web/desktop 均无直接引用）。
- 共享包通过 pnpm git 依赖引用（语法已验证：`github:ushaio/mo-gallery-shared#vX.Y.Z&path:packages/<name>`）。
- 本地布局：`desktop/` 文件夹保留原位，成为嵌套独立仓库，mo-gallery-web 通过 `.gitignore` 忽略。
- 历史策略：全新开始，两个新仓库均以文件快照 + `git init` 初始化，不保留现仓库提交历史。
- 版本策略：desktop 与 web 版本号独立演进、各自发版，不再保持统一版本号联动。

## 仓库证据（2026-09-10 调查）

- `desktop/` 有 460 个跟踪文件、134 个提交涉及；当前分支 `feat/desktop-storage-plugins` 有大量未提交 desktop 改动。
- workspace 包使用情况（web 引用文件数 / desktop 引用文件数）：api-client 26/27、ai-agent 7/22、milkdown 13/12、tiptap-editor 6/3、mo-editor 0/0、desktop-plugin-sdk 0/0（纯 desktop）、emulsion-mcp 0/0（纯 desktop）。
- `pnpm-workspace.yaml` 含 `desktop/frontend` 与 `packages/*`；`desktop/frontend/package.json` 以 `workspace:*` 依赖 ai-agent、api-client、milkdown。
- 共享包均为 TS 源码直出（`main` 指向 `src/index.ts`），无构建产物，适合 git 依赖。
- `next.config.ts:27` 已有 `transpilePackages: ["@mo-gallery/tiptap-editor", "@mo-gallery/milkdown", "@mo-gallery/ai-agent"]`。
- pnpm 版本 11.22.0（本仓库），git 依赖子目录语法 `#<ref>&path:<subdir>` 官方支持。
- `.github/workflows/release.yml`：版本一致性校验覆盖 web/desktop/flutter；包含 `node-runtime` 与 desktop 三平台构建 job；`publish` job 仅汇总 desktop 产物发布 Release（即该 workflow 实质是 desktop 发版驱动）。
- 根 `package.json` 脚本 `desktop:plugin:package`、`desktop:mcp:build`、`desktop:runtime:verify` 指向 desktop。
- `.agents/skills/emulsion-mcp` 引用 desktop 路径；`.agents/skills/mo-release` 假设统一版本流程。
- `.trellis/spec/` 存在 ai-agent、api-client、desktop-plugin-sdk、emulsion-mcp、mo-editor、mo-gallery-desktop-frontend、tiptap-editor 目录，需随包迁移。

## Requirements

- R1: 新建 mo-gallery-shared 仓库，包含 `api-client`、`ai-agent`、`milkdown`、`tiptap-editor`、`mo-editor` 五个包，推送到已确认远端，打首个版本 tag。
- R2: 新建 mo-gallery-desktop 仓库（原 `desktop/` 内容为仓库根），包含 `desktop-plugin-sdk` 与 `emulsion-mcp`，具备独立 workspace 与构建配置。
- R3: mo-gallery-web 停止跟踪 desktop 相关文件：`.gitignore` 加入 `desktop/`、`git rm -r --cached`，并移除已迁出的 `packages/` 目录；清理根 `package.json` 脚本、`pnpm-workspace.yaml`、`release.yml`、`AGENTS.md`、`docs/PROJECT_CONTEXT.md` 中的 desktop 引用。
- R4: web 与 desktop 通过 pnpm git 依赖（`#tag&path:`）引用 mo-gallery-shared 共享包，替换现有 `workspace:*`。
- R5: desktop 仓库建立自己的 release workflow（迁移 `node-runtime`、三平台构建、publish job），版本号独立于 web。
- R6: mo-gallery-web 的 release workflow 精简为 web 自身发版（移除 desktop 版本校验与 desktop 构建产物发布）；`mo-release` skill 改写为双仓库独立发版流程。
- R7: `.trellis/spec/` 与 `.agents/skills/` 中 desktop/共享包相关内容迁移到对应新仓库，web 仓库清理残留。

## Acceptance Criteria

- [x] AC1: `https://github.com/ushaio/mo-gallery-shared.git` 可克隆，五个共享包结构完整，存在首个版本 tag。
- [x] AC2: mo-gallery-desktop 仓库初始化完成、内容完整（含 desktop-plugin-sdk、emulsion-mcp），`desktop/frontend` 依赖改为 git 引用后前端构建成功。
- [x] AC3: mo-gallery-web 中 `git ls-files desktop` 输出为空，`desktop/` 在 `.gitignore` 中；在 desktop 文件夹内改动文件不出现在 mo-gallery-web 的 `git status`。
- [x] AC4: mo-gallery-web 中 `pnpm install && pnpm run build` 成功（共享包经 git 依赖解析，类型与运行时行为不变）。
- [x] AC5: mo-gallery-web 的 release workflow 无任何 desktop 路径引用；desktop 仓库有自己的 release workflow，二者版本号互不校验。
- [x] AC6: `mo-release` skill 及 AGENTS.md、docs 反映拆分后的仓库结构。

## Out of Scope

- Flutter 端（`flutter/`）的拆分或调整（仍留在 web 仓库，版本继续与 web 联动）。
- 共享包发布到 npm registry（GitHub Packages 等留待将来）。
- desktop 功能性代码修改（拆分以搬运为主，不做行为变更）。

## Preconditions（实施结果）

- P1: 已完成——在途改动以检查点提交 304a616 收尾（未合并 master，等待用户决定）。
- P2: 已提供——https://github.com/ushaio/emulsion-desktop.git，已推送并打 tag v0.8.3。
- P3: 未完全解决——mo-gallery-shared 为私有仓库，而 mo-gallery-web 与 emulsion-desktop 为公开仓库：web 的 Vercel 构建与 desktop 的 CI 拉取共享包都需要 token（desktop release.yml 已内置 SHARED_PKG_TOKEN 可选步骤；Vercel 需用户配置），或将 shared 设为公开。
