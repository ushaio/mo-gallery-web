# 执行计划：desktop 拆分为独立仓库 + mo-gallery-shared 共享仓库

## 前置条件（用户动作 / 确认）

- [ ] P1: 收尾 `feat/desktop-storage-plugins`：提交未提交的 desktop 改动并合并到 master。
- [ ] P2: 提供 mo-gallery-desktop 的 GitHub 远端地址。
- [ ] P3: 确认 shared/desktop 仓库公开性（影响 CI 拉取 git 依赖是否需要 token）。

## 实施步骤

### 阶段 A：创建 mo-gallery-shared

1. 新建工作目录，复制 `packages/{api-client,ai-agent,milkdown,tiptap-editor,mo-editor}` 到 `packages/`。
2. 创建根 `pnpm-workspace.yaml`（`packages/*`）、私有根 `package.json`、`.gitignore`、README。
3. `git init` → commit → remote 添加 `https://github.com/ushaio/mo-gallery-shared.git` → push → 打 tag `v0.1.0` 并推送。
4. 验证：临时目录 `pnpm add github:ushaio/mo-gallery-shared#v0.1.0&path:packages/api-client` 安装成功。

### 阶段 B：创建 mo-gallery-desktop

5. 在现有 `desktop/` 目录内 `git init`（此时 web 仓库尚未 untrack，注意先完成阶段 C 第 8 步再大量操作，或直接按顺序执行）。
6. 复制 web 仓库 `packages/{desktop-plugin-sdk,emulsion-mcp}` 到 desktop 仓库 `packages/`。
7. 配置 desktop 仓库：`pnpm-workspace.yaml`（frontend、packages/*，迁移 allowBuilds）、`.gitignore`、README。
8. `frontend/package.json`：3 个 `workspace:*` 改 shared git 引用，显式补 `@mo-gallery/tiptap-editor`。
9. 迁移 `.github/workflows/release.yml` 相关 job（node-runtime、三平台构建、publish）并适配路径；迁移 RELEASE.md 机制。
10. 迁移 `.trellis/spec/{desktop-plugin-sdk,emulsion-mcp,mo-gallery-desktop-frontend}` 与 `.agents/skills/emulsion-mcp`。
11. commit → push（待 P2 地址）。

### 阶段 C：mo-gallery-web 清理

12. `.gitignore` 追加 `desktop/`；`git rm -r --cached desktop`。
13. `git rm -r packages/`（7 个包全部迁出）。
14. `pnpm-workspace.yaml` 移除 `desktop/frontend` 与 `packages/*`。
15. 根 `package.json`：4 个共享依赖改 `github:ushaio/mo-gallery-shared#v0.1.0&path:...`；删除 3 个 desktop 脚本。
16. `release.yml`：移除 desktop 版本校验、desktop job、desktop 产物发布；保留 web/flutter 校验。
17. 更新 `AGENTS.md`、`docs/PROJECT_CONTEXT.md`、`.agents/skills/mo-release`（双仓库独立发版流程）；清理 `.trellis/spec/` 迁出目录。
18. commit。

### 阶段 D：验证

19. web：`pnpm install && pnpm run build` 成功。
20. desktop 仓库内：`pnpm install && pnpm --filter mo-gallery-desktop-frontend build` 成功。
21. `git ls-files desktop` 为空；改动 desktop 内文件后 web 仓库 `git status` 干净。
22. web release.yml 与 desktop release.yml 语法校验（actionlint 或 push 后观察）。

## 验证命令

```bash
# web 仓库
pnpm install && pnpm run build
git ls-files desktop        # 期望无输出
git check-ignore desktop/   # 期望输出 desktop/
# desktop 仓库（desktop/ 内）
pnpm install && pnpm --filter mo-gallery-desktop-frontend build
```

## 风险文件与回滚点

- web 仓库阶段 C 为单次提交，revert 即可整体回滚。
- `pnpm-lock.yaml` 大范围重写在阶段 C 提交中，回滚同上。
- 阶段 A push tag `v0.1.0` 后如需调整，只能追加新 tag，不可改写（消费方 lockfile 已锁 commit）。
